/** Explicit operator-authorized, synthetic-only, one attempt per new task. */
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadDeepseekKey} from '../server/workbench/credential';
import {createSqlDatabase} from '../server/database';
import {createWorkbenchProvider} from '../server/workbench/provider';
import {optimize} from '../server/workbench/business';
import type {Resume} from '../src/types/entities';
const apiKey=loadDeepseekKey();if(!apiKey)throw Error('Credential unavailable');
const root=await mkdtemp(join(tmpdir(),'cp-extra-live-')),db=createSqlDatabase(join(root,'probe.sqlite'));
const provider=createWorkbenchProvider(db,{enabled:true,apiKey,dailyGlobalCalls:3,dailyUserCalls:3});
const results:{stage:string;ok:boolean;ms:number;detail:string}[]=[];
async function probe(stage:string,task:()=>Promise<string>){const start=performance.now();try{results.push({stage,ok:true,detail:await task(),ms:Math.round(performance.now()-start)});}catch{results.push({stage,ok:false,ms:Math.round(performance.now()-start),detail:'Failed; no retry; no response body or credential recorded'});}}
await probe('resume-synthetic-validated',async()=>{
 const resume={sections:{basic:{name:'合成用户',email:'synthetic@example.com'},experience:[],projects:[{id:'synthetic-project',description:'在课程项目中使用Vue实现表单页面，编写单元测试验证输入校验逻辑。'}]}} as unknown as Resume;
 const result=await optimize(provider,'synthetic',resume);return `Validated ${result.patches.length} patches; ${result.patches.filter(p=>!p.requiresUserInput).length} can be reviewed for acceptance`;
});
await probe('search-public-synthetic-query',async()=>{
 const result=await provider.tool('synthetic','/v1/tools/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'Vue 前端开发 上海 招聘',count:3,need_content:false})});
 try{const data=await result.response.json();if(!Array.isArray(data.results))throw Error('SCHEMA_INVALID');return `Received ${data.results.length} public search results; not verified job offers`;}finally{result.release();}
});
await db.close();const report={at:new Date().toISOString(),syntheticOnly:true,automaticRetries:0,results};await writeFile(join(root,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,evidencePath:join(root,'results.json')},null,2));process.exitCode=results.every(r=>r.ok)?0:1;
