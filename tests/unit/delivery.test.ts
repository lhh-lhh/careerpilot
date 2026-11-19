import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildDemoPackage,
  buildSourcePackage,
} from "../../scripts/delivery-packages.mjs";

const temporary: string[] = [];

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe("B05/DEM02 delivery packages", () => {
  // Filesystem integration, like the source-package check below; not an HTTP latency budget.
  it(
    "builds a dependency-free demo that serves only compiled local assets",
    { timeout: 20000 },
    async () => {
      const outputRoot = await mkdtemp(
        join(tmpdir(), "careerpilot-demo-package-"),
      );
      temporary.push(outputRoot);
      const destination = await buildDemoPackage({
        projectRoot: resolve("."),
        outputRoot,
        archive: false,
      });

      for (const relative of [
        "dist/index.html",
        "scripts/start-demo.mjs",
        "start-demo.cmd",
        "README.md",
        "manifest.json",
      ]) {
        expect(await exists(join(destination, relative)), relative).toBe(true);
      }
      expect(await exists(join(destination, "package.json"))).toBe(false);
      expect(await exists(join(destination, "node_modules"))).toBe(false);
      expect(await readFile(join(destination, "README.md"), "utf8")).toMatch(
        /无需.*npm install|不执行.*npm install/s,
      );
      const { createStaticServer } = await import(
        join(destination, "scripts/start-demo.mjs")
      );
      const server = createStaticServer(join(destination, "dist"));
      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
      const address = server.address();
      if (!address || typeof address === "string") throw Error("missing port");
      try {
        const response = await fetch(`http://127.0.0.1:${address.port}`);
        expect(response.status).toBe(200);
        expect(await response.text()).toContain('id="app"');
      } finally {
        await new Promise<void>((done) => server.close(() => done()));
      }
    },
  );

  it(
    "builds source from an allowlist and excludes credentials and generated state",
    { timeout: 20000 },
    async () => {
      const outputRoot = await mkdtemp(
        join(tmpdir(), "careerpilot-source-package-"),
      );
      temporary.push(outputRoot);
      const destination = await buildSourcePackage({
        projectRoot: resolve("."),
        outputRoot,
        archive: false,
      });

      for (const relative of [
        "package.json",
        "package-lock.json",
        "src/main.ts",
        "gateway/app/main.py",
        "gateway/requirements.lock",
        "gateway/.env.example",
        "docs/development-progress.md",
        "scripts/start-project.mjs",
        "server/app.ts",
        "public/runtime.js",
        "public/media/campus.jpg",
        "THIRD_PARTY_NOTICES.md",
      ]) {
        expect(await exists(join(destination, relative)), relative).toBe(true);
      }
      for (const relative of [
        "dist",
        "artifacts",
        "node_modules",
        "outputs",
        "work",
        "gateway/.venv",
        "gateway/.env",
      ]) {
        expect(await exists(join(destination, relative)), relative).toBe(false);
      }
      const manifest = JSON.parse(
        await readFile(join(destination, "release-manifest.json"), "utf8"),
      );
      expect(manifest.securityScan.status).toBe("passed");
      expect(manifest.securityScan.findings).toEqual([]);
    },
  );
});
