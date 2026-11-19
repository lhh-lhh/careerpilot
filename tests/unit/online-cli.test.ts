import { expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createOnlineApp } from "../../server/app";
const exec = promisify(execFile);

it("repeated initialization refuses without changing existing credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "careerpilot-cli-"));
  const databasePath = join(dir, "test.sqlite");
  let app = await createOnlineApp({ databasePath, seed: true });
  try {
    await app.provision("student001", "Preserve-existing-password!");
    await app.close();
    const result = await exec(process.execPath, ["--import", "tsx", "server/cli.ts", "init"], {
      env: { ...process.env, CAREERPILOT_DATABASE: databasePath },
    }).then(() => 0, (error: { code: number }) => error.code);
    expect(result).not.toBe(0);
    app = await createOnlineApp({ databasePath });
    await app.listen(0);
    const address = app.server.address();
    if (!address || typeof address === "string") throw Error("no port");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/session`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: "student001", password: "Preserve-existing-password!" }),
    });
    expect(response.status).toBe(200);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
}, 15000);
