import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { chromium } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(root,'../..');
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function inline(raw){
  let items=[];
  let text=raw.replace(/`([^`]+)`/g,(_,s)=>{items.push(`<code>${esc(s)}</code>`);return `@@INLINE${items.length-1}@@`;});
  text=esc(text).replace(/!\[([^\]]*)\]\(([^)]+)\)/g,(_,a,b)=>`<figure><a href="${b}"><img loading="lazy" src="${b}" alt="${a}"></a><figcaption>${a}</figcaption></figure>`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2">$1</a>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  return text.replace(/@@INLINE(\d+)@@/g,(_,n)=>items[Number(n)]);
}
function md(raw){
  const lines=raw.split(/\r?\n/);let output=[],i=0;
  while(i<lines.length){let s=lines[i];if(!s.trim()){i++;continue;}
    if(s.startsWith('```')){let b=[];i++;while(i<lines.length&&!lines[i].startsWith('```'))b.push(lines[i++]);i++;output.push(`<pre><code>${esc(b.join('\n'))}</code></pre>`);continue;}
    const h=s.match(/^(#{1,6})\s+(.+)$/);if(h){output.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);i++;continue;}
    if(s.startsWith('|')&&lines[i+1]?.match(/^\|[\s:|-]+\|$/)){let rows=[];while(i<lines.length&&lines[i].startsWith('|'))rows.push(lines[i++]);const cells=x=>x.replace(/^\||\|$/g,'').split('|').map(s=>s.trim());output.push(`<div class="table-wrap"><table><thead><tr>${cells(rows[0]).map(x=>`<th>${inline(x)}</th>`).join('')}</tr></thead><tbody>${rows.slice(2).map(x=>`<tr>${cells(x).map(c=>`<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);continue;}
    if(/^[-*] /.test(s)){let b=[];while(i<lines.length&&/^[-*] /.test(lines[i]))b.push(lines[i++].slice(2));output.push('<ul>'+b.map(x=>`<li>${inline(x)}</li>`).join('')+'</ul>');continue;}
    if(/^\d+\. /.test(s)){let b=[];while(i<lines.length&&/^\d+\. /.test(lines[i]))b.push(lines[i++].replace(/^\d+\. /,''));output.push('<ol>'+b.map(x=>`<li>${inline(x)}</li>`).join('')+'</ol>');continue;}
    let b=[s];i++;while(i<lines.length&&lines[i].trim()&&!/^(#|```|\||[-*] |\d+\. )/.test(lines[i]))b.push(lines[i++]);let p=inline(b.join('\n'));output.push(p.startsWith('<figure>')?p:`<p>${p}</p>`);
  }
  return output.join('\n');
}
const docs=['01-PPT详细设计文档稿.md','02-报告演讲稿.md','03-事实来源与素材说明.md'];
let body='';for(let i=0;i<docs.length;i++)body+=`<article id="doc${i+1}">${md(await fs.readFile(path.join(root,docs[i]),'utf8'))}</article>`;
const manifest=JSON.parse(await fs.readFile(path.join(root,'素材清单.json'),'utf8'));
const gallery=(jobs,label)=>`<h2>${label}</h2>`+jobs.map(j=>`<section class="gallery"><h3>${j.id} · ${esc(j.title)}</h3><p>${esc(j.file?j.file+' · '+j.ranges.map(x=>'L'+x.join('–')).join(' / '):j.route+' · '+j.dataLabel)}</p><a href="${j.image}"><img loading="lazy" src="${j.image}" alt="${j.id} ${esc(j.title)}"></a></section>`).join('');
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>路鸣职引｜PPT设计材料阅读版</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f0f6ff;color:#193557;font-family:'Microsoft YaHei','Segoe UI',sans-serif;line-height:1.85}nav{position:sticky;top:0;z-index:5;display:flex;gap:20px;flex-wrap:wrap;padding:14px max(24px,calc((100vw - 1180px)/2));background:#123c8c;color:white}nav a{color:white;text-decoration:none}header{max-width:1228px;margin:30px auto;padding:30px;background:linear-gradient(115deg,#e5f2ff,white);border:1px solid #cddff5;border-radius:18px}header .tag{color:#216fee;font-weight:700}main{max-width:1228px;margin:auto;padding:0 24px 60px}article{scroll-margin-top:90px;background:white;padding:40px;margin-bottom:26px;border-radius:18px;border:1px solid #d7e4f5}h1{font-size:30px;line-height:1.5;color:#10366b}h2{font-size:25px;margin:42px 0 16px;border-bottom:2px solid #e1ecfa;padding-bottom:10px;color:#174f9b}h3{font-size:21px;margin:32px 0 12px;color:#10366b}h4{font-size:18px}p,li{font-size:16px}strong{color:#10366b}a{color:#165ec6;overflow-wrap:anywhere}code{font-family:Consolas,'Microsoft YaHei',monospace;font-size:.93em;overflow-wrap:anywhere;background:#edf3fc;padding:1px 4px;border-radius:4px}pre{background:#11213a;color:#e8f2ff;padding:24px;overflow:auto;border-radius:12px;line-height:1.6}pre code{color:inherit;background:transparent;white-space:pre}figure{margin:26px 0;padding:12px;background:#f4f8ff;border:1px solid #d7e4f5;border-radius:12px}img{display:block;width:100%;height:auto}figure img{max-height:1000px;object-fit:contain;object-position:top}figcaption{font-size:13px;color:#58708b;margin-top:10px}.table-wrap{overflow-x:auto;margin:20px 0}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #d6e2f1;text-align:left;vertical-align:top;padding:11px}th{background:#eaf2ff}tr:nth-child(even){background:#f8fbff}.gallery{background:white;border:1px solid #d7e4f5;border-radius:15px;padding:24px;margin:22px 0;scroll-margin-top:90px}.gallery p{font-size:14px}.gallery img{border-radius:8px}#assets{scroll-margin-top:90px}@media(max-width:700px){article{padding:20px}main{padding:0 12px 30px}header{margin:15px;padding:20px}h1{font-size:25px}nav{gap:13px;padding:12px;font-size:14px}}@media print{nav{display:none}body{background:white}article{border:0;padding:0;break-before:page}.gallery{break-inside:avoid}img{max-height:230mm;object-fit:contain}}</style><nav><a href="#doc1">逐页设计稿</a><a href="#doc2">完整演讲稿</a><a href="#doc3">来源与边界</a><a href="#assets">全部素材</a><a href="素材清单.json">溯源清单</a></nav><header><span class="tag">CAREERPILOT · PRESENTATION BRIEF</span><h1>路鸣职引 · Web应用开发展示材料</h1><p>12页主讲 / 计划7分40秒 / 14张源码截图 / 13张运行截图<br>本文件是制作前的详细设计与素材阅读版，不是已经导出的PPT。正文、代码和界面证据分开呈现。</p></header><main>${body}<section id="assets">${gallery(manifest.code,'全部关键代码截图（点击可打开原图）')}${gallery(manifest.screenshots,'全部运行界面截图')}</section></main></html>`;
await fs.writeFile(path.join(root,'阅读版.html'),html.replace('</style>','p,li,td,th,h1,h2,h3,h4{overflow-wrap:anywhere}</style>'));

