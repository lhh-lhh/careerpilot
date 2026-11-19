import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const python = resolve(
  root,
  "gateway",
  process.platform === "win32"
    ? ".venv/Scripts/python.exe"
    : ".venv/bin/python",
);
function waitForReady(child, prefix, validate, timeoutCode) {
  return new Promise((resolve, reject) => {
    let buffer = "", settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout?.off("data", line);
      child.off("error", failed);
      child.off("exit", exited);
      if (error) reject(error); else resolve(value);
    };
    const line = (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > 8192) return finish(Error("READY_INVALID"));
      while (buffer.includes("\n") && !settled) {
        const end = buffer.indexOf("\n"), text = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (text.startsWith(prefix)) {
          try {
            const value = JSON.parse(text.slice(prefix.length));
            if (!validate(value)) throw Error();
            finish(null, value);
          } catch { finish(Error("READY_INVALID")); }
        }
      }
    };
    const failed = () => finish(Error("CHILD_START_FAILED"));
    const exited = () => finish(Error("CHILD_EXITED"));
    const timer = setTimeout(() => finish(Error(timeoutCode)), 10000);
    child.stdout?.on("data", line);
    child.once("error", failed);
    child.once("exit", exited);
  });
}
const defaults = {
  webReady(child) {
    return waitForReady(child, "CAREERPILOT_WEB_READY ", value => value.pid === child.pid && value.port === 4173, "WEB_START_TIMEOUT");
  },
  async validate() {
    const [major, minor] = process.versions.node.split(".").map(Number);
    if (major < 22 || major >= 25 || (major === 22 && minor < 12))
      throw Error("NODE_VERSION_UNSUPPORTED");
    await access(resolve(root, "dist/index.html"));
  },
  async available(port) {
    return new Promise((resolve) => {
      const probe = createServer();
      probe.once("error", () => resolve(false));
      probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
    });
  },
  async pythonExists() {
    try {
      await access(python);
      return true;
    } catch {
      return false;
    }
  },
  spawnChild: spawn,
  log: console.log,
  onUnexpectedExit() {},
};
export async function startProject({ mode = "auto", dependencies = {} } = {}) {
  if (!["auto", "live", "offline"].includes(mode)) throw Error("INVALID_MODE");
  const deps = { ...defaults, ...dependencies };
  await deps.validate();
  if (!(await deps.available(4173))) throw Error("PORT_4173_BUSY");
  let gateway = null,
    stopped = false;
  const web = deps.spawnChild(
    process.execPath,
    [resolve(root, "scripts/start-demo.mjs")],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"], shell: false, windowsHide: true },
  );
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    for (const child of [gateway, web]) {
      if (!child || child.killed || child.exitCode != null) continue;
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          deps.log(`子进程尚未退出，请手动检查 PID ${child.pid}。`);
          resolve();
        }, 2000);
        timer.unref?.();
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
        child.kill("SIGTERM");
      });
    }
  };
  const fail = async (code) => {
    if (mode === "live") {
      await stop();
      throw Error(code);
    }
    deps.log(`${code} · 继续离线 REPLAY，不会自动安装或发起模型调用。`);
  };
  const webExited = () => {
    if (!stopped) { deps.onUnexpectedExit("WEB_EXITED"); void stop(); }
  };
  web.on("error", webExited);
  web.on("exit", webExited);
  try {
    await deps.webReady(web);
    if (stopped) throw Error("WEB_EXITED");
    web.stdout?.pipe(process.stdout);
    web.stderr?.pipe(process.stderr);
  } catch (error) { await stop(); throw error; }
  try {
  if (mode !== "offline") {
    if (!(await deps.available(8787))) await fail("PORT_8787_BUSY");
    else if (!(await deps.pythonExists())) await fail("GATEWAY_ENV_MISSING");
    else {
      const instanceId = randomUUID();
      const child = deps.spawnChild(python, ["-X", "utf8", "-m", "app.run"], {
        cwd: resolve(root, "gateway"),
        env: { ...process.env, CAREERPILOT_INSTANCE_ID: instanceId },
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
      });
      gateway = child;
      try {
        const ready = await waitForReady(child, "CAREERPILOT_READY ", value =>
          value.instanceId === instanceId && value.pid === child.pid && value.port === 8787 &&
          ["enabled", "disabled"].includes(value.status), "GATEWAY_START_TIMEOUT");
        // Only the authenticated child's human terminal channel carries its code.
        child.stdout?.pipe(process.stdout);
        child.stderr?.pipe(process.stderr);
        if (ready.status !== "enabled") {
          child.kill("SIGTERM");
          gateway = null;
          if (mode === "live") throw Error("PROVIDER_DISABLED");
          await fail("PROVIDER_DISABLED");
        } else
          deps.log(
            "本次本机网关已就绪。仍默认 REPLAY，配对与付费测试需要手动操作。",
          );
      } catch (error) {
        child.kill("SIGTERM");
        gateway = null;
        if (mode === "live") throw error;
        await fail(error.message);
      }
    }
  }
  } catch (error) { await stop(); throw error; }
  gateway?.once("exit", () => {
    gateway = null;
    if (stopped) return;
    if (mode === "live") { deps.onUnexpectedExit("GATEWAY_EXITED"); void stop(); }
    else deps.log("网关已退出，请停用 LIVE 并使用本地回退。");
  });
  return { web, gateway, stop };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const mode =
    process.argv.find((arg) => arg.startsWith("--mode="))?.slice(7) ?? "auto";
  startProject({ mode, dependencies: { onUnexpectedExit() { process.exitCode = 1; } } })
    .then((run) => {
      process.once("SIGINT", () => void run.stop());
      process.once("SIGTERM", () => void run.stop());
    })
    .catch((error) => {
      console.error(
        `启动失败：${error.code ?? error.message}。未自动下载、构建或更换端口。`,
      );
      process.exitCode = 1;
    });
}
