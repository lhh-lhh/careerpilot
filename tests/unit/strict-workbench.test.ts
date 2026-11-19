import {afterEach,expect,it} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import sharp from 'sharp';
import {createOnlineApp} from '../../server/app';
const cleanup:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
async function fixture(transport:typeof fetch,enabled=true){
 const root=await mkdtemp(join(tmpdir(),'cp-strict-')),path=join(root,'db.sqlite');
 const app=await createOnlineApp({databasePath:path,seed:true,ai:{enabled,apiKey:'isolated-not-real',dailyGlobalCalls:50,dailyUserCalls:40,transport}});
 cleanup.push(async()=>{await app.close();await rm(root,{recursive:true,force:true});});
 await app.provision('student001','Strict-fixture-only!');await app.listen(0);
 const a=app.server.address();if(!a||typeof a==='string')throw Error('address');const base=`http://127.0.0.1:${a.port}`;
 const r=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'student001',password:'Strict-fixture-only!'})});
 const s=await r.json(),headers={Cookie:r.headers.get('set-cookie')!.split(';')[0]!,'X-CSRF-Token':s.csrf};
 return {path,app,get:(route:string)=>fetch(base+'/api/workbench'+route,{headers}),post:(route:string,value:unknown)=>fetch(base+'/api/workbench'+route,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(value)}),ocr:(bytes:Uint8Array,consent=true)=>fetch(base+'/api/workbench/documents/ocr',{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent('synthetic.png'),'X-AI-Consent':String(consent)},body:Buffer.from(bytes)})};
}
const preferences={role:'数据分析',city:'',industry:'',salaryMin:null,strictCity:false};
function reply(data:unknown){return Response.json({id:'synthetic-upstream-id',choices:[{finish_reason:'stop',message:{content:JSON.stringify(data)}}],usage:{prompt_tokens:20,completion_tokens:30}});}
it('opening match results never generates or masquerades a local snapshot as AI',async()=>{
 let n=0;const f=await fixture(async()=>{n++;return reply({});});
 expect(await (await f.get('/matches')).json()).toMatchObject({items:[]});expect(n).toBe(0);
 expect((await f.post('/matches',{preferences})).status).toBe(403);expect(n).toBe(0);
});
it('AI match recommendations call the model and cannot change source facts or rule scores',async()=>{
 let input:Record<string,unknown>={};const f=await fixture(async(_url,init)=>{const wire=JSON.parse(String(init?.body));input=JSON.parse(wire.messages[1].content);const rows=input.candidates as {id:string}[];return reply({recommendations:[{id:rows[0]!.id,reasons:['已知经历与岗位任务相关'],gaps:['需核验完整岗位要求']}]});});
 const r=await f.post('/matches',{preferences,consent:true});expect(r.status).toBe(200);const value=await r.json();
 expect(value.items.find((i:{aiRank?:number})=>i.aiRank===1)).toMatchObject({aiReasons:['已知经历与岗位任务相关']});
 expect(value.provenance).toMatchObject({provider:'deepseek',upstreamRequestId:'synthetic-upstream-id',usage:{prompt:20,completion:30}});
 expect(JSON.stringify(input)).not.toMatch(/林知夏|@example/);
 expect(value.items.every((i:{id:string;sourceName:string})=>i.id&&i.sourceName)).toBe(true);
});
it.each(['invented','duplicate'])('rejects %s model candidate IDs without a rule fallback',async kind=>{
 const f=await fixture(async(_url,init)=>{const wire=JSON.parse(String(init?.body)),input=JSON.parse(wire.messages[1].content),id=kind==='invented'?'not-real':input.candidates[0].id,row={id,reasons:['依据'],gaps:[]};return reply({recommendations:kind==='duplicate'?[row,row]:[row]});});
 expect((await f.post('/matches',{preferences,consent:true})).status).toBe(502);
 expect(await (await f.get('/matches')).json()).toMatchObject({items:[]});
});
it('disabled and failed model recommendation never returns local AI results',async()=>{
 const disabled=await fixture(async()=>{throw Error('must not call');},false);
 expect((await disabled.post('/matches',{preferences,consent:true})).status).toBe(503);
 const f=await fixture(async()=>new Response('{}',{status:402}));
 expect((await f.post('/matches',{preferences,consent:true})).status).toBe(429);
 expect(await (await f.get('/matches')).json()).toMatchObject({items:[]});
 const sql=new DatabaseSync(f.path);try{const row=sql.prepare('SELECT status,error_code,data FROM deepseek_calls').get();expect(row?.status).toBe('failed');expect(String(row?.data)).not.toContain('isolated-not-real');}finally{sql.close();}
});
it('OCR validates bytes, consent and provider JSON before exposing pages, without writing attachments',async()=>{
 const png=await sharp({create:{width:50,height:20,channels:3,background:'white'}}).png().toBuffer();let n=0;
 const f=await fixture(async(url,init)=>{n++;expect(String(url)).toBe('https://api.deepseek.com/v1/tools/ocr');const form=init?.body as FormData;expect([...form.keys()].sort()).toEqual(['file','purpose']);expect(form.get('purpose')).toBe('text_recognition');return Response.json({id:'ocr-test',object:'ocr.result',page_count:1,pages:[{index:0,text:'合成测试资料',finish_reason:'length'}],usage:{input_tokens:3,output_tokens:4}});});
 const baselineSql=new DatabaseSync(f.path);const before=baselineSql.prepare('SELECT count(*) as n FROM attachments').get()?.n;baselineSql.close();
 expect((await f.ocr(png,false)).status).toBe(403);expect(n).toBe(0);
 expect((await f.ocr(new TextEncoder().encode('not an image'))).status).toBe(422);expect(n).toBe(0);
 const result=await f.ocr(png);expect(result.status).toBe(200);expect(await result.json()).toMatchObject({page_count:1,pages:[{text:'合成测试资料',finish_reason:'length'}],provenance:{provider:'deepseek',upstreamRequestId:'ocr-test'}});expect(n).toBe(1);
 const sql=new DatabaseSync(f.path);try{expect(sql.prepare('SELECT count(*) as n FROM attachments').get()?.n).toBe(before);const row=sql.prepare('SELECT status,data FROM deepseek_calls').get();expect(row?.status).toBe('success');expect(String(row?.data)).not.toContain('合成测试资料');}finally{sql.close();}
});
it('OCR HTTP200 error and excess document size are failures, never local extracted answers',async()=>{
 const f=await fixture(async()=>Response.json({error:{code:'gateway_timeout_error',message:'private detail'}}));
 const png=await sharp({create:{width:3,height:3,channels:3,background:'white'}}).png().toBuffer();
 expect((await f.ocr(png)).status).toBe(502);
 expect((await f.ocr(new Uint8Array(2*1024*1024+1))).status).toBe(413);
});
it('OCR rejects PDFs with over20 pages before any paid call',async()=>{
 let calls=0;const f=await fixture(async()=>{calls++;return Response.json({});});
 const {jpegPagesPdf}=await import('../../src/services/resume-pdf');
 // A valid multi-page PDF generated by the existing production exporter.
 const jpeg=await sharp({create:{width:2,height:2,channels:3,background:'white'}}).jpeg().toBuffer();
 const pdf=jpegPagesPdf(Array.from({length:21},()=>({bytes:new Uint8Array(jpeg),width:2,height:2})));
 expect((await f.ocr(pdf)).status).toBe(422);expect(calls).toBe(0);
});
it('malformed model JSON records failure and never stamps a success receipt',async()=>{
 const f=await fixture(async()=>Response.json({id:'bad-json',choices:[{finish_reason:'stop',message:{content:'not-json'}}]}));
 expect((await f.post('/generate',{kind:'resume',consent:true})).status).toBe(502);
 const sql=new DatabaseSync(f.path);try{expect(sql.prepare('SELECT status,error_code FROM deepseek_calls').get()).toMatchObject({status:'failed',error_code:'SCHEMA_INVALID'});}finally{sql.close();}
});
it('saved match analysis refuses stale resume versions before another external call',async()=>{
 let n=0;const f=await fixture(async(_url,init)=>{n++;const wire=JSON.parse(String(init?.body)),input=JSON.parse(wire.messages[1].content);return reply({recommendations:[{id:input.candidates[0].id,reasons:['依据'],gaps:[]}]});});
 const result=await (await f.post('/matches',{preferences,consent:true})).json();
 const actor={userId:'user-student-001',role:'student'} as const,resume=(await f.app.repository.readScopedSnapshot(actor)).resumes[0]!;
 resume.sections.projects[0]!.description+=' 已更新。';
 await f.app.repository.execute({type:'SAVE_RESUME',commandId:crypto.randomUUID(),entityId:resume.id,expectedRevision:resume.revision,payload:{sections:resume.sections}},actor,{now:()=>new Date().toISOString()});
 expect((await f.post('/matches/analyze',{id:result.items[0].id,consent:true})).status).toBe(409);expect(n).toBe(1);
});
it.each(['resume','matches','analysis'])('discards %s output when the resume changes during the paid call',async kind=>{
 let change=false;const f=await fixture(async(_url,init)=>{
  const wire=JSON.parse(String(init?.body)),input=JSON.parse(wire.messages[1].content);
  if(change){const actor={userId:'user-student-001',role:'student'} as const,r=(await f.app.repository.readScopedSnapshot(actor)).resumes[0]!;
   r.sections.projects[0]!.description+=' 新版本';await f.app.repository.execute({type:'SAVE_RESUME',commandId:crypto.randomUUID(),entityId:r.id,expectedRevision:r.revision,payload:{sections:r.sections}},actor,{now:()=>new Date().toISOString()});}
  if(wire.messages[0].content.includes('MATCH_RECOMMEND'))return reply({recommendations:[{id:input.candidates[0].id,reasons:['依据'],gaps:[]}]});
  if(kind==='resume')return reply({summary:'仅整理原事实',patches:[]});
  return Response.json({choices:[{finish_reason:'stop',message:{content:'匹配解释'}}]});
 });
 let id='';if(kind==='analysis')id=(await (await f.post('/matches',{preferences,consent:true})).json()).items[0].id;
 change=true;const route=kind==='resume'?'/generate':kind==='matches'?'/matches':'/matches/analyze';
 expect((await f.post(route,{kind:'resume',id,preferences,consent:true})).status).toBe(409);
});
it('no eligible candidates returns an explicit empty non-AI result without a paid request',async()=>{
 let calls=0;const f=await fixture(async()=>{calls++;return reply({});});
 const sql=new DatabaseSync(f.path);sql.exec('DELETE FROM jobs');sql.close();
 const r=await f.post('/matches',{preferences,consent:true});expect(r.status).toBe(200);
 expect(await r.json()).toMatchObject({items:[],mode:'EMPTY'});expect(calls).toBe(0);
});
it('Search HTTP200 error is rejected rather than silently supplied to the chat model',async()=>{
 const f=await fixture(async url=>String(url).endsWith('/search')?Response.json({error:{code:'failed'},results:[]}):new Response('data: {"choices":[{"delta":{"content":"incorrect success"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
 const r=await f.post('/chat',{message:'合成公开查询',web:true,consent:true});const wire=await r.text();
 expect(wire).toContain('event: error');expect(wire).not.toContain('event: done');
 const sql=new DatabaseSync(f.path);try{expect(sql.prepare('SELECT status,error_code FROM deepseek_calls').get()).toMatchObject({status:'failed',error_code:'UPSTREAM_ERROR'});}finally{sql.close();}
});
it.each([{failure:()=>new Response('{}',{status:401}),status:502,code:'AUTH_FAILED'},{failure:()=>{throw new DOMException('timed out','TimeoutError');},status:504,code:'TIMEOUT'}])('normalizes upstream failures to stable status $code',async({failure,status,code})=>{
 const f=await fixture(async()=>failure());const r=await f.post('/generate',{kind:'resume',consent:true});expect(r.status).toBe(status);expect(await r.json()).toMatchObject({error:code});
});
it('empty resume text requires user input, not a synthetic AI summary',async()=>{
 const f=await fixture(async()=>{throw Error('no paid request');});const sql=new DatabaseSync(f.path);
 const r=sql.prepare('SELECT id,data FROM resumes LIMIT 1').get()!,data=JSON.parse(String(r.data));data.sections.experience=[];data.sections.projects=[];sql.prepare('UPDATE resumes SET data=? WHERE id=?').run(JSON.stringify(data),r.id);sql.close();
 expect((await f.post('/generate',{kind:'resume',consent:true})).status).toBe(422);
});
it('saved successful chat carries its server receipt but never sends receipt fields as provider messages',async()=>{
 let calls=0;const f=await fixture(async(_url,init)=>{calls++;const input=JSON.parse(String(init?.body));expect(input.messages.every((m:Record<string,unknown>)=>Object.keys(m).every(k=>k==='role'||k==='content'))).toBe(true);return new Response('data: {"id":"safe-chat-id","choices":[{"delta":{"content":"合成回复"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');});
 const wire=await (await f.post('/chat',{message:'合成测试',consent:true})).text(),done=JSON.parse(wire.split('event: done\ndata: ')[1]!.split('\n')[0]!);
 const saved=await (await f.get('/conversations/'+done.conversationId)).json();expect(saved.conversation.messages.at(-1).provenance).toMatchObject({traceId:done.provenance.traceId,provider:'deepseek'});
 await f.post('/chat',{conversationId:done.conversationId,message:'继续合成测试',consent:true});expect(calls).toBe(2);
});
it('discovery keeps a separate successful Search receipt alongside the model recommendation',async()=>{
 const f=await fixture(async(url,init)=>{if(String(url).endsWith('/search'))return Response.json({id:'search-receipt',results:[]});const input=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);return reply({recommendations:[{id:input.candidates[0].id,reasons:['依据'],gaps:[]}]});});
 expect((await f.post('/matches',{preferences,discover:true,consent:true})).status).toBe(200);
 const sql=new DatabaseSync(f.path);try{expect(sql.prepare('SELECT operation,status FROM deepseek_calls ORDER BY rowid').all()).toMatchObject([{operation:'search',status:'success'},{operation:'matches',status:'success'}]);}finally{sql.close();}
});
it('cancels an oversized provider response before allocating it all or reporting success',async()=>{
 let cancelled=false,chunks=0;const f=await fixture(async()=>new Response(new ReadableStream({pull(c){if(chunks++<3)c.enqueue(new Uint8Array(1024*1024));else c.close();},cancel(){cancelled=true;}})));
 expect((await f.post('/generate',{kind:'resume',consent:true})).status).toBe(502);expect(cancelled).toBe(true);
});
it('rejects an HTTP200 TTS JSON error instead of delivering it as PCM audio',async()=>{
 const f=await fixture(async()=>new Response('{"error":"failed"}  ',{headers:{'Content-Type':'application/json'}}));
 expect((await f.post('/speech/tts',{text:'合成文字',consent:true})).status).toBe(502);
 const sql=new DatabaseSync(f.path);try{expect(sql.prepare('SELECT status FROM deepseek_calls').get()?.status).toBe('failed');}finally{sql.close();}
});
it('normalizes malformed tool JSON and null model envelopes as upstream schema failures',async()=>{
 const png=await sharp({create:{width:3,height:3,channels:3,background:'white'}}).png().toBuffer();
 const f=await fixture(async()=>new Response('not-json',{headers:{'Content-Type':'application/json'}}));
 expect((await f.ocr(png)).status).toBe(502);
 const n=await fixture(async()=>Response.json(null));expect((await n.post('/generate',{kind:'resume',consent:true})).status).toBe(502);
});
