// Read-only safety audit against the locally committed source baseline.
// No database, env file, network, provider or production import is used.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse as sfc } from '@vue/compiler-sfc';
import { parse as template } from '@vue/compiler-dom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const base = 'f67b5404c4417ed1e82fcd444e6dc04b863352e9';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const normalize = text => text.replaceAll('\r\n', '\n');
const names = git('ls-tree', '-r', '--name-only', base).trim().split('\n');
const scriptChanges = [], missing = [], templateChanges = [], protectedChanges = [];
let scripts = 0, contracts = 0;
function decorative(node, name) {
  const attrs = node.props.map(prop => [prop.type === 6 ? prop.name : prop.name + ':' + (prop.arg?.content ?? ''), prop.type === 6 ? prop.value?.content ?? '' : prop.exp?.content ?? '']);
  const expected = name === 'src/components/public/OpportunityRows.vue' && node.tag === 'span'
    ? [['class', 'opportunity-identity'], ['aria-hidden', 'true']]
    : name === 'src/views/student/InterviewPracticeView.vue' && node.tag === 'div'
      ? [['class', 'practice-cover'], ['aria-hidden', 'true']]
      : ['src/views/PortalView.vue', 'src/views/LegacyPortalView.vue'].includes(name) && node.tag === 'img'
        ? [['class', 'editorial-thumb'], ['bind:src', `['/media/editorial/paper.webp', '/media/editorial/journey.webp', '/media/editorial/studio.webp'][${name.includes('Legacy') ? 'index' : 'i'}]`], ['alt', ''], ['width', '512'], ['height', '341'], ['loading', 'lazy']]
        : name === 'src/components/base/BrandMark.vue' && node.tag === 'image'
          ? [['href','/media/career/brand.webp'],['x','0'],['y','0'],['width','40'],['height','40']]
          : name === 'src/components/public/OpportunityRows.vue' && node.tag === 'JobArtwork'
            ? [['class','opportunity-identity'],['bind:title','job.title'],['bind:identity','job.id'],['bind:src','jobArtworkBatch(items)[i]']]
            : name === 'src/views/student/JobsView.vue' && node.tag === 'JobArtwork'
              ? [['bind:title','row.job.title'],['bind:identity','row.job.id'],['bind:src','jobArtworkBatch(filtered.map(row=>({id:row.job.id,title:row.job.title})))[artworkIndex]']]
              : name === 'src/components/public/PublicHeader.vue' && node.tag === 'RouterLink' && node.children.every(c=>c.type===2&&c.content==='职业发展')
                ? [['bind:to',"{path:'/',hash:'#preparation'}"]]
                : name === 'src/components/public/PublicHeader.vue' && node.tag === 'RouterLink' && node.children.every(c=>c.type===2&&c.content==='首页')
                  ? [['to','/']]
                : name === 'src/components/public/PublicHeader.vue' && node.tag === 'a' && node.children.every(c=>c.type===2&&c.content==='政策资讯')
                  ? [['href','https://www.ncss.cn/zcxw'],['target','_blank'],['rel','noopener noreferrer']]
                  : null;
  if(name === 'src/views/student/InterviewPracticeView.vue' && node.tag === 'section' && JSON.stringify(attrs)===JSON.stringify([['class','practice-journey'],['aria-label','练习进阶指引']])) {
    const isStatic=n=>n.type===2||n.type===1&&n.props.every(p=>p.type===6)&&n.children.every(isStatic);
    return node.children.every(isStatic);
  }
  return expected && (node.children.length===0||['RouterLink','a'].includes(node.tag)) && JSON.stringify(attrs) === JSON.stringify(expected);
}
function bindings(source, name) {
  const content = sfc(source).descriptor.template?.content;
  if (!content) return [];
  const records = [];
  function visit(node) {
    // Skip only exact presentation nodes in the explicitly named templates. Any extra event,
    // changed URL/expression/alt/dimension or a new child remains part of the audit.
    if (node.type === 1 && decorative(node, name)) return;
    if (node.type === 1) for (const prop of node.props) {
      const arg = prop.arg?.content ?? '';
      const presentation = prop.type === 6 ? ['class', 'style', 'data-scene'].includes(prop.name)
        : prop.name === 'bind' && (['class', 'style'].includes(arg) || node.tag === 'BrandMark' && arg === 'size');
      const forwarding = name === 'src/components/base/AppOverlay.vue' && node.tag === 'section' && prop.type === 7 && prop.name === 'bind' && !arg && prop.exp?.content === '$attrs';
      const toastLayer = ['src/components/base/AppToast.vue', 'src/components/base/AppOverlay.vue'].includes(name) && node.tag === 'Teleport' && prop.type === 6 && prop.name === 'to' && prop.value?.content === 'body';
      if (presentation || forwarding || toastLayer) continue;
      let value=prop.type === 6 ? prop.value?.content ?? '' : prop.exp?.content ?? '';
      if(prop.type===7&&prop.name==='for'&&name==='src/components/public/OpportunityRows.vue'&&value==='(job, i) in items')value='job in items';
      if(prop.type===7&&prop.name==='for'&&name==='src/views/student/JobsView.vue'&&value==='(row, artworkIndex) in filtered')value='row in filtered';
      records.push([node.tag, prop.type === 6 ? prop.name : prop.name + ':' + arg,value,prop.modifiers?.map(x => x.content ?? x) ?? []]);
    }
    for (const child of node.children ?? []) visit(child);
  }
  visit(template(content)); return records;
}
for (const name of names) {
  const protectedFile = /^(server|gateway|src\/(services|adapters|stores|domain|router|types|contracts|composables|data))\//.test(name) || ['package.json', 'package-lock.json', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'tsconfig.json'].includes(name);
  if (!protectedFile && !name.endsWith('.vue')) continue;
  if (!fs.existsSync(path.join(root, name))) { missing.push(name); continue; }
  const before = normalize(git('show', `${base}:${name}`)), after = normalize(fs.readFileSync(path.join(root, name), 'utf8'));
  if (protectedFile && before !== after) protectedChanges.push(name);
  if (!name.endsWith('.vue')) continue;
  scripts++;
  const getScripts = text => [...text.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].map(x => x[0]).join('\n')
    .replace(name==='src/components/public/OpportunityRows.vue'? /import JobArtwork from "\.\.\/base\/JobArtwork.vue";\nimport \{ jobArtworkBatch \} from '\.\.\/\.\.\/presentation\/job-artwork';\n/ : name==='src/views/student/JobsView.vue'? /import JobArtwork from "\.\.\/\.\.\/components\/base\/JobArtwork.vue";\nimport \{ jobArtworkBatch \} from '\.\.\/\.\.\/presentation\/job-artwork';\n/ : /(?!) /,'');
  if (getScripts(before) !== getScripts(after)) scriptChanges.push(name);
  const original = bindings(before, name), current = bindings(after, name); contracts += original.length;
  if (JSON.stringify(original) !== JSON.stringify(current)) templateChanges.push({ name, original, current });
}
const addedProtected = git('ls-files', '--others', '--exclude-standard').trim().split('\n').filter(name => /^(server|gateway|src\/(services|adapters|stores|domain|router|types|contracts|composables|data))\//.test(name));
const shell = fs.readFileSync(path.join(root, 'src/components/layout/AppShell.vue'), 'utf8');
const key = shell.match(/:key="[^"]*route\.path[^"]*"/)?.[0];
const oldKey = git('show', `${base}:src/components/layout/AppShell.vue`).match(/:key="[^"]*route\.path[^"]*"/)?.[0];
const result = { checkedAt: new Date().toISOString(), base, scripts, templateAttributeContracts: contracts,
  scriptChanges, templateChanges, protectedChanges, addedProtected, missing, interviewKeyUnchanged: !!key && key === oldKey,
  presentationExceptions: ['class/style', 'BrandMark size', 'static data-scene', 'AppOverlay $attrs forwarding', 'AppToast Teleport wrapper with original controls/events', 'exact local decorative nodes/brand image/JobArtwork bindings', 'two exact paired presentation imports and v-for index aliases in named files', 'three exact public navigation links', 'static practice journey subtree; no directives/events'],
  limitation: 'Source invariant audit, not exhaustive runtime proof, actual-device acceptance or an absolute risk guarantee.' };
console.log(JSON.stringify(result, null, 2));
if ([scriptChanges, templateChanges, protectedChanges, addedProtected, missing].some(x => x.length) || !result.interviewKeyUnchanged) process.exitCode = 1;
