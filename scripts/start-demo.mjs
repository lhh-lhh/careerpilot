import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute, extname } from "node:path";
import { fileURLToPath } from "node:url";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonc": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webm": "video/webm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export function createStaticServer(root) {
  const absoluteRoot = resolve(root);
  const confined = (file) => {
    const path = relative(absoluteRoot, file);
    return (
      path !== ".." &&
      !path.startsWith(`..\\`) &&
      !path.startsWith("../") &&
      !isAbsolute(path)
    );
  };
  return createServer(async (request, response) => {
    const send = (code, message) => {
      response.writeHead(code, {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(message);
    };
    if (!["GET", "HEAD"].includes(request.method ?? ""))
      return send(405, "Method not allowed");
    let pathname;
    try {
      pathname = decodeURIComponent((request.url ?? "/").split("?")[0]);
    } catch {
      return send(400, "Invalid URL");
    }
    const segments = pathname.split(/[\\/]/);
    if (
      pathname.includes("\\") ||
      pathname.includes("\0") ||
      pathname.includes(":") ||
      segments.some((s) => s === ".." || (s.startsWith(".") && s !== ""))
    )
      return send(404, "Not found");
    const target = resolve(
      absoluteRoot,
      pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""),
    );
    if (!confined(target)) return send(404, "Not found");
    try {
      const actual = await realpath(target);
      if (!confined(actual) || !(await stat(actual)).isFile())
        return send(404, "Not found");
      const contentType = mime[extname(actual).toLowerCase()];
      if (!contentType) return send(404, "Not found");
      const body = await readFile(actual);
      response.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": body.length,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' http://127.0.0.1:8787; font-src 'self' blob:; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      send(404, "Not found");
    }
  });
}

export async function startDemo() {
  const major = Number(process.versions.node.split(".")[0]);
  if (
    major < 22 ||
    major >= 25 ||
    (major === 22 && Number(process.versions.node.split(".")[1]) < 12)
  )
    throw Error("需要预装 Node >=22.12 且 <25；启动不会自动安装依赖。");
  const root = fileURLToPath(new URL("../dist/", import.meta.url));
  try {
    await stat(resolve(root, "index.html"));
  } catch {
    throw Error(
      "缺少 dist/index.html。请在开发准备阶段先执行 npm run build；日常启动不会安装或构建。",
    );
  }
  const server = createStaticServer(root);
  server.on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? "端口 4173 已占用，已停止；不会切换地址。请关闭占用该端口的服务后重试。"
        : `静态服务启动失败：${error.code ?? "UNKNOWN"}`,
    );
    process.exitCode = 1;
  });
  server.listen(4173, "127.0.0.1", () => {
    console.log(
      "CAREERPILOT_WEB_READY " +
        JSON.stringify({ pid: process.pid, port: 4173 }),
    );
    console.log(
      "路鸣职引 CareerPilot · http://127.0.0.1:4173/#/login\n本地演示 · 不读取 AI 凭据 · Ctrl+C 停止",
    );
  });
  process.on("SIGINT", () => server.close(() => process.exit(0)));
  process.on("SIGTERM", () => server.close(() => process.exit(0)));
  return server;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  startDemo().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
