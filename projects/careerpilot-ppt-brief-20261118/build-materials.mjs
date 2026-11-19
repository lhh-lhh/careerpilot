// Presentation material preparation only. Does not import or mutate the application.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const out = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(out, '../..');
const captureRoot = 'D:/Temp/careerpilot-ui-final-20261117/chromium';
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const esc = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const codeJobs = [
  { id:'C01', file:'src/services/app-services.ts', ranges:[[18,28]], focus:[18,19,28], title:'同一服务边界，分离在线与离线数据', use:'P04／附录A1' },
  { id:'C02', file:'src/services/repository.ts', ranges:[[285,309]], focus:[285,287,290,291,294,307,308], title:'事务、幂等回执与版本冲突', use:'P05' },
  { id:'C03', file:'src/domain/matching/scoring.ts', ranges:[[250,266]], focus:[250,258,260,261,266], title:'六维匹配分是确定性计算，不是模型概率', use:'P06' },
  { id:'C04', file:'src/services/matching-worker.ts', ranges:[[26,43]], focus:[26,27,28,29,38,42], title:'Worker与取消：计算不阻塞主线程', use:'P06／附录A2' },
  { id:'C05', file:'server/ai.ts', ranges:[[134,137]], focus:[134,135,136], title:'真实服务端请求：鉴权、消息与JSON输出', use:'P07' },
  { id:'C06', file:'server/ai.ts', ranges:[[143,149]], focus:[144,145,148,149], title:'JSON可解析之后，仍要校验结构与业务语义', use:'附录A3；P07讲解依据' },
  { id:'C07', file:'server/workbench/business.ts', ranges:[[18,25]], focus:[18,22,24,25], title:'简历改写：原文锚定、去重与新增数字拦截', use:'P08' },
  { id:'C08', file:'server/workbench/index.ts', ranges:[[141,147],[150,154]], focus:[143,144,147,151,154], title:'先保存回答，再等待模型：失败不丢回答、不造分', use:'P09' },
  { id:'C09', file:'server/workbench/business.ts', ranges:[[40,48]], focus:[40,44,48], title:'面试评价：数值范围、引用证据与有效维度均值', use:'附录A4' },
  { id:'C10', file:'server/workbench/provider.ts', ranges:[[73,87],[90,91]], focus:[74,75,79,86,87,90], title:'SSE分块解析与完整结束校验', use:'附录A5；P09机制说明' },
  { id:'C11', file:'src/components/presentation/WorkbenchHeader.vue', ranges:[[11,19]], focus:[13,14,15,18], title:'组件化页头：装饰图层与可操作入口分区', use:'附录A6；P10机制说明' },
  { id:'C12', file:'server/workbench/provider.ts', ranges:[[21,30]], focus:[22,23,29], title:'调用前预留额度与并发限制', use:'附录A7；P07边界说明' },
  { id:'C13', file:'src/domain/ai-guard/privacy.ts', ranges:[[2,16]], focus:[5,12,13,14,15], title:'文本脱敏的实际范围，不等于完整匿名化', use:'附录A8' },
  { id:'C14', file:'src/domain/lifecycle/transition.ts', ranges:[[75,88]], focus:[75,78,79,81,85,86,87], title:'状态迁移同时校验角色归属与合法动作', use:'附录A9；P05机制说明' },
];
const uiJobs = [
  {id:'U01', route:'/', dir:'public_', crop:{left:0,top:0,width:1440,height:900}, title:'公共门户首屏'},
  {id:'U02', route:'/student', dir:'online-学生_student', crop:{left:0,top:0,width:1440,height:1000}, title:'学生生涯概览'},
  {id:'U03', route:'/student/jobs', dir:'online-学生_student_jobs', crop:{left:0,top:0,width:1440,height:1000}, title:'岗位匹配与筛选'},
  {id:'U04', route:'/student/resume/optimize', dir:'online-学生_student_resume_optimize', crop:{left:218,top:300,width:1222,height:970}, title:'AI简历草稿与人工保存（局部）'},
  {id:'U05', route:'/student/mock/practice', dir:'online-学生_student_mock_practice', crop:{left:0,top:0,width:1440,height:1000}, title:'题库练习'},
  {id:'U06', route:'/student/mock/voice', dir:'online-学生_student_mock_voice', crop:{left:0,top:0,width:1440,height:1000}, title:'仿真语音面试入口'},
  {id:'U07', route:'/company/candidates', dir:'online-企业_company_candidates', crop:{left:0,top:0,width:1440,height:1000}, title:'企业候选人流程'},
  {id:'U08', route:'/company/schedule', dir:'online-企业_company_schedule', crop:{left:0,top:0,width:1440,height:1000}, title:'企业面试日程'},
  {id:'U09', route:'/counselor/dashboard', dir:'online-辅导员_counselor_dashboard', crop:{left:0,top:0,width:1440,height:1100}, title:'辅导员就业驾驶舱'},
  {id:'U10', route:'/admin', dir:'online-管理员_admin', crop:{left:0,top:0,width:1440,height:1050}, title:'管理员控制台'},
  {id:'U11', route:'/student/mock/voice', dir:'online-学生_student_mock_voice', sourceName:'light-390.png', crop:{left:0,top:0,width:390,height:844}, title:'390px视口下语音入口，非物理手机'},
  {id:'U12', route:'/company/candidates', dir:'online-企业_company_candidates', sourceName:'dark-1440.png', crop:{left:0,top:0,width:1440,height:1000}, title:'企业工作台暗色主题'},
  {id:'U13', route:'/student/jobs', dir:'windows/W12', crop:{left:0,top:0,width:1440,height:1000}, title:'岗位规则解释抽屉'},
];
await Promise.all(['images/code','images/ui','sources/code','sources/evidence','validation'].map(p=>fs.mkdir(path.join(out,p),{recursive:true})));
const manifest = {schema:'careerpilot.ppt-materials.v1', preparedDate:'2026-11-18', purpose:'设计文档及素材，非成品PPT', screenshots:[], code:[]};
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1800,height:1200},deviceScaleFactor:1});
for(const job of codeJobs){
  const bytes=await fs.readFile(path.join(repo,job.file));
  const lines=bytes.toString('utf8').split(/\r?\n/);
  const blocks=job.ranges.map(([a,b])=>{if(a<1||b>lines.length)throw Error(job.id+' bad range');return Array.from({length:b-a+1},(_,i)=>({n:a+i,s:lines[a+i-1]}));});
  const rows=blocks.flatMap((block,i)=>[...(i?[{n:'…',s:'中间源码省略；行号保持原文件位置',skip:true}]:[]),...block]);
  const content=rows.map(r=>`<div class="row ${job.focus.includes(r.n)?'focus':''} ${r.skip?'skip':''}"><span class="ln">${r.n}</span><code>${esc(r.s)||' '}</code></div>`).join('');
  const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#eef3fc;font-family:'Microsoft YaHei',sans-serif}.capture{width:1800px;background:#101b30;color:#eaf1ff;padding:30px 30px 22px;border-radius:18px}.head{font-size:29px;font-weight:700;margin-bottom:12px}.meta{font-family:Consolas,monospace;font-size:20px;color:#a6c7ff;margin-bottom:20px}.row{display:grid;grid-template-columns:66px 1fr;padding:2px 12px;border-left:5px solid transparent;min-height:34px}.ln{font:21px/1.5 Consolas,monospace;color:#8394b2;user-select:none}.row code{font:23px/1.5 Consolas,'Microsoft YaHei',monospace;white-space:pre-wrap;overflow-wrap:anywhere;tab-size:2}.focus{background:#19375b;border-color:#45bcff}.skip{color:#ffcc85}.foot{font-size:19px;color:#b8c6dd;border-top:1px solid #344359;margin-top:18px;padding-top:13px;line-height:1.6}</style><section class="capture"><div class="head">${job.id} · ${esc(job.title)}</div><div class="meta">${esc(job.file)} · L${job.ranges.map(r=>r.join('–')).join(' / L')} · SHA256 ${sha(bytes).slice(0,12)}</div>${content}<div class="foot">原文件摘录；长行仅视觉换行，未改写源码。蓝色为讲解重点。${job.id==='C05'?' Authorization行只显示变量引用，没有实际密钥。':''}</div></section></html>`;
  await fs.writeFile(path.join(out,'sources/code',job.id+'.html'),html);
  await fs.writeFile(path.join(out,'sources/code',job.id+'.txt'),rows.map(r=>`${r.n}\t${r.s}`).join('\n'));
  await page.setContent(html);await page.evaluate(()=>document.fonts.ready);
  const imagePath=path.join(out,'images/code',job.id+'.png');
  await page.locator('.capture').screenshot({path:imagePath});
  const m=await sharp(imagePath).metadata();
  manifest.code.push({...job,sourceSha256:sha(bytes),pngSha256:sha(await fs.readFile(imagePath)),image:`images/code/${job.id}.png`,width:m.width,height:m.height});
}
await browser.close();
for(const job of uiJobs){
  const source=path.join(captureRoot,job.dir,job.sourceName??'light-1440.png');
  const bytes=await fs.readFile(source);const m=await sharp(bytes).metadata();
  if(job.crop.left+job.crop.width>m.width||job.crop.top+job.crop.height>m.height)throw Error(job.id+' bad crop');
  const imagePath=path.join(out,'images/ui',job.id+'.png');
  await sharp(bytes).extract(job.crop).png().toFile(imagePath);
  manifest.screenshots.push({...job,originalSource:source,originalSha256:sha(bytes),originalDimensions:{width:m.width,height:m.height},image:`images/ui/${job.id}.png`,pngSha256:sha(await fs.readFile(imagePath)),dataLabel:'真实应用渲染；隔离SQLite＋合成测试账号／数据；非公网与真人业务截图',alterations:'仅矩形裁切；未更改任何UI、文本、状态或数据'});
}
await fs.copyFile('D:/Temp/careerpilot-main-ui-acceptance-20261118.md',path.join(out,'sources/evidence/main-ui-acceptance-20261118.md'));
await fs.copyFile(path.join(repo,'docs/evidence/strict-ai-pet-live.json'),path.join(out,'sources/evidence/strict-ai-pet-live.json'));
await fs.copyFile(path.join(repo,'docs/evidence/strict-ai-pet.md'),path.join(out,'sources/evidence/strict-ai-pet.md'));
await fs.writeFile(path.join(out,'素材清单.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({codeImages:manifest.code.length,uiImages:manifest.screenshots.length,output:out},null,2));
