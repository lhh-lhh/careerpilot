import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const result = spawnSync(
  process.execPath,
  [join(root, "node_modules", "vitest", "vitest.mjs"), "run", "tests/unit/ai"],
  { cwd: root, stdio: "inherit", shell: false },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
