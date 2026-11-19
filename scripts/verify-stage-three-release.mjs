import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { scanReleaseTree } from "./delivery-packages.mjs";

// Test driver only. Never reads production databases or prints initialized passwords.
const project = resolve(fileURLToPath(new URL("../", import.meta.url)));
const extraction = await mkdtemp(
  join(tmpdir(), "careerpilot-stage-three-release-"),
);
const reportPath = join(
  project,
  "artifacts",
  "stage-three-release-verification.json",
);
const report = {
  measuredAt: new Date().toISOString(),
  status: "running",
  extraction,
  packages: [],
  staticChecks: {},
  source: {},
  deployment: {},
  limitations: [
    "loopback / fictional accounts / SQLite single process",
    "No TLS, WAN, PostgreSQL, real identity, real DeepSeek or production capacity acceptance",
  ],
};
const npmCli = join(
  dirname(process.execPath),
  "node_modules",
  "npm",
  "bin",
  "npm-cli.js",
);
const taskEnv = { ...process.env };
for (const key of Object.keys(taskEnv))
  if (key.startsWith("CAREERPILOT_")) delete taskEnv[key];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const children = new Set();
function run(executable, args, cwd, env = taskEnv, timeout = 180000) {
  return new Promise((done, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.add(child);
    let output = "";
    child.stdout.on("data", (b) => {
      output += b;
    });
    child.stderr.on("data", (b) => {
      output += b;
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("Command timed out: " + args[0]));
    }, timeout);
    child.once("error", (e) => {
      clearTimeout(timer);
      children.delete(child);
      reject(e);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      children.delete(child);
      if (code === 0) done(output);
      else
        reject(
          Error(
            "Command failed (output withheld to protect init credentials): " +
              args.slice(0, 3).join(" ") +
              " exit=" +
              code,
          ),
        );
    });
  });
}
async function extract(zip, name) {
  const target = join(extraction, name);
  await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${zip.replaceAll("'", "''")}', '${target.replaceAll("'", "''")}')`,
    ],
    project,
  );
  return target;
}
async function verify(zip, name, manifestName) {
  const root = await extract(zip, name),
    manifest = JSON.parse(await readFile(join(root, manifestName), "utf8"));
  assert.equal(manifest.securityScan.status, "passed");
  assert.deepEqual(manifest.securityScan.findings, []);
  assert.deepEqual(await scanReleaseTree(root), []);
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files.push(relative(root, path).replaceAll("\\", "/"));
    }
  }
  await walk(root);
  assert.deepEqual(
    files.filter((p) => p !== manifestName).sort(),
    manifest.files.map((f) => f.path).sort(),
  );
  for (const file of manifest.files) {
    assert(
      !file.path
        .split("/")
        .some((s) =>
          ["node_modules", "server-data", ".venv", ".git", "work"].includes(s),
        ),
    );
    assert(!/\.(sqlite|sqlite-wal|sqlite-shm|pem|key|pfx)$/i.test(file.path));
    const bytes = await readFile(join(root, file.path));
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(hash(bytes), file.sha256, file.path);
  }
  report.packages.push({
    name,
    files: manifest.files.length,
    securityScan: "passed",
    hashes: "matched",
    zipSha256: hash(await readFile(zip)),
  });
  return root;
}
async function port() {
  const server = createServer();
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const value = server.address().port;
  await new Promise((done) => server.close(done));
  return value;
}
async function start(root, databasePath) {
  const value = await port(),
    env = {
      ...taskEnv,
      CAREERPILOT_DATABASE: databasePath,
      CAREERPILOT_PORT: String(value),
    };
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "server/cli.ts", "start"],
    { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  children.add(child);
  child.stdout.resume();
  child.stderr.resume();
  const origin = `http://127.0.0.1:${value}`;
  for (let n = 0; n < 80; n++) {
    if (child.exitCode !== null) throw Error("Source CLI exited before ready");
    try {
      if ((await fetch(origin + "/runtime.js")).status === 200)
        return { origin, child };
    } catch {
      /* A refused connection is expected while the CLI starts. */
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw Error("Source CLI not ready");
}
async function stop(child) {
  if (child.exitCode !== null) {
    children.delete(child);
    return;
  }
  const exited = new Promise((done) => child.once("exit", done));
  child.kill();
  await exited;
  children.delete(child);
}
async function login(origin, login, password) {
  const response = await fetch(origin + "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ login, password }),
  });
  assert.equal(response.status, 200);
  const { csrf } = await response.json(),
    cookie = response.headers.get("set-cookie").split(";")[0];
  return {
    cookie,
    read: (path) => fetch(origin + path, { headers: { Cookie: cookie } }),
    post: (path, body) =>
      fetch(origin + path, {
        method: "POST",
        headers: {
          Cookie: cookie,
          "X-CSRF-Token": csrf,
          "Content-Type": "application/json",
          Origin: origin,
        },
        body: JSON.stringify(body),
      }),
  };
}
let staticServer;
try {
  console.log("Verifying package inventories, hashes and secret exclusions.");
  const release = join(project, "artifacts", "release");
  const demo = await verify(
    join(release, "careerpilot-demo.zip"),
    "careerpilot-demo",
    "manifest.json",
  );
  const source = await verify(
    join(release, "careerpilot-source.zip"),
    "careerpilot-source",
    "release-manifest.json",
  );
  const { createStaticServer } = await import(
    pathToFileURL(join(demo, "scripts", "start-demo.mjs")).href
  );
  staticServer = createStaticServer(join(demo, "dist"));
  await new Promise((done, reject) => {
    staticServer.once("error", reject);
    staticServer.listen(0, "127.0.0.1", done);
  });
  const staticOrigin = `http://127.0.0.1:${staticServer.address().port}`;
  for (const [path, status] of [
    ["/", 200],
    ["/runtime.js", 200],
    ["/media/campus-ai.jpg", 200],
    ["/media/campus.jpg", 200],
    ["/package.json", 404],
    ["/server/app.ts", 404],
    ["/server-data/careerpilot.sqlite", 404],
  ]) {
    const response = await fetch(staticOrigin + path);
    assert.equal(response.status, status, path);
    if (path === "/runtime.js") assert.match(await response.text(), /false/);
    report.staticChecks[path] = status;
  }
  await new Promise((done) => staticServer.close(done));
  staticServer = null;
  console.log(
    "Installing locked dependencies and rebuilding the extracted source (no development node_modules).",
  );
  await run(process.execPath, [npmCli, "ci", "--no-fund"], source);
  // sharp has packaged platform binaries; the ordinary build must actually run successfully.
  await run(process.execPath, [npmCli, "run", "typecheck"], source);
  await run(process.execPath, [npmCli, "run", "build"], source);
  report.source = {
    npmCi: "passed",
    typecheck: "passed",
    build: "passed",
    developmentDependenciesReused: false,
  };
  const databasePath = join(extraction, "data", "pilot.sqlite");
  const initialized = await run(
    process.execPath,
    ["--import", "tsx", "server/cli.ts", "init"],
    source,
    { ...taskEnv, CAREERPILOT_DATABASE: databasePath },
  );
  const passwords = new Map(
    initialized
      .split(/\r?\n/)
      .filter((line) => line.includes("\t"))
      .map((line) => line.split("\t")),
  );
  assert(passwords.has("student001"));
  assert(passwords.has("admin"));
  let current = await start(source, databasePath);
  assert.match(
    await (await fetch(current.origin + "/runtime.js")).text(),
    /true/,
  );
  for (const path of [
    "/server/app.ts",
    "/package.json",
    "/server-data/careerpilot.sqlite",
  ])
    assert.equal((await fetch(current.origin + path)).status, 404);
  let student = await login(
    current.origin,
    "student001",
    passwords.get("student001"),
  );
  let admin = await login(current.origin, "admin", passwords.get("admin"));
  assert.equal((await student.read("/api/ai/status")).status, 200);
  assert.equal(
    (await (await student.read("/api/ai/status")).json()).enabled,
    false,
  );
  const ticketId = randomUUID(),
    commandId = randomUUID();
  const created = await student.post("/api/commands", {
    type: "CREATE_TICKET",
    entityId: ticketId,
    expectedRevision: 0,
    commandId,
    payload: { body: "交付副本恢复演练，请核对站内服务状态。" },
  });
  assert.equal(created.status, 200);
  assert.equal(
    (await student.post("/api/bookmarks", { jobId: "job-001", saved: true }))
      .status,
    200,
  );
  const attachment = await student.post("/api/attachments", {
    fileName: "delivery-test.pdf",
    mime: "application/pdf",
    base64: Buffer.from("%PDF-isolated-release-test").toString("base64"),
  });
  assert.equal(attachment.status, 200);
  const file = await attachment.json();
  const oldCookie = student.cookie;
  const snapshot = join(extraction, "snapshot");
  await run(
    process.execPath,
    ["--import", "tsx", "server/cli.ts", "backup", databasePath, snapshot],
    source,
  );
  await stop(current.child);
  const previousArg = process.argv.indexOf("--previous");
  if (previousArg < 0 || !process.argv[previousArg + 1])
    throw Error(
      "Pass --previous <retained previous source ZIP> to exercise a real distinct version rollback",
    );
  const previousZip = resolve(process.argv[previousArg + 1]);
  assert.notEqual(
    hash(await readFile(previousZip)),
    report.packages.find((p) => p.name === "careerpilot-source").zipSha256,
  );
  const previous = await verify(
    previousZip,
    "previous-source",
    "release-manifest.json",
  );
  await run(process.execPath, [npmCli, "ci", "--no-fund"], previous);
  await run(process.execPath, [npmCli, "run", "build"], previous);
  const oldHtml = await readFile(join(previous, "dist", "index.html"), "utf8"),
    newHtml = await readFile(join(source, "dist", "index.html"), "utf8");
  assert.notEqual(oldHtml, newHtml);
  console.log(
    "Exercising stop/start version rollback, forward switch and a fresh-directory database restore.",
  );
  const rollback = await start(previous, databasePath),
    rollbackClient = await login(
      rollback.origin,
      "student001",
      passwords.get("student001"),
    );
  assert.equal(
    (await rollbackClient.read("/api/read/readScopedSnapshot")).status,
    200,
  );
  assert.deepEqual(await (await rollbackClient.read("/api/bookmarks")).json(), [
    "job-001",
  ]);
  await stop(rollback.child);
  current = await start(source, databasePath);
  student = await login(
    current.origin,
    "student001",
    passwords.get("student001"),
  );
  admin = await login(current.origin, "admin", passwords.get("admin"));
  assert(
    (await (await student.read("/api/read/readTickets")).json()).some(
      (t) => t.id === ticketId && t.status === "open",
    ),
  );
  assert.equal(
    (
      await admin.post("/api/commands", {
        type: "TICKET_ACTION",
        entityId: ticketId,
        expectedRevision: 1,
        commandId: randomUUID(),
        payload: {
          action: "REPLY",
          text: "前向切换后可继续答复，接下来验证快照回退。",
        },
      })
    ).status,
    200,
  );
  await stop(current.child);
  const restoredDir = join(extraction, "restored");
  await run(
    process.execPath,
    ["--import", "tsx", "server/cli.ts", "restore", snapshot, restoredDir],
    source,
  );
  const restored = await start(source, join(restoredDir, "careerpilot.sqlite"));
  assert.equal(
    (
      await fetch(restored.origin + "/api/session", {
        headers: { Cookie: oldCookie },
      })
    ).status,
    401,
  );
  student = await login(
    restored.origin,
    "student001",
    passwords.get("student001"),
  );
  admin = await login(restored.origin, "admin", passwords.get("admin"));
  const ticket = (
    await (await student.read("/api/read/readTickets")).json()
  ).find((t) => t.id === ticketId);
  assert.equal(ticket.status, "open");
  assert.equal(ticket.revision, 1);
  assert.equal((await student.read(`/api/attachments/${file.id}`)).status, 200);
  assert.deepEqual(await (await student.read("/api/bookmarks")).json(), [
    "job-001",
  ]);
  assert.equal(
    (
      await student.post("/api/commands", {
        type: "CREATE_TICKET",
        entityId: ticketId,
        expectedRevision: 0,
        commandId,
        payload: { body: "交付副本恢复演练，请核对站内服务状态。" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await admin.post("/api/commands", {
        type: "TICKET_ACTION",
        entityId: ticketId,
        expectedRevision: 1,
        commandId: randomUUID(),
        payload: { action: "REPLY", text: "恢复后重新答复，确认办理可继续。" },
      })
    ).status,
    200,
  );
  await stop(restored.child);
  report.deployment = {
    sourceCli: "passed",
    defaultAiDisabled: true,
    versionRollback: "passed (actual retained previous source ZIP)",
    forwardSwitch: "passed",
    backupWithWal: "passed",
    freshDirectoryRestore: "passed",
    oldSessionsRevoked: true,
    attachmentsAndBookmarks: "preserved",
    idempotentReceipt: "preserved",
    resumeWorkAfterRestore: "passed",
    zeroDowntime: false,
    rollbackDataWarning:
      "Restoring a snapshot intentionally discards writes committed after that snapshot; operator must assess and preserve them.",
  };
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failure = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  for (const child of children) await stop(child);
  if (staticServer) await new Promise((done) => staticServer.close(done));
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(
    "Release verification " + report.status + "; report: " + reportPath,
  );
  console.log(
    "Temporary fictional QA data retained for inspection: " + extraction,
  );
}
