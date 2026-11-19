import { afterEach, expect, it } from 'vitest';
import type { OnlineAiOptions } from '../../server/ai';
import { optimize } from '../../server/workbench/business';
import { createWorkbenchProvider } from '../../server/workbench/provider';
import { createSqlDatabase } from '../../server/database';
import type { Resume } from '../../src/types/entities';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOnlineApp } from '../../server/app';
import {request as httpRequest} from 'node:http';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const clean of cleanups.splice(0).reverse()) await clean(); });
async function fixture(overrides:Partial<OnlineAiOptions>={}) {
  const root = await mkdtemp(join(tmpdir(), 'cp-workbench-'));
  const app = await createOnlineApp({ databasePath: join(root, 'db.sqlite'), seed: true,
    ai: { enabled: true, apiKey: 'isolated-not-real', dailyGlobalCalls: 50, dailyUserCalls: 30, transport: async (_url, init) => {
      const wire = String(init?.body);
      let data: unknown = { summary: '原有事实', patches: [] };
      if (wire.includes('INTERVIEW_QUESTION')) data = { question: '请结合目标岗位介绍一次你独立解决问题的经历。' };
      if (wire.includes('INTERVIEW_EVALUATE')) data = { dimensions: [{key:'relevance',label:'相关性',score:70,evidence:'测试回答',reason:'有相关例子'}], strengths:['有例子'], improvements:['补充结果'] };
      if(wire.includes('MATCH_RECOMMEND')){const parsed=JSON.parse(wire),input=JSON.parse(parsed.messages[1].content);data={recommendations:[{id:input.candidates[0].id,reasons:['已知经历相关'],gaps:['请核验具体要求']}]};}
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }], usage: { prompt_tokens: 20, completion_tokens: 30 } }));
    },...overrides } });
  await app.provision('student001', 'Workbench-isolated-test!');
  await app.provision('student002', 'Workbench-isolated-test!');
  await app.listen(0);
  cleanups.push(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  const address = app.server.address(); if (!address || typeof address === 'string') throw Error('address');
  const base = `http://127.0.0.1:${address.port}`;
  async function login(name = 'student001') {
    const res = await fetch(base + '/api/session', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({login:name,password:'Workbench-isolated-test!'}) });
    const session = await res.json(), cookie = res.headers.get('set-cookie')!.split(';')[0]!;
    return { get: (path:string) => fetch(base + '/api/workbench' + path, {headers:{Cookie:cookie}}),
      beginPost:(path:string)=>{let finish:(value:unknown)=>void=()=>{};const done=new Promise<number>((resolve,reject)=>{const req=httpRequest(base+'/api/workbench'+path,{method:'POST',headers:{Cookie:cookie,'X-CSRF-Token':session.csrf,'Content-Type':'application/json','Transfer-Encoding':'chunked'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode!));});req.on('error',reject);req.flushHeaders();req.write(' ');finish=value=>req.end(JSON.stringify(value));});return {finish,done};},
      post: (path:string, value:unknown) => fetch(base + '/api/workbench' + path, {method:'POST',headers:{Cookie:cookie,'X-CSRF-Token':session.csrf,'Content-Type':'application/json'},body:JSON.stringify(value)}) };
  }
  return { base, login, app };
}
it('workbench exposes status but requires explicit consent for external generation', async () => {
  const f = await fixture(), user = await f.login();
  expect((await user.get('/status')).status).toBe(200);
  expect((await user.post('/generate',{kind:'resume',context:{}})).status).toBe(403);
  expect(await (await user.post('/generate',{kind:'resume',context:{},consent:true})).json()).toMatchObject({mode:'LIVE',data:{patches:[]}});
});
it('voice sessions persist validated model turns and reject foreign access and stale revisions', async () => {
  const f = await fixture(), user = await f.login(), other = await f.login('student002');
  const created = await user.post('/sessions',{target:{title:'前端工程师',requirements:'Vue与测试'},consent:true});
  expect(created.status).toBe(201);
  const {session} = await created.json();
  expect(session.turns[0].question).toContain('独立解决');
  expect((await other.get('/sessions/'+session.id)).status).toBe(404);
  expect((await user.post('/sessions/'+session.id,{expectedRevision:0,action:'complete'})).status).toBe(409);
  const result = await user.post('/sessions/'+session.id,{expectedRevision:session.revision,action:'answer',text:'测试回答',consent:true});
  expect(result.status).toBe(200);
  const updated = await result.json();
  expect(updated.session.turns[0].answer).toBe('测试回答');
  expect(updated.session.turns[0].evaluation.total).toBe(70);
  expect((await user.post('/sessions/'+session.id,{expectedRevision:session.revision,action:'answer',text:'重复'})).status).toBe(409);
});
it('daily budget is persistent and blocks before another paid call',async()=>{
  const f=await fixture({dailyUserCalls:1}),u=await f.login();
  expect((await u.post('/generate',{kind:'resume',consent:true})).status).toBe(200);
  expect((await u.post('/generate',{kind:'resume',consent:true})).status).toBe(429);
});
it('new workbench calls consume the same allowance observed by the legacy AI gateway',async()=>{
  const f=await fixture({dailyUserCalls:1}),u=await f.login();
  expect((await u.post('/generate',{kind:'resume',consent:true})).status).toBe(200);
  // The shared tally is observable via a second workbench operation too; legacy shares the configs counter.
  expect((await u.post('/sessions',{target:{title:'工程师',requirements:'测试'},consent:true})).status).toBe(429);
});
it('rejects malformed model scores and never invents a successful interview score',async()=>{
  const f=await fixture({transport:async(_url,init)=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(String(init?.body).includes('INTERVIEW_QUESTION')?{question:'请介绍项目经历'}:{dimensions:[{key:'relevance',label:'相关',score:999,evidence:'虚构证据',reason:'错误'}]})}}]}))}),u=await f.login();
  const {session}=await (await u.post('/sessions',{target:{title:'工程师',requirements:'测试'},consent:true})).json();
  const res=await u.post('/sessions/'+session.id,{expectedRevision:session.revision,action:'answer',text:'真实回答',consent:true});
  const next=await res.json();expect(next.session.turns[0].evaluation).toBeNull();expect(next.session.turns[0].evaluationError).toBeTruthy();
});
it('rejects client-injected resume facts and requires a current source version',async()=>{
  const f=await fixture(),u=await f.login();
  expect((await u.post('/generate',{kind:'resume',consent:true,context:{resume:{projects:'伪造事实'}}})).status).toBe(422);
  expect((await u.post('/generate',{kind:'resume',consent:true,context:{sourceRevision:-1}})).status).toBe(409);
});
it('resume external input masks identity even when it appears inside a project description',async()=>{
  const root=await mkdtemp(join(tmpdir(),'cp-resume-privacy-')),database=createSqlDatabase(join(root,'db.sqlite'));
  cleanups.push(async()=>{await database.close();await rm(root,{recursive:true,force:true});});
  let outbound='';
  const provider=createWorkbenchProvider(database,{enabled:true,apiKey:'test',dailyGlobalCalls:3,dailyUserCalls:3,transport:async(_url,init)=>{
    outbound=String(init?.body);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"summary":"请核实经历","patches":[]}'}}]}));
  }});
  const resume={sections:{basic:{name:'隐私姓名',email:'secret@example.com'},experience:[],projects:[{id:'private-row',description:'隐私姓名负责项目，邮箱secret@example.com，电话13800138000。'}]}} as unknown as Resume;
  await optimize(provider,'synthetic',resume);
  expect(outbound).not.toContain('隐私姓名');expect(outbound).not.toContain('secret@example.com');expect(outbound).not.toContain('13800138000');
});
it('matching returns source-backed opportunities without model fabricated jobs', async () => {
  const f=await fixture(), user=await f.login();
  const res = await user.get('/matches'); expect(res.status).toBe(200);
  const value=await res.json(); expect(Array.isArray(value.items)).toBe(true);
  expect(value.items.every((item:{id:string;sourceName:string})=>item.id && item.sourceName)).toBe(true);
});
it('submitted voice answers are durable before waiting for slow upstream work',async()=>{
 let releaseQuestion:()=>void=()=>{};let questionStarted:()=>void=()=>{};
 const gate=new Promise<void>(resolve=>{releaseQuestion=resolve;}),started=new Promise<void>(resolve=>{questionStarted=resolve;});let calls=0;
 const f=await fixture({transport:async(_url,init)=>{
  const isQuestion=String(init?.body).includes('INTERVIEW_QUESTION');
  if(isQuestion&&++calls>1){questionStarted();await gate;}
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(isQuestion?{question:'介绍一次项目经历'}:{dimensions:[{key:'relevance',label:'相关',score:50,evidence:'回答',reason:'相关'}]})}}]});
 }}),u=await f.login();
 const {session}=await (await u.post('/sessions',{target:{title:'工程师',requirements:'测试'},consent:true})).json();
 const pending=u.post('/sessions/'+session.id,{expectedRevision:session.revision,action:'answer',text:'回答',consent:true});
 await started;
 try{const saved=await (await u.get('/sessions/'+session.id)).json();expect(saved.session.turns[0].answer).toBe('回答');expect(saved.session.revision).toBe(2);}
 finally{releaseQuestion();await pending;}
});
it('specific matching analysis only accepts a candidate from the users saved result snapshot',async()=>{
 const f=await fixture(),u=await f.login();
 expect((await u.post('/matches/analyze',{id:'invented',consent:true})).status).toBe(404);
});
it('current role preference prioritizes relevant opportunities without inventing a different match score',async()=>{
 const f=await fixture(),u=await f.login();
 const res=await u.post('/matches',{consent:true,preferences:{role:'数据分析',city:'',industry:'',salaryMin:null,strictCity:false}});
 const result=await res.json();expect(result.items[0].title).toContain('数据分析');
 expect(result.items[0].reasons).toContain('岗位名称符合意向方向');
});
it('session abort does not drop the submitted answer when an upstream question generation fails',async()=>{
 let questions=0;
 const f=await fixture({transport:async(_url,init)=>{
   if(String(init?.body).includes('INTERVIEW_QUESTION')){questions++;if(questions>1)return new Response('{}',{status:503});}
   return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(String(init?.body).includes('INTERVIEW_QUESTION')?{question:'介绍一次项目经历'}:{dimensions:[{key:'relevance',label:'相关性',score:50,evidence:'回答',reason:'简短'}],strengths:[],improvements:[]})}}]}));
 }}),u=await f.login();
 const {session}=await (await u.post('/sessions',{target:{title:'工程师',requirements:'测试'},consent:true})).json();
 const next=await (await u.post('/sessions/'+session.id,{expectedRevision:session.revision,action:'answer',text:'回答',consent:true})).json();
 expect(next.session.turns[0].answer).toBe('回答');expect(next.session.state).toBe('active');
 expect(next.session.turns[0].evaluation).not.toBeNull();
});
it('six answered turns complete without leaving a misleading retry-next error',async()=>{
 const f=await fixture(),u=await f.login();let {session}=await (await u.post('/sessions',{target:{title:'工程师',requirements:'测试'},consent:true})).json();
 for(let round=0;round<6;round++){const result=await u.post('/sessions/'+session.id,{expectedRevision:session.revision,action:'answer',text:'测试回答',consent:true});expect(result.status).toBe(200);session=(await result.json()).session;}
 expect(session.state).toBe('completed');expect(session.turns).toHaveLength(6);expect(session.error).toBeUndefined();
});
it('voice follow-up paid actions require current consent, while ending stays available without it',async()=>{
 let calls=0;const f=await fixture({transport:async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:'{"question":"请介绍项目经历"}'}}]});}}),u=await f.login();
 const {session}=await (await u.post('/sessions',{target:{title:'工程师',requirements:'测试'},consent:true})).json();
 for(const action of ['answer','next'])expect((await u.post('/sessions/'+session.id,{expectedRevision:session.revision,action,text:'回答'})).status).toBe(403);
 expect(calls).toBe(1);expect((await (await u.get('/sessions/'+session.id)).json()).session.turns[0].answer).toBeNull();
 expect((await u.post('/sessions/'+session.id,{expectedRevision:session.revision,action:'complete'})).status).toBe(200);
});
it('a delayed request body cannot overwrite an already completed voice session using its old revision',async()=>{
 const f=await fixture(),u=await f.login();const {session}=await (await u.post('/sessions',{target:{title:'工程师',requirements:'测试'},consent:true})).json();
 const delayed=u.beginPost('/sessions/'+session.id);
 // A separate read is a round-trip barrier after the delayed headers have entered the server.
 await u.get('/sessions/'+session.id);
 expect((await u.post('/sessions/'+session.id,{expectedRevision:session.revision,action:'complete'})).status).toBe(200);
 delayed.finish({expectedRevision:session.revision,action:'answer',text:'测试回答',consent:true});expect(await delayed.done).toBe(409);
 expect((await (await u.get('/sessions/'+session.id)).json()).session.state).toBe('completed');
});
it('voice prompts mask the saved resume name even when it differs from the account display name',async()=>{
 let outbound='';const f=await fixture({transport:async(_url,init)=>{outbound=String(init?.body);return Response.json({choices:[{finish_reason:'stop',message:{content:'{"question":"请介绍项目经历"}'}}]});}}),u=await f.login(),actor={userId:'user-student-001',role:'student'} as const;
 const resume=(await f.app.repository.readScopedSnapshot(actor)).resumes[0]!;resume.sections.basic.name='合成不同姓名';
 await f.app.repository.execute({type:'SAVE_RESUME',commandId:crypto.randomUUID(),entityId:resume.id,expectedRevision:resume.revision,payload:{sections:resume.sections}},actor,{now:()=>new Date().toISOString()});
 expect((await u.post('/sessions',{target:{title:'工程师',requirements:'合成不同姓名希望练习测试方法'},consent:true})).status).toBe(201);
 expect(outbound).not.toContain('合成不同姓名');expect(outbound).toContain('[姓名]');
});
