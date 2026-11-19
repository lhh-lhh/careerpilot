import { resolve } from "node:path";
import { initializeService } from "../server/bootstrap";
import { createOnlineApp } from "../server/app";
const path = resolve("artifacts/stage-five-qa/service.sqlite");
const { existsSync } = await import("node:fs");
if (!existsSync(path)) await initializeService(path);
const app = await createOnlineApp({
  databasePath: path,
  staticRoot: resolve("artifacts/stage-five-dist"),
});
await app.listen(4188);
console.log("Isolated fifth-stage QA http://127.0.0.1:4188");
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => void app.close().then(() => process.exit(0)));
