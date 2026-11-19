import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const run = (exe, args) =>
  new Promise((yes, no) => {
    const child = spawn(exe, args, {
      cwd: root,
      stdio: "inherit",
      shell: false,
      windowsHide: true,
    });
    child.once("error", no);
    child.once("exit", (code) =>
      code === 0 ? yes() : no(Error("GATEWAY_SETUP_FAILED")),
    );
  });
// Deployment preparation only. Day-to-day launch never calls this script.
try {
  const executable = process.argv
    .find((arg) => arg.startsWith("--python="))
    ?.slice(9);
  const exe = executable ?? (process.platform === "win32" ? "py" : "python3");
  const prefix = executable || process.platform !== "win32" ? [] : ["-3.13"];
  await run(exe, [
    ...prefix,
    "-c",
    "import sys; assert (3,11)<=sys.version_info[:2]<(3,14), 'Python 3.11-3.13 required'",
  ]);
  await run(exe, [...prefix, "-m", "venv", resolve(root, "gateway/.venv")]);
  await run(
    resolve(
      root,
      process.platform === "win32"
        ? "gateway/.venv/Scripts/python.exe"
        : "gateway/.venv/bin/python",
    ),
    [
      "-m",
      "pip",
      "install",
      "--disable-pip-version-check",
      "-r",
      resolve(root, "gateway/requirements.lock"),
    ],
  );
} catch {
  console.error(
    "网关准备失败。需要 Python 3.11–3.13；可用 --python=绝对路径 指定。没有读取凭据或调用模型。",
  );
  process.exitCode = 1;
}
