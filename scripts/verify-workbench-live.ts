/** Operator-approved synthetic-only smoke. One attempt per stage; never print provider payloads or credentials. */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDeepseekKey } from '../server/workbench/credential';
import { createSqlDatabase } from '../server/database';
import { createWorkbenchProvider } from '../server/workbench/provider';
import { evaluate,question } from '../server/workbench/business';
const apiKey=loadDeepseekKey();if(!apiKey)throw Error('Credential unavailable');
const root=await mkdtemp(join(tmpdir(),'cp-live-synthetic-'));
const database=createSqlDatabase(join(root,'probe.sqlite'));
const provider=createWorkbenchProvider(database,{enabled:true,apiKey,dailyGlobalCalls:8,dailyUserCalls:8});
const results:{stage:string;ok:boolean;ms:number;detail:string}[]=[];
let audio:Blob|undefined;
async function probe(stage:string,fn:()=>Promise<string>){const started=performance.now();try{results.push({stage,ok:true,ms:Math.round(performance.now()-started),detail:await fn()});results.at(-1)!.ms=Math.round(performance.now()-started);}catch{results.push({stage,ok:false,ms:Math.round(performance.now()-started),detail:'Failed; no automatic retry, no secret or response body recorded'});}}
await probe('tts-wav',async()=>{const r=await provider.tool('synthetic','/v1/tools/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'请介绍一次你解决问题的经历。',format:'wav'})});try{audio=await r.response.blob();if(audio.size<100)throw Error();return `Synthetic WAV received: ${audio.size} bytes`;}finally{r.release();}});
if(audio)await probe('asr',async()=>{const form=new FormData();form.append('file',audio!,'synthetic.wav');const r=await provider.tool('synthetic','/v1/tools/asr',{method:'POST',body:form});try{const data=await r.response.json();if(typeof data.text!=='string'||!data.text.includes('经历'))throw Error();return `Synthetic speech recognized; duration ${data.duration_ms} ms`;}finally{r.release();}});
const target={title:'前端开发工程师',requirements:'使用Vue开发界面，能解释测试方法。'};
await probe('question-validated-json',async()=>{const text=await question(provider,'synthetic',target,[]);return `Schema valid, ${text.length} characters`});
await probe('evaluation-evidence',async()=>{const score=await evaluate(provider,'synthetic',target,'请介绍你的测试经历','我在课程项目中使用Vue开发页面，并为表单校验写了单元测试。发现错误后先复现，再修复代码和回归测试。');return `Evidence checked; ${score.dimensions.length} dimensions; practice total ${score.total}`});
await probe('chat-stream',async()=>{let count=0;const text=await provider.chat('synthetic',[{role:'user',content:'用一句话说明简历润色为什么不能编造经历。'}],()=>{count++},AbortSignal.timeout(60000));return `Completed safe stream, ${count} deltas / ${text.length} characters`;});
await database.close();
const report={at:new Date().toISOString(),syntheticOnly:true,automaticRetries:0,results};
await writeFile(join(root,'results.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,evidencePath:join(root,'results.json')},null,2));
process.exitCode=results.every(r=>r.ok)?0:1;
