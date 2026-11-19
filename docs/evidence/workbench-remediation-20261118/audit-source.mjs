// Read-only source invariants against the exact pre-upgrade commit.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from '@vue/compiler-sfc';
import { parse as template } from '@vue/compiler-dom';
import {createHash} from 'node:crypto';
const root=process.cwd(), base='5295f53ea4d1d433d933738156422e8c43c23717';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024});
const names=git('ls-tree','-r','--name-only',base).trim().split('\n');
const normalize=s=>s.replaceAll('\r\n','\n');
const protectedNames=/^(server|gateway|src\/(services|adapters|stores|domain|router|types|contracts|composables|data))\//;
const addedImports=/^import (?:WorkbenchHeader|WorkbenchGuide|InterviewCalendar|JobArtwork) from ['"][^'"\n]+['"];?\n/gm;
function scripts(s){return normalize([...s.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].map(x=>x[0]).join('\n')).replace(addedImports,'').replace(/^import EntityMark from "\.\.\/\.\.\/components\/base\/EntityMark.vue";\n/gm,'');}
const presentationTags=new Set(['WorkbenchHeader','WorkbenchGuide','InterviewCalendar','JobArtwork']);
function contracts(s){
 const content=parse(s).descriptor.template?.content;if(!content)return [];
 const records=[];
 function visit(n){
  if(n.type===1){
   if(presentationTags.has(n.tag)&&n.tag!=='WorkbenchHeader')return;
   for(const p of n.props){
    const arg=p.arg?.content??'';
    if(p.type===6&&['class','style','data-scene'].includes(p.name))continue;
    if(p.type===7&&(p.name==='slot'||p.name==='bind'&&['class','style'].includes(arg)))continue;
    // Noninteractive layout containers have no business contracts; all nested controls still traverse.
    const key=p.type===6?p.name:p.name+':'+arg;
    if(n.tag==='template'&&p.name==='slot')continue;
    records.push([n.tag,key,p.type===6?p.value?.content??'':p.exp?.content??'',p.modifiers?.map(x=>x.content??x)??[]]);
   }
  }
  for(const c of n.children??[])visit(c);
 }
 visit(template(content));return records;
}
const scriptChanges=[],protectedChanges=[],bindingChanges=[];
const fingerprint=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
for(const name of names){
 if(!protectedNames.test(name)&&!name.endsWith('.vue')&&!['package.json','package-lock.json','vite.config.ts','playwright.config.ts','vitest.config.ts'].includes(name))continue;
 const before=normalize(git('show',`${base}:${name}`)),after=normalize(fs.readFileSync(path.join(root,name),'utf8'));
 if(!name.endsWith('.vue')){if(before!==after)protectedChanges.push(name);continue;}
 if(scripts(before)!==scripts(after))scriptChanges.push({name,sha256:fingerprint(scripts(after))});
 const old=contracts(before),now=contracts(after);
 const count=rows=>{const m=new Map();for(const r of rows){const k=JSON.stringify(r);m.set(k,(m.get(k)??0)+1);}return m;};
 const a=count(old),b=count(now),removed=[],added=[];
 for(const [key,num]of a)if((b.get(key)??0)<num)removed.push({contract:JSON.parse(key),count:num-(b.get(key)??0)});
 for(const [key,num]of b)if((a.get(key)??0)<num)added.push({contract:JSON.parse(key),count:num-(a.get(key)??0)});
 if(removed.length||added.length)bindingChanges.push({name,removed,added,sha256:fingerprint({removed,added})});
}
const addedProtected=git('ls-files','--others','--exclude-standard').trim().split('\n').filter(n=>protectedNames.test(n));
const approvalPath=path.join(root,'docs/evidence/workbench-remediation-20261118/presentation-exceptions.json');
const approvals=fs.existsSync(approvalPath)?JSON.parse(fs.readFileSync(approvalPath,'utf8')):{scripts:[],bindings:[]};
const unreviewedScripts=scriptChanges.filter(change=>!approvals.scripts.some(a=>a.name===change.name&&a.sha256===change.sha256));
const unreviewedBindings=bindingChanges.filter(change=>!approvals.bindings.some(a=>a.name===change.name&&a.sha256===change.sha256));
const result={base,checkedAt:new Date().toISOString(),protectedChanges,addedProtected,scriptChanges,bindingChanges,unreviewedScripts,unreviewedBindings,limitation:'Diff audit, not exhaustive behavioral proof. Exact-hash presentation exceptions receive explicit manual diff review, not independent review; any subsequent change invalidates approval. Runtime E2E and screenshot comparison remain required.'};
console.log(JSON.stringify(result,null,2));
if(protectedChanges.length||addedProtected.length||unreviewedScripts.length||unreviewedBindings.length)process.exitCode=1;
