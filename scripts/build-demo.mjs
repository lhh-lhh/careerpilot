import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { buildDemoPackage } from "./delivery-packages.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outputRoot = resolve(projectRoot, "artifacts", "release");
const destination = await buildDemoPackage({ projectRoot, outputRoot });
console.log(`离线演示包：${destination}`);
console.log(
  `ZIP：${process.platform === "win32" ? `${destination}.zip` : "当前平台未生成"}`,
);
