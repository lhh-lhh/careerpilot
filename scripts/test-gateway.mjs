import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const python = fileURLToPath(
  new URL(
    process.platform === "win32"
      ? "../gateway/.venv/Scripts/python.exe"
      : "../gateway/.venv/bin/python",
    import.meta.url,
  ),
);
const child = spawn(
  python,
  ["-X", "utf8", "-m", "pytest", "gateway/tests", "-m", "not live"],
  { cwd: root, stdio: "inherit", shell: false },
);
child.on("error", () => {
  console.error(
    "缺少 gateway 专用运行环境，请先运行独立 setup-gateway；测试未执行。",
  );
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
