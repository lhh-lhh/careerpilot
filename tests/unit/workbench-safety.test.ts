import {afterEach,expect,it} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSqlDatabase} from '../../server/database';
import {createWorkbenchProvider} from '../../server/workbench/provider';
const cleanup:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const c of cleanup.splice(0))await c();});
async function setup(transport:typeof fetch){const root=await mkdtemp(join(tmpdir(),'cp-stream-')),db=createSqlDatabase(join(root,'db.sqlite'));cleanup.push(async()=>{await db.close();await rm(root,{recursive:true,force:true});});return createWorkbenchProvider(db,{enabled:true,apiKey:'test',dailyGlobalCalls:10,dailyUserCalls:10,transport});}
it('stream rejects EOF without terminal completion rather than saving a truncated answer',async()=>{
 const p=await setup(async()=>new Response('data: {"choices":[{"delta":{"content":"半句"}}]}\n\n'));
 await expect(p.chat('u',[],()=>{},new AbortController().signal)).rejects.toThrow('UPSTREAM_ERROR');
});
it('stream refusal wins over already delivered text and is never a successful final answer',async()=>{
 const p=await setup(async()=>new Response('data: {"choices":[{"delta":{"content":"暂显文本"}}]}\n\ndata: {"choices":[{"finish_reason":"content_filter","delta":{}}]}\n\ndata: [DONE]\n\n'));
 await expect(p.chat('u',[],()=>{},new AbortController().signal)).rejects.toThrow('INPUT_BLOCKED');
});
it('provider enforces the global account calls cap across different operations',async()=>{
 let calls=0;const p=await setup(async()=>{calls++;return new Response('{"choices":[{"finish_reason":"stop","message":{"content":"{}"}}]}');});
 for(let i=0;i<10;i++)await p.json('u'+i,'task',{});
 await expect(p.json('other','task',{})).rejects.toThrow('BUDGET_EXCEEDED');expect(calls).toBe(10);
});
it('invalid configured limits disable paid work instead of silently removing the budget',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cp-invalid-budget-')),db=createSqlDatabase(join(root,'db.sqlite'));cleanup.push(async()=>{await db.close();await rm(root,{recursive:true,force:true});});
 for(const limit of [NaN,Infinity,-1,0,0.5,10001]){
  const p=createWorkbenchProvider(db,{enabled:true,apiKey:'test',dailyGlobalCalls:limit,dailyUserCalls:10,transport:async()=>{throw Error('Must not call');}});
  expect(p.status().enabled).toBe(false);await expect(p.text('u','test',{})).rejects.toThrow('PROVIDER_DISABLED');
 }
});
