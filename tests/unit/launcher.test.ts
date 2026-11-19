import { expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { startProject } from "../../scripts/start-project.mjs";
import { deferred } from "../helpers/deferred";
function child() {
  const c = Object.assign(new EventEmitter(), {
    pid: 12345,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    killed: false,
    kill() {
      c.killed = true;
      queueMicrotask(() => c.emit("exit", 0));
      return true;
    },
  });
  return c;
}
it("GW02 offline never checks Python or configuration and stops only its own static service", async () => {
  const staticChild = child();
  let probes = 0;
  const run = await startProject({
    mode: "offline",
    dependencies: {
      validate: async () => {},
      webReady: async () => {},
      available: async () => true,
      pythonExists: async () => {
        probes++;
        throw Error("must not check Python");
      },
      spawnChild: (_file: string, args: string[]) => {
        expect(args).toEqual(
          expect.arrayContaining([expect.stringContaining("start-demo.mjs")]),
        );
        return staticChild;
      },
      log: () => {},
    },
  });
  expect(probes).toBe(0);
  await run.stop();
  expect(staticChild.killed).toBe(true);
});
it("GW02 auto missing gateway remains offline, live fails and cleans its own static child", async () => {
  for (const mode of ["auto", "live"]) {
    const staticChild = child();
    const pending = startProject({
      mode,
      dependencies: {
        validate: async () => {},
        webReady: async () => {},
        available: async () => true,
        pythonExists: async () => false,
        spawnChild: () => staticChild,
        log: () => {},
      },
    });
    if (mode === "auto") {
      const run = await pending;
      expect(run.gateway).toBeNull();
      await run.stop();
    } else {
      await expect(pending).rejects.toThrow("GATEWAY_ENV_MISSING");
      expect(staticChild.killed).toBe(true);
    }
  }
});
it("GW02 unknown occupied 8787 is never contacted or trusted", async () => {
  const staticChild = child();
  let spawns = 0;
  const run = await startProject({
    mode: "auto",
    dependencies: {
      validate: async () => {},
      webReady: async () => {},
      available: async (port: number) => port === 4173,
      pythonExists: async () => true,
      spawnChild: () => {
        spawns++;
        return staticChild;
      },
      log: () => {},
    },
  });
  expect(spawns).toBe(1);
  expect(run.gateway).toBeNull();
  await run.stop();
});
it("GW02 readiness requires matching child instance id, not public health or another process", async () => {
  const staticChild = child(),
    gatewayChild = child();
  let calls = 0;
  const run = await startProject({
    mode: "live",
    dependencies: {
      validate: async () => {},
      webReady: async () => {},
      available: async () => true,
      pythonExists: async () => true,
      spawnChild: (
        _file: string,
        args: string[],
        options: { shell: boolean; env: Record<string, string> },
      ) => {
        calls++;
        if (calls === 1) return staticChild;
        expect(args).toEqual(["-X", "utf8", "-m", "app.run"]);
        expect(options.shell).toBe(false);
        queueMicrotask(() =>
          gatewayChild.stdout.write(
            `CAREERPILOT_READY ${JSON.stringify({ instanceId: options.env.CAREERPILOT_INSTANCE_ID, port: 8787, status: "enabled", pid: 12345 })}\n`,
          ),
        );
        return gatewayChild;
      },
      log: () => {},
    },
  });
  expect(run.gateway).toBe(gatewayChild);
  await run.stop();
  expect(gatewayChild.killed).toBe(true);
});
it("GW02 does not report startup success before the owned static server is ready", async () => {
  const ready = deferred<void>(), staticChild = child();
  let returned = false;
  const starting = startProject({ mode: "offline", dependencies: {
    validate: async () => {}, available: async () => true,
    spawnChild: () => staticChild, webReady: () => ready.promise, log: () => {},
  }}).then(run => { returned = true; return run; });
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(returned).toBe(false);
  ready.resolve();
  const run = await starting;
  await run.stop();
});
it("GW02 a static readiness failure cleans the owned process and rejects even in auto mode", async () => {
  const staticChild = child();
  await expect(startProject({ dependencies: {
    validate: async () => {}, available: async () => true,
    spawnChild: () => staticChild, webReady: async () => { throw Error("WEB_START_FAILED"); }, log: () => {},
  }})).rejects.toThrow("WEB_START_FAILED");
  expect(staticChild.killed).toBe(true);
});