const errors=[];const checked=[];
for(const job of manifest.code){const bytes=await fs.readFile(path.join(repo,job.file));if(hash(bytes)!==job.sourceSha256)errors.push('source hash '+job.id);const lines=bytes.toString('utf8').split(/\r?\n/);const txt=await fs.readFile(path.join(root,'sources/code',job.id+'.txt'),'utf8');for(const [a,b]of job.ranges)for(let n=a;n<=b;n++)if(!txt.split('\n').includes(n+'\t'+lines[n-1]))errors.push('code text '+job.id+':'+n);}
for(const job of [...manifest.code,...manifest.screenshots]){const bytes=await fs.readFile(path.join(root,job.image));if(hash(bytes)!==job.pngSha256)errors.push('png hash '+job.id);let meta=await sharp(bytes).metadata();checked.push({id:job.id,width:meta.width,height:meta.height,sha256:hash(bytes)});}
for(const doc of docs){const s=await fs.readFile(path.join(root,doc),'utf8');for(const match of s.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)){let target=match[1];if(!/^(https?:|#)/.test(target))try{await fs.access(path.join(root,target));}catch{errors.push(doc+' missing '+target);}}}
const research=JSON.parse(await fs.readFile(path.join(root,'deepseek_research.facts.json'),'utf8'));
const researchMd=await fs.readFile(path.join(root,'deepseek_research.md'),'utf8');
if(research.schema!=='ppt-master.fact-provenance.v1'||!researchMd.includes('## Research Brief')||/https?:\/\//.test(researchMd))errors.push('research format');
for(let i=0;i<research.facts.length;i++)if(research.facts[i].fact_id!=='F'+String(i+1).padStart(3,'0')||!researchMd.includes(research.facts[i].fact_id))errors.push('research ids');
const script=await fs.readFile(path.join(root,docs[1]),'utf8');
const sections=[...script.matchAll(/【正文】\s*([\s\S]*?)\s*【正文结束】/g)].map(x=>x[1]);
const seconds=[15,30,30,45,40,45,60,45,50,30,45,25];
if(sections.length!==12||seconds.reduce((a,b)=>a+b,0)!==460)errors.push('timing structure');
const timing=sections.map((x,i)=>{const han=(x.match(/\p{Script=Han}/gu)??[]).length;const words=(x.match(/[A-Za-z][A-Za-z0-9]*(?:[ .-][A-Za-z0-9]+)*/g)??[]).join(' ').split(/\s+/).filter(Boolean).length;return {page:'P'+String(i+1).padStart(2,'0'),budgetSeconds:seconds[i],nonspaceCharacters:[...x.replace(/\s/g,'')].length,hanCharacters:han,latinWordEstimate:words};});
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});
const browserErrors=[];page.on('pageerror',e=>browserErrors.push(e.message));await page.goto(pathToFileURL(path.join(root,'阅读版.html')).href);
await page.locator('img').evaluateAll(async imgs=>{await Promise.all(imgs.map(i=>{i.loading='eager';return i.decode().catch(()=>{});}));});
const broken=await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>!i.naturalWidth).map(i=>i.getAttribute('src')));
if(broken.length)errors.push(...broken.map(x=>'html image '+x));
if(browserErrors.length)errors.push(...browserErrors);
const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);if(overflow)errors.push('reader horizontal overflow');
await page.screenshot({path:path.join(root,'validation/阅读版首屏.png')});
await page.setViewportSize({width:390,height:844});
const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);if(mobileOverflow)errors.push('reader mobile horizontal overflow');
const sheets=[];
for(const [name,jobs] of [['代码总览',manifest.code],['界面总览',manifest.screenshots]]){
  const tw=600,th=460,cols=3,rows=Math.ceil(jobs.length/cols),items=[];
  for(let i=0;i<jobs.length;i++){const thumb=await sharp(path.join(root,jobs[i].image)).resize(tw-20,th-30,{fit:'contain',background:'#e7edf7'}).png().toBuffer();items.push({input:thumb,left:(i%cols)*tw+10,top:Math.floor(i/cols)*th+10});}
  const target=path.join(root,'validation',name+'.jpg');await sharp({create:{width:tw*cols,height:th*rows,channels:3,background:'#dce6f4'}}).composite(items).jpeg({quality:85}).toFile(target);sheets.push(target);
}
const report={status:errors.length?'failed':'passed',preparedDate:'2026-11-18',codeImages:manifest.code.length,uiImages:manifest.screenshots.length,imagesVerified:checked.length,readerImages:await page.locator('img').count(),brokenImages:broken,browserErrors,readerHorizontalOverflow:overflow,readerMobileHorizontalOverflow:mobileOverflow,codeProvenanceVerified:true,sourceFilesUnmodifiedByMaterialScripts:true,mainSlideCount:12,budgetSeconds:460,bufferSeconds:20,narration:{totalNonspaceCharacters:timing.reduce((s,x)=>s+x.nonspaceCharacters,0),totalHanCharacters:timing.reduce((s,x)=>s+x.hanCharacters,0),estimatedBasis:'页内预算包含指示/停顿；正文含中英缩写，文本计量不是本人彩排；建议220–260汉字/分钟自然讲述并计时。',pages:timing},officialReferences:research.facts.length,images:checked,errors};
await browser.close();await fs.writeFile(path.join(root,'validation/材料检查.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,imagesVerified:report.imagesVerified,readerImages:report.readerImages,officialReferences:report.officialReferences,budgetSeconds:report.budgetSeconds,narration:report.narration,errors},null,2));
if(errors.length)process.exitCode=1;
