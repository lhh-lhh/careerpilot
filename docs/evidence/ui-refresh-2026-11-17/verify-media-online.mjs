// Read-only verification of committed media and the public local online application.
// No login, DB access, provider request, credential or production data mutation.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { chromium } from '@playwright/test';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const evidence=path.dirname(fileURLToPath(import.meta.url));
const origin='http://127.0.0.1:4174';
const manifests=await Promise.all(['media-manifest.json','career-media-manifest.json'].map(async name=>JSON.parse(await fs.readFile(path.join(evidence,name),'utf8'))));
const records=manifests.flatMap(m=>m.records), failures=[], validated=[];
for(const item of records){
  const buffer=await fs.readFile(path.join(root,'public',item.file));
  const actual=await sharp(buffer).metadata(),hash=createHash('sha256').update(buffer).digest('hex');
  const response=await fetch(origin+item.file),body=Buffer.from(await response.arrayBuffer());
  if(buffer.length!==item.bytes||hash!==item.sha256||actual.width!==item.width||actual.height!==item.height||response.status!==200||!body.equals(buffer))failures.push(item.file);
  validated.push({file:item.file,status:response.status,bytes:buffer.length,sha256:hash});
}
const references=new Set();
async function scan(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true})){
  const full=path.join(directory,entry.name);
  if(entry.isDirectory())await scan(full);
  else if(/\.(vue|css|ts)$/.test(entry.name))for(const match of (await fs.readFile(full,'utf8')).matchAll(/\/media\/(?:career|editorial)\/[a-zA-Z0-9_/-]+\.webp/g))references.add(match[0]);
}}
await scan(path.join(root,'src'));
for(const file of references)if(!records.some(r=>r.file===file))failures.push('unmanifested: '+file);
const runtime=await (await fetch(origin+'/runtime.js')).text();
if(!runtime.includes('window.__CAREERPILOT_ONLINE__=true'))failures.push('missing online runtime flag');
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1536,height:1024}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(['error','warning'].includes(m.type())&&!(m.location().url.endsWith('/api/session')&&/401/.test(m.text())))errors.push(m.text());});
const screenshots=path.join(tmpdir(),'careerpilot-reference-final','live');await fs.mkdir(screenshots,{recursive:true});
let result;
try{
  await page.goto(origin+'/#/');await page.locator('.opportunity-row').first().waitFor();
  await page.evaluate(()=>document.fonts.ready);
  const title=await page.title(),online=await page.evaluate(()=>window.__CAREERPILOT_ONLINE__),hero=await page.locator('.portal-hero-new').boundingBox();
  for(const image of await page.locator('.job-artwork img').all())if(!await image.evaluate(e=>e.complete&&e.naturalWidth>0))failures.push('unloaded portal job art');
  await page.screenshot({path:path.join(screenshots,'portal-1536.png'),fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  const noOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
  await page.screenshot({path:path.join(screenshots,'portal-390.png'),fullPage:true,animations:'disabled'});
  await page.getByRole('textbox',{name:'搜索公开岗位',exact:true}).fill('前端');
  await page.getByRole('button',{name:'搜索',exact:true}).click();await page.waitForURL(/q=/);
  await page.locator('h1').first().waitFor();
  const query=new URLSearchParams(page.url().split('?')[1]??'').get('q');
  if(!online||!title.includes('路鸣职引')||!noOverflow||query!=='前端'||await page.locator('vite-error-overlay').count())failures.push('public browser check');
  if(errors.length)failures.push('console/runtime errors');
  result={checkedAt:new Date().toISOString(),origin,online,title,hero,noOverflowAt390:noOverflow,searchResultUrl:page.url(),query,consoleErrors:errors,screenshotDirectory:screenshots,assetCount:records.length,totalBytes:records.reduce((n,r)=>n+r.bytes,0),staticReferences:references.size,validated,failures};
}finally{await context.close();await browser.close();}
console.log(JSON.stringify(result,null,2));
if(failures.length)process.exitCode=1;
