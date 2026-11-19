import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { buildSourcePackage } from "./delivery-packages.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outputRoot = resolve(projectRoot, "artifacts", "release");
const destination = await buildSourcePackage({ projectRoot, outputRoot });
console.log(`源码包：${destination}`);
console.log(
  `ZIP：${process.platform === "win32" ? `${destination}.zip` : "当前平台未生成"}`,
);
