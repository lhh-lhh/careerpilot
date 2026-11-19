import { resolve } from "node:path";
import { initializeService } from './bootstrap';
import { existsSync } from "node:fs";
import { open } from 'node:fs/promises';
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createOnlineApp } from "./app";
import { backupDatabase, restoreDatabase } from "./backup";
import { loadDeepseekKey } from './workbench/credential';
const command = process.argv[2] ?? "start";
const path = resolve(process.env.CAREERPILOT_DATABASE ?? "server-data/service.sqlite");
if (command === "backup" || command === "restore") {
  const source = process.argv[3], destination = process.argv[4];
  if (!source || !destination) throw Error("使用 backup <数据库文件> <全新备份目录> 或 restore <备份目录> <全新恢复目录>");
  const result = command === "backup" ? await backupDatabase(source, destination) : await restoreDatabase(source, destination);
  console.log(`已完成${command === "backup" ? "一致性备份" : "恢复（旧会话已撤销）"}：${result}`);
  process.exit(0);
}
if (!["init", "password", "start"].includes(command)) throw Error("Supported commands: init, password, start");
if (command === "init" && existsSync(path)) throw Error("数据库文件已存在；初始化已拒绝，不会重置账号或密码。需要改密请使用 password:online。");
if (command === 'init') {
  const exportIndex=process.argv.indexOf('--credentials-file'),exportPath=exportIndex>=0?process.argv[exportIndex+1]:undefined;
  if(exportIndex>=0&&!exportPath)throw Error('Missing credentials file path');
  // Reserve before touching the database, never overwrite an operator's existing password sheet.
  const exportFile=exportPath?await open(resolve(exportPath),'wx',0o600):null;
  try {
    const credentials=await initializeService(path);
    if(exportFile){await exportFile.writeFile(JSON.stringify(credentials,null,2));console.log(`账号密码已保存到本机文件：${exportPath}`);}
    else for (const credential of credentials) console.log(`${credential.login}\t${credential.password}`);
    console.log(`已初始化服务数据库：${path}\n请安全保存随机密码，首次登录后修改密码。`);
  }finally{await exportFile?.close();}
  process.exit(0);
}
const host = process.env.CAREERPILOT_HOST ?? "127.0.0.1";
const deepseekKey = command === 'start' ? loadDeepseekKey() : '';
const localAi = command === 'start' && !!deepseekKey && process.env.CAREERPILOT_AI_ENABLED !== 'false';
if (command === "start" && !["127.0.0.1", "::1", "localhost"].includes(host)) throw Error("本候选版仅允许本机监听；正式部署需先完成 TLS 与安全验收。");
const app = await createOnlineApp({ databasePath: path, staticRoot: resolve("dist"), secureCookies: process.env.CAREERPILOT_SECURE_COOKIE === "true",
  ai: { enabled: localAi,
    apiKey: deepseekKey, model: process.env.CAREERPILOT_DEEPSEEK_MODEL ?? 'deepseek-flash', dailyGlobalCalls: Number(process.env.CAREERPILOT_AI_DAILY_GLOBAL_CALLS ?? 100), dailyUserCalls: Number(process.env.CAREERPILOT_AI_DAILY_USER_CALLS ?? 40) },
});
if (command === "password") {
  const prompt = createInterface({ input: stdin, output: stdout });
  const login = await prompt.question("账号：");
  // Do not ask for secrets in chat; local console flow is operator-controlled.
  const password = await prompt.question("新密码（至少12字符，本机控制台可见）：");
  prompt.close(); await app.provision(login, password); await app.close();
  console.log("密码已更新，旧会话已失效。");
} else if (command === "start") {
  const port = Number(process.env.CAREERPILOT_PORT ?? 4174);
  await app.listen(port, host);
  console.log(`路鸣职引服务端已启动：http://${host}:${port}/\n默认仅本机；未配置 TLS / 真实账号前不要公网开放。`);
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => void app.close().then(() => process.exit(0)));
} else { await app.close(); throw Error("Supported commands: init, password, start"); }
