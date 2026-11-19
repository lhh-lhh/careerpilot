/** Isolated synthetic QA server. Never opens the user's service database. */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { createOnlineApp } from '../server/app';
const root=await mkdtemp(join(tmpdir(),'cp-workbench-browser-'));
const transport:typeof fetch=async(url,init)=>{
  const endpoint=String(url),wire=String(init?.body);
  if(endpoint.endsWith('/tts'))return new Response(new Uint8Array(24000),{headers:{'Content-Type':'audio/pcm'}});
  if(endpoint.endsWith('/asr'))return Response.json({text:'我在课程项目中负责Vue界面和单元测试，先复现问题，再修复并回归验证。',duration_ms:3000});
  const parsed=JSON.parse(wire);
  if(parsed.stream)return new Response('data: {"choices":[{"delta":{"content":"可以先保存简历，再进入岗位匹配查看依据。"}}]}\n\ndata: {"choices":[{"finish_reason":"stop","delta":{}}]}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
  let value:unknown={summary:'仅整理原有事实',patches:[]};
  if(wire.includes('RESUME_OPTIMIZE')){const rows=JSON.parse(parsed.messages[1].content);value={summary:'保留原事实，调整表述结构。',patches:rows.slice(0,2).map((r:{section:string;rowId:string;text:string},i:number)=>({id:`patch-${i}`,section:r.section,rowId:r.rowId,before:r.text,after:r.text+' 完成上述任务。',reason:'使描述更清晰',requiresUserInput:false}))};}
  if(wire.includes('INTERVIEW_QUESTION'))value={question:'请结合目标岗位，介绍一次你使用Vue解决界面问题的经历。'};
  if(wire.includes('INTERVIEW_EVALUATE')){const input=JSON.parse(parsed.messages[1].content);value={dimensions:[{key:'relevance',label:'相关性',score:75,evidence:input.answer.slice(0,10),reason:'回答提供相关行动'},{key:'logic',label:'逻辑',score:65,evidence:'',reason:'结果仍需更具体'}],strengths:['能说明行动过程'],improvements:['补充验证结果和个人贡献']};}
  if(!wire.includes('RESUME_OPTIMIZE')&&!wire.includes('INTERVIEW_QUESTION')&&!wire.includes('INTERVIEW_EVALUATE'))value={summary:'隔离测试'};
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});
};
const app=await createOnlineApp({databasePath:join(root,'qa.sqlite'),seed:true,staticRoot:resolve('dist'),ai:{enabled:true,apiKey:'isolated-fixture-no-real-key',dailyGlobalCalls:200,dailyUserCalls:100,transport}});
await app.provision('student001','Workbench-QA-only-2026!');
await app.provision('admin','Workbench-QA-only-2026!');
await app.listen(4189);
console.log('QA fixture (synthetic provider, not LIVE evidence): http://127.0.0.1:4189/ ; login student001 / Workbench-QA-only-2026!');
console.log('Temporary fixture: '+root);
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>void app.close().then(()=>process.exit(0)));
