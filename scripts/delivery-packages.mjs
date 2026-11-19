import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

const SOURCE_FILES = [
  ".gitignore",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "eslint.config.js",
  "index.html",
  "package-lock.json",
  "package.json",
  "playwright.config.ts",
  "start-demo.cmd",
  "start-service.cmd",
  "start-project.cmd",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
];
const SOURCE_DIRECTORIES = [
  "docs",
  "gateway",
  "public",
  "scripts",
  "server",
  "src",
  "tests",
];
const EXCLUDED_SEGMENTS = new Set([
  ".git",
  ".pytest_cache",
  ".venv",
  "__pycache__",
  "artifacts",
  "coverage",
  "dist",
  "node_modules",
  "outputs",
  "server-data",
  "playwright-report",
  "test-results",
  "work",
]);
const TEXT_EXTENSIONS = new Set([
  "",
  ".cmd",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".toml",
  ".ts",
  ".txt",
  ".vue",
  ".yaml",
  ".yml",
]);

function isInside(parent, child) {
  const path = relative(resolve(parent), resolve(child));
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`);
}

async function prepareDestination(outputRoot, name) {
  const root = resolve(outputRoot);
  const destination = resolve(root, name);
  if (!isInside(root, destination)) throw Error("INVALID_RELEASE_DESTINATION");
  await mkdir(root, { recursive: true });
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  return destination;
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyRequired(source, destination) {
  if (!(await pathExists(source)))
    throw Error(`RELEASE_INPUT_MISSING: ${source}`);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}

function sourceFilter(source, projectRoot) {
  const path = relative(projectRoot, source).replaceAll("\\", "/");
  const segments = path.split("/");
  if (segments.some((segment) => EXCLUDED_SEGMENTS.has(segment))) return false;
  const name = basename(source).toLowerCase();
  if (name === ".env.example") return true;
  if (name === ".env" || name.startsWith(".env.")) return false;
  return !name.endsWith(".log") && !name.endsWith(".pyc");
}

async function copySourceEntry(source, destination, projectRoot) {
  if (!(await pathExists(source))) return;
  const info = await stat(source);
  if (!sourceFilter(source, projectRoot)) return;
  if (info.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const entry of await readdir(source))
      await copySourceEntry(
        join(source, entry),
        join(destination, entry),
        projectRoot,
      );
    return;
  }
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { force: true });
}

async function listFiles(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else files.push(path);
    }
  }
  await visit(root);
  return files.sort((a, b) => a.localeCompare(b, "en"));
}

async function fileManifest(root, excluded = new Set()) {
  const files = [];
  for (const path of await listFiles(root)) {
    const name = relative(root, path).replaceAll("\\", "/");
    if (excluded.has(name)) continue;
    const body = await readFile(path);
    files.push({
      path: name,
      bytes: body.byteLength,
      sha256: createHash("sha256").update(body).digest("hex"),
    });
  }
  return files;
}

function suspiciousValue(value) {
  return !/(?:fake|test|example|dummy|not[-_ ]?real|placeholder)/i.test(value);
}

export async function scanReleaseTree(root) {
  const findings = [];
  for (const path of await listFiles(root)) {
    const relativePath = relative(root, path).replaceAll("\\", "/");
    const name = basename(path).toLowerCase();
    if (
      (name === ".env" || name.startsWith(".env.")) &&
      name !== ".env.example"
    )
      findings.push(`${relativePath}: forbidden environment file`);
    if (/\.(?:key|p12|pfx|pem)$/i.test(name))
      findings.push(`${relativePath}: forbidden credential file`);
    const extension = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
    if (!TEXT_EXTENSIONS.has(extension)) continue;
    const body = await readFile(path, "utf8");
    for (const match of body.matchAll(/\bsk-[A-Za-z0-9_-]{20,}\b/g))
      if (suspiciousValue(match[0]))
        findings.push(`${relativePath}: suspicious API key shape`);
    for (const match of body.matchAll(
      /(?:AI_API_KEY|DEEPSEEK_API_KEY)[ \t]*=[ \t]*([^\s#][^\r\n]*)/g,
    ))
      if (suspiciousValue(match[1]))
        findings.push(`${relativePath}: configured API key value`);
  }
  return [...new Set(findings)].sort();
}

async function writeManifest(destination, filename, extra = {}) {
  const findings = await scanReleaseTree(destination);
  const manifest = {
    product: "路鸣职引 CareerPilot",
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    ...extra,
    securityScan: {
      status: findings.length ? "failed" : "passed",
      findings,
    },
    files: await fileManifest(destination, new Set([filename])),
  };
  await writeFile(
    join(destination, filename),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  if (findings.length) throw Error(`RELEASE_SECURITY_SCAN_FAILED\n${findings.join("\n")}`);
}

async function createZip(directory) {
  if (process.platform !== "win32") return null;
  const archive = `${directory}.zip`;
  await rm(archive, { force: true });
  const command = [
    `$source = ${JSON.stringify(directory)}`,
    `$target = ${JSON.stringify(archive)}`,
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    "[System.IO.Compression.ZipFile]::CreateFromDirectory($source, $target, [System.IO.Compression.CompressionLevel]::Optimal, $false)",
  ].join("; ");
  await new Promise((resolvePromise, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      { stdio: "inherit", shell: false },
    );
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolvePromise()
        : reject(Error(`RELEASE_ARCHIVE_FAILED: ${code}`)),
    );
  });
  return archive;
}

export async function buildDemoPackage({
  projectRoot,
  outputRoot,
  archive = true,
}) {
  const root = resolve(projectRoot);
  const destination = await prepareDestination(outputRoot, "careerpilot-demo");
  await copyRequired(join(root, "dist"), join(destination, "dist"));
  await copyRequired(
    join(root, "scripts", "start-demo.mjs"),
    join(destination, "scripts", "start-demo.mjs"),
  );
  await copyRequired(
    join(root, "start-demo.cmd"),
    join(destination, "start-demo.cmd"),
  );
  await writeFile(
    join(destination, "README.md"),
    `# 路鸣职引 CareerPilot 离线演示包

运行前提：Windows 与预装 Node.js >=22.12 且 <25。双击 \`start-demo.cmd\`，或在本目录运行 \`node scripts/start-demo.mjs\`，然后访问 http://127.0.0.1:4173/#/login 。

本包无需也不执行 \`npm install\`，不会下载依赖、构建源码、启动 Python 网关或读取 AI 密钥。它只服务 \`dist/\` 内的本地静态资源；4173 端口占用时会停止。按 Ctrl+C 关闭服务。

所有演示数据均为虚构。离线确定性业务演示仍可运行；AI生成不可用，不会用预设、回放或规则内容代答。真实DeepSeek功能需使用同源在线服务与服务端密钥，不属于此离线演示包。
`,
    "utf8",
  );
  await writeManifest(destination, "manifest.json", {
    packageType: "offline-demo",
    runtime: "Node.js >=22.12 <25",
    networkRequired: false,
  });
  if (archive) await createZip(destination);
  return destination;
}

export async function buildSourcePackage({
  projectRoot,
  outputRoot,
  archive = true,
}) {
  const root = resolve(projectRoot);
  const destination = await prepareDestination(outputRoot, "careerpilot-source");
  for (const file of SOURCE_FILES)
    await copySourceEntry(join(root, file), join(destination, file), root);
  for (const directory of SOURCE_DIRECTORIES)
    await copySourceEntry(
      join(root, directory),
      join(destination, directory),
      root,
    );
  await writeManifest(destination, "release-manifest.json", {
    packageType: "source",
    allowlist: [...SOURCE_FILES, ...SOURCE_DIRECTORIES.map((path) => `${path}/`)],
    exclusions: [...EXCLUDED_SEGMENTS].sort(),
  });
  if (archive) await createZip(destination);
  return destination;
}
