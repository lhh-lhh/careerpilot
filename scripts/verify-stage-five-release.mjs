import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { createServer } from "node:net";
import { scanReleaseTree } from "./delivery-packages.mjs";
const project = resolve("."),
  extraction = await mkdtemp(join(tmpdir(), "careerpilot-stage-five-release-")),
  root = join(extraction, "source");
const zip = join(
  project,
  "artifacts/stage-five-release/careerpilot-source.zip",
);
const env = { ...process.env };
for (const k of Object.keys(env))
  if (k.startsWith("CAREERPILOT_")) delete env[k];
const children = new Set(),
  report = {
    at: new Date().toISOString(),
    status: "running",
    extraction,
    checks: {},
    limitations: [
      "loopback / single Node SQLite; not public production acceptance",
      "Operator database, accounts, passwords and fetched index excluded",
    ],
  };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function run(exe, args, cwd = root, vars = env) {
  return new Promise((done, reject) => {
    const child = spawn(exe, args, {
      cwd,
      env: vars,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.add(child);
    child.stdout.resume();
    child.stderr.resume();
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("Command timeout"));
    }, 180000);
    child.once("error", (e) => {
      clearTimeout(timer);
      children.delete(child);
      reject(e);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      children.delete(child);
      if (code === 0) done();
      else reject(Error("Command failed: " + args.slice(0, 3).join(" ")));
    });
  });
}
async function stop(child) {
  if (child.exitCode === null) {
    const end = new Promise((r) => child.once("exit", r));
    child.kill();
    await end;
  }
  children.delete(child);
}
async function start(database) {
  const probe = createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "server/cli.ts", "start"],
    {
      cwd: root,
      env: {
        ...env,
        CAREERPILOT_DATABASE: database,
        CAREERPILOT_PORT: String(port),
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  children.add(child);
  child.stdout.resume();
  child.stderr.resume();
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw Error("Service exited");
    try {
      const r = await fetch(origin + "/api/health");
      if (r.ok) {
        assert.deepEqual(await r.json(), { status: "ok", schema: 4 });
        return { child, origin };
      }
    } catch {
      /*startup only*/
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Readiness timeout");
}
async function login(origin, body) {
  const r = await fetch(origin + "/api/session", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(r.status, 200);
  return {
    ...(await r.json()),
    cookie: r.headers.get("set-cookie").split(";")[0],
  };
}
try {
  await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${zip.replaceAll("'", "''")}','${root.replaceAll("'", "''")}')`,
    ],
    project,
  );
  const manifest = JSON.parse(
    await readFile(join(root, "release-manifest.json"), "utf8"),
  );
  assert.equal(manifest.securityScan.status, "passed");
  assert.deepEqual(await scanReleaseTree(root), []);
  const actual = [];
  async function walk(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else actual.push(relative(root, p).replaceAll("\\", "/"));
    }
  }
  await walk(root);
  assert.deepEqual(
    actual.filter((p) => p !== "release-manifest.json").sort(),
    manifest.files.map((f) => f.path).sort(),
  );
  for (const f of manifest.files) {
    assert(
      !f.path
        .split("/")
        .some((p) =>
          ["server-data", "node_modules", ".env", ".git"].includes(p),
        ),
    );
    assert(!/\.(sqlite|key|pem|pfx)$/i.test(f.path));
    const bytes = await readFile(join(root, f.path));
    assert.equal(bytes.length, f.bytes);
    assert.equal(hash(bytes), f.sha256);
  }
  assert(actual.includes("docs/stage-five-runbook.md"));
  assert(actual.includes("server/opportunities.ts"));
  report.package = {
    files: manifest.files.length,
    sha256: hash(await readFile(zip)),
    manifest: "matched",
    securityScan: "passed",
  };
  const npm = join(
    dirname(process.execPath),
    "node_modules/npm/bin/npm-cli.js",
  );
  for (const args of [["ci"], ["run", "typecheck"], ["run", "build"]])
    await run(process.execPath, [npm, ...args]);
  report.checks.cleanInstallTypecheckBuild = "passed";
  console.log("Fresh extracted install, typecheck and build passed.");
  const database = join(extraction, "service.sqlite"),
    sheet = join(extraction, "credentials.json");
  await run(
    process.execPath,
    ["--import", "tsx", "server/cli.ts", "init", "--credentials-file", sheet],
    root,
    { ...env, CAREERPILOT_DATABASE: database },
  );
  const credentials = JSON.parse(await readFile(sheet, "utf8"));
  assert.equal(credentials.length, 5);
  let service = await start(database);
  assert.equal((await fetch(service.origin + "/")).status, 200);
  assert.match(
    await (await fetch(service.origin + "/runtime.js")).text(),
    /ONLINE__=true/,
  );
  const list = await (
    await fetch(service.origin + "/api/public/opportunities")
  ).json();
  assert.equal(list.total, 0);
  const roles = new Set();
  for (const c of credentials) {
    const s = await login(service.origin, c);
    roles.add(s.actor.role);
    assert.equal(s.accountStatus, "approved");
    const out = await fetch(service.origin + "/api/logout", {
      method: "POST",
      headers: {
        Origin: service.origin,
        Cookie: s.cookie,
        "X-CSRF-Token": s.csrf,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(out.status, 200);
  }
  assert.equal(roles.size, 4);
  report.checks.initialAccounts = "5 logins / 4 roles / logout passed";
  const registration = {
    login: "release.student",
    password: "Release-test-Password!",
    displayName: "林川",
    role: "student",
    studentNo: "2027999988",
    majorId: "major-1",
    cohortYear: 2027,
  };
  assert.equal(
    (
      await fetch(service.origin + "/api/register", {
        method: "POST",
        headers: { Origin: service.origin, "Content-Type": "application/json" },
        body: JSON.stringify(registration),
      })
    ).status,
    201,
  );
  await stop(service.child);
  service = await start(database);
  const pending = await login(service.origin, registration);
  assert.equal(pending.accountStatus, "pending");
  assert.equal(
    (
      await fetch(service.origin + "/api/opportunity-records", {
        headers: { Cookie: pending.cookie },
      })
    ).status,
    403,
  );
  for (const path of [
    "/server-data/service.sqlite",
    "/.env",
    "/server/auth.ts",
  ])
    assert.equal((await fetch(service.origin + path)).status, 404);
  await stop(service.child);
  report.checks.registrationRestartAuthorization = "passed";
  report.checks.cleanIndex = "empty, no external fixture or operator data";
  report.status = "passed";
} catch (e) {
  report.status = "failed";
  report.failure = e instanceof Error ? e.message : "unknown";
  process.exitCode = 1;
} finally {
  for (const c of [...children]) await stop(c);
  report.completedAt = new Date().toISOString();
  await writeFile(
    join(project, "artifacts/stage-five-release-verification.json"),
    JSON.stringify(report, null, 2),
  );
  console.log("Fifth-stage delivery verification: " + report.status);
}
