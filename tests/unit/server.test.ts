import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Removing confinement, MIME selection or exclusive binding must fail these real HTTP tests.
describe("B03/B05 restricted static server", () => {
  it("serves only dist resources and rejects traversal, secrets and unsupported methods", async () => {
    const { createStaticServer } = await import("../../scripts/start-demo.mjs");
    const fixture = await mkdtemp(join(tmpdir(), "careerpilot-http-"));
    await writeFile(join(fixture, "index.html"), "<h1>Local demo</h1>");
    await writeFile(join(fixture, "app.js"), "export const local = true");
    await writeFile(join(fixture, ".env"), "TEST_ONLY_NOT_A_SECRET");
    const server = createStaticServer(fixture);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("missing test port");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      expect(await (await fetch(base)).text()).toContain("Local demo");
      expect(
        (await fetch(`${base}/app.js`)).headers.get("content-type"),
      ).toContain("javascript");
      for (const path of [
        "/missing.js",
        "/.env",
        "/%2e%2e%2fpackage.json",
        "/C%3A/windows/win.ini",
        "/%ZZ",
        "/%5c..%5cpackage.json",
      ]) {
        expect((await fetch(`${base}${path}`)).status).toBeGreaterThanOrEqual(
          400,
        );
      }
      expect((await fetch(base, { method: "POST" })).status).toBe(405);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err: Error | undefined) =>
          err ? reject(err) : resolve(),
        ),
      );
      await rm(fixture, { recursive: true });
    }
  });

  it("B03 reports occupied fixed port and exits instead of changing origin", async () => {
    const { createStaticServer } = await import("../../scripts/start-demo.mjs");
    const server = createStaticServer(process.cwd());
    const owned = await new Promise<boolean>((resolve, reject) => {
      server.once("error", (error: NodeJS.ErrnoException) =>
        error.code === "EADDRINUSE" ? resolve(false) : reject(error),
      );
      server.listen(4173, "127.0.0.1", () => resolve(true));
    });
    try {
      const result = await new Promise<{ code: number | null; output: string }>(
        (resolve) => {
          const child = spawn(process.execPath, ["scripts/start-demo.mjs"]);
          let output = "";
          child.stdout.on("data", (chunk) => {
            output += chunk.toString();
          });
          child.stderr.on("data", (chunk) => {
            output += chunk.toString();
          });
          child.on("close", (code) => resolve({ code, output }));
        },
      );
      expect(result.code).not.toBe(0);
      expect(result.output).toContain("4173");
      expect(result.output).toContain("占用");
    } finally {
      if (owned)
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
