// Convert only the existing speech manuscript; do not read account or application data.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import { chromium } from '@playwright/test';

const root = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(root, '02-报告演讲稿.md');
const target = path.join(root, '02-报告演讲稿.html');
const original = await fs.readFile(source, 'utf8');
const sourceHash = crypto.createHash('sha256').update(original).digest('hex');
const esc = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const paragraphs = value => value.trim().split(/\r?\n\s*\r?\n/).filter(Boolean).map(x => `<p>${esc(x.trim())}</p>`).join('\n');
const sectionPattern = /^## (P\d{2})｜([^｜\r\n]+)｜([^\r\n]+)\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm;
const sections = [...original.matchAll(sectionPattern)].map(match => {
  const [, id, timing, title, body] = match;
  const operation = body.match(/【操作】([^\r\n]+)/)?.[1]?.trim();
  const narration = body.match(/【正文】\s*([\s\S]*?)\s*【正文结束】/)?.[1]?.trim();
  if (!operation || !narration) throw Error(`Missing manuscript field: ${id}`);
  return { id, timing, title, operation, narration };
});
if (sections.length !== 12) throw Error('Expected exactly 12 sections');
const intro = original.split(/^## /m)[0].replace(/^# [^\r\n]+\r?\n/, '').trim();
const rehearsal = original.split('## 排练方法与超时删减')[1]?.trim();
if (!rehearsal) throw Error('Missing rehearsal notes');
const navigation = sections.map(s => `<a href="#${s.id}"><span>${s.id}</span><span>${esc(s.title)}</span><small>${esc(s.timing)}</small></a>`).join('\n');
const articles = sections.map(s => `<section class="speech-section" id="${s.id}" aria-labelledby="title-${s.id}"><header class="section-heading"><span class="page-number">${s.id}</span><div><p class="timing">${esc(s.timing)}</p><h2 id="title-${s.id}">${esc(s.title)}</h2></div></header><aside class="operation"><span>操作提示 · 不朗读</span><p>${esc(s.operation)}</p></aside><div class="narration" aria-label="演讲正文">${paragraphs(s.narration)}</div></section>`).join('\n');
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>路鸣职引 CareerPilot · 报告演讲稿</title>
<style>
:root{--paper:#fff;--bg:#f2f6fb;--ink:#19334f;--muted:#63748b;--blue:#216fee;--line:#dbe5f1;--speech-size:22px}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:90px}body{margin:0;background:var(--bg);color:var(--ink);font-family:'Microsoft YaHei','PingFang SC','Segoe UI',sans-serif;line-height:1.7}a{color:#1b60bd}button{font:inherit;cursor:pointer}button:disabled{cursor:default;opacity:.45}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #f4ac40;outline-offset:4px}button,a{ -webkit-tap-highlight-color:transparent}
.toolbar{position:sticky;top:0;z-index:3;background:#ffffffed;border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}.toolbar-inner{max-width:1280px;min-height:68px;margin:auto;padding:12px 26px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.toolbar-brand{font-size:15px;font-weight:700;letter-spacing:1px;color:#154c94}.controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.controls button{min-width:42px;min-height:40px;padding:6px 12px;border:1px solid #c9d8eb;border-radius:9px;background:#fff;color:#244b7d}.controls .print{background:#216fee;border-color:#216fee;color:#fff;padding-inline:18px}.hint-toggle{display:flex;gap:7px;align-items:center;min-height:40px;font-size:14px;cursor:pointer}.hint-toggle input{width:17px;height:17px;accent-color:var(--blue)}.size-label{font-size:13px;color:var(--muted);min-width:30px;text-align:center;font-variant-numeric:tabular-nums}
.hero{max-width:1228px;margin:34px auto 26px;padding:32px 38px;border:1px solid #d3e2f6;border-radius:20px;background:linear-gradient(115deg,#e4efff,#fbfdff 80%)}.kicker{font-size:12px;font-weight:700;letter-spacing:2px;color:#2868bd;margin:0 0 10px}.hero h1{margin:0 0 5px;font-size:34px;line-height:1.45;color:#10366b}.subtitle{font-size:17px;color:#526b87;margin:0 0 18px}.chips{display:flex;gap:10px;flex-wrap:wrap}.chip{padding:5px 12px;border:1px solid #ccdcf2;border-radius:20px;background:#fff;font-size:13px}.intro{font-size:14px;color:#52667e;margin:18px 0 0;max-width:920px}
.layout{max-width:1228px;margin:0 auto 50px;display:grid;grid-template-columns:248px minmax(0,1fr);gap:26px;align-items:start}.contents{position:sticky;top:94px;background:white;border:1px solid var(--line);border-radius:15px;padding:16px 12px}.contents h2{font-size:13px;letter-spacing:2px;color:#63748b;margin:0 10px 12px}.contents a{display:grid;grid-template-columns:30px minmax(0,1fr);gap:1px 9px;text-decoration:none;padding:9px 10px;border-radius:9px;color:#284768;font-size:13px;line-height:1.55}.contents a:hover{background:#edf4ff}.contents a>span:first-child{grid-row:span 2;font:12px/1.8 Consolas,monospace;color:#2d6cc0}.contents small{font-size:11px;color:#78899d;font-variant-numeric:tabular-nums}.content{min-width:0}.speech-section{scroll-margin-top:90px;background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:28px 34px;margin-bottom:22px;box-shadow:0 6px 24px #183b6810}.section-heading{display:flex;gap:17px;align-items:center;margin-bottom:22px}.page-number{flex:none;display:flex;align-items:center;justify-content:center;width:54px;height:54px;background:#eaf2ff;color:#2367c7;border-radius:13px;font:700 16px Consolas,monospace}.timing{font-size:13px;margin:0 0 3px;color:#63748b;letter-spacing:1px;font-variant-numeric:tabular-nums}.section-heading h2{margin:0;font-size:22px;line-height:1.5;color:#143e74}.operation{border-left:3px solid #e9b365;background:#fff8ee;border-radius:0 9px 9px 0;padding:12px 16px;margin-bottom:23px}.operation>span{font-size:11px;color:#8f641e;letter-spacing:1px;font-weight:700}.operation p{font-size:14px;margin:5px 0 0;color:#6e5a3b;line-height:1.8}.narration{font-size:var(--speech-size);line-height:2.05;letter-spacing:.02em;color:#1b3049}.narration p{margin:0 0 16px}.narration p:last-child{margin-bottom:0}.hide-hints .operation{display:none}.rehearsal{background:#eaf1fc;border:1px solid #d3e1f4;padding:26px 30px;border-radius:16px;margin-top:30px}.rehearsal h2{font-size:19px;margin:0 0 12px;color:#174a8f}.rehearsal p{font-size:15px;line-height:1.95;margin:12px 0}.footer{max-width:1228px;margin:0 auto 38px;font-size:12px;color:#70839c;border-top:1px solid #d7e3f0;padding:18px 0 0;overflow-wrap:anywhere}p,h1,h2,a{overflow-wrap:anywhere}
@media(max-width:1280px){.hero,.layout,.footer{margin-left:24px;margin-right:24px}.layout{grid-template-columns:220px minmax(0,1fr)}}
@media(max-width:850px){.layout{display:block}.contents{position:static;margin-bottom:22px}.contents nav{display:grid;grid-template-columns:1fr 1fr}.hero{padding:25px}.hero h1{font-size:29px}.speech-section{padding:24px}.toolbar-inner{padding:10px 20px;gap:9px}.toolbar-brand{font-size:13px}}
@media(max-width:480px){:root{--speech-size:20px}.hero,.layout,.footer{margin-left:14px;margin-right:14px}.hero{margin-top:20px;padding:22px}.hero h1{font-size:26px}.controls{gap:8px}.toolbar-inner{padding:10px 14px}.toolbar-brand{width:100%}.controls button{padding:5px 9px;min-width:38px}.hint-toggle{font-size:13px}.speech-section{padding:22px 20px}.section-heading{gap:12px}.page-number{width:45px;height:45px;font-size:14px}.section-heading h2{font-size:19px}.narration{line-height:2}.contents a{padding:8px 6px;font-size:12px}.rehearsal{padding:20px}.subtitle{font-size:15px}.footer{font-size:11px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
@media print{@page{size:A4;margin:18mm}body{background:white;color:#000}.toolbar,.contents{display:none}.hero,.layout,.footer{margin:0;padding:0;max-width:none}.hero{border:0;background:white;padding-bottom:18px;border-radius:0}.hero h1{font-size:25px}.subtitle{font-size:13px}.chips{gap:7px}.chip{font-size:11px;padding:2px 8px}.intro{font-size:11px}.layout{display:block}.speech-section{box-shadow:none;border:0;border-top:1px solid #ccc;border-radius:0;padding:20px 0;margin:0;break-inside:avoid}.section-heading{margin-bottom:12px}.section-heading h2{font-size:16px}.page-number{width:38px;height:38px;font-size:12px;print-color-adjust:exact}.timing{font-size:10px}.narration{font-size:12pt!important;line-height:1.9;letter-spacing:0}.operation{padding:8px 12px;margin-bottom:12px;print-color-adjust:exact}.operation p{font-size:10pt}.rehearsal{border:0;border-top:1px solid #ccc;background:white;padding:20px 0;margin:0}.rehearsal h2{font-size:16px}.rehearsal p{font-size:10pt}.footer{padding-top:20px;font-size:9px}}
</style>
</head>
<body>
<div class="toolbar"><div class="toolbar-inner"><span class="toolbar-brand">路鸣职引 · 演讲稿</span><div class="controls"><label class="hint-toggle"><input id="show-hints" type="checkbox" checked>显示操作提示</label><button type="button" id="font-smaller" aria-label="缩小正文字号">A−</button><span class="size-label" id="font-size" aria-live="polite">22px</span><button type="button" id="font-larger" aria-label="放大正文字号">A＋</button><button type="button" class="print" id="print">打印 / 存为PDF</button></div></div></div>
<header class="hero"><p class="kicker">CAREERPILOT · PRESENTATION SCRIPT</p><h1>路鸣职引 CareerPilot</h1><p class="subtitle">Web应用开发展示 · 报告演讲稿</p><div class="chips"><span class="chip">12页主讲</span><span class="chip">计划 7分40秒</span><span class="chip">缓冲 20秒</span><span class="chip">可离线阅读 · 可打印</span></div><p class="intro">${esc(intro)}</p></header>
<div class="layout"><aside class="contents" aria-label="逐页目录"><h2>讲述顺序</h2><nav>${navigation}</nav></aside><main class="content">${articles}<section class="rehearsal" aria-labelledby="rehearsal-title"><h2 id="rehearsal-title">排练方法与超时删减</h2>${paragraphs(rehearsal)}</section></main></div>
<footer class="footer">由已有《02-报告演讲稿.md》转换，正文保持一致。HTML整理：2026-11-19。页面时长为原稿计划，尚非真人彩排实测。<br>源稿 SHA256：${sourceHash}</footer>
<script>
const hints = document.getElementById('show-hints');
hints.addEventListener('change', () => document.body.classList.toggle('hide-hints', !hints.checked));
let size = innerWidth <= 480 ? 20 : 22;
const smaller = document.getElementById('font-smaller'), larger = document.getElementById('font-larger'), label = document.getElementById('font-size');
function applySize(){document.documentElement.style.setProperty('--speech-size', size + 'px');label.textContent = size + 'px';smaller.disabled = size <= 18;larger.disabled = size >= 30;}
smaller.addEventListener('click', () => {size = Math.max(18, size - 2);applySize();});
larger.addEventListener('click', () => {size = Math.min(30, size + 2);applySize();});
document.getElementById('print').addEventListener('click', () => window.print());
applySize();
</script>
</body></html>`;
await fs.writeFile(target, html);

// Verify conversion fidelity and the standalone reading controls in a real renderer.
const errors = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', error => errors.push(error.message));
const externalRequests = [];
page.on('request', request => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });
await page.goto(pathToFileURL(target).href);
const rendered = await page.locator('.speech-section .narration').allTextContents();
const normalized = text => text.replace(/\s+/g, '');
if (rendered.length !== sections.length || rendered.some((text, index) => normalized(text) !== normalized(sections[index].narration))) errors.push('Narration differs from source');
if (await page.locator('.operation').count() !== 12) errors.push('Operation note count');
await page.locator('#show-hints').uncheck();
if (await page.locator('.operation').first().isVisible()) errors.push('Hide hints');
await page.locator('#show-hints').check();
await page.locator('#font-larger').click();
if (await page.locator('.narration').first().evaluate(el => getComputedStyle(el).fontSize) !== '24px') errors.push('Enlarge font');
await page.locator('#font-smaller').click();
if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) errors.push('Desktop overflow');
await page.locator('.contents a[href="#P07"]').click();
if (!page.url().endsWith('#P07')) errors.push('Contents navigation');
await page.goto(pathToFileURL(target).href);
await fs.mkdir(path.join(root, 'validation'), { recursive: true });
await page.screenshot({ path: path.join(root, 'validation/演讲稿HTML-桌面.png') });
await page.setViewportSize({ width: 390, height: 844 });
if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) errors.push('Mobile overflow');
await page.screenshot({ path: path.join(root, 'validation/演讲稿HTML-窄屏.png') });
await page.emulateMedia({ media: 'print' });
if (await page.locator('.toolbar').isVisible() || await page.locator('.contents').isVisible()) errors.push('Print controls hidden');
if (externalRequests.length) errors.push('External dependency');
await browser.close();
const report = { status: errors.length ? 'failed' : 'passed', target, source, sourceSha256: sourceHash, generatedDate: '2026-11-19', sections: sections.length, narrationUnchanged: !errors.includes('Narration differs from source'), operationNotes: 12, controlsChecked: ['提示显隐', '字号调整', '目录跳转', '打印样式'], viewportWidths: [1440, 390], externalRequests, errors };
await fs.writeFile(path.join(root, 'validation/演讲稿HTML检查.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
