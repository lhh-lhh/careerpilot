import {AsyncLocalStorage} from 'node:async_hooks';
import type {createSqlDatabase} from '../database';
import type {AiProvenance} from '../../src/types/ai-workbench';
const safeCodes=new Set(['PROVIDER_DISABLED','BUDGET_EXCEEDED','RATE_LIMITED','AUTH_FAILED','TIMEOUT','CANCELLED','INPUT_BLOCKED','SCHEMA_INVALID','SEMANTIC_INVALID','UNAUTHORIZED','REVISION_CONFLICT']);
export function safeAiError(error:unknown){const code=error instanceof Error?error.message:'';return safeCodes.has(code)?code:'UPSTREAM_ERROR';}
export function createProvenance(database:ReturnType<typeof createSqlDatabase>,model:string){
 const {sql}=database;
 sql.exec('CREATE TABLE IF NOT EXISTS deepseek_calls(trace_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,operation TEXT NOT NULL,status TEXT NOT NULL,error_code TEXT,data TEXT NOT NULL CHECK(json_valid(data)))');
 const local=new AsyncLocalStorage<{userId:string;operation:string;attempts:AiProvenance[]}>();
 function start(path:string){const context=local.getStore();if(!context)return;
  const a:AiProvenance={traceId:crypto.randomUUID(),provider:'deepseek',model:path==='/chat/completions'?model:path.split('/').at(-1)!,createdAt:new Date().toISOString()};context.attempts.push(a);
  sql.prepare('INSERT INTO deepseek_calls VALUES(?,?,?,?,?,?)').run(a.traceId,context.userId,context.operation,'pending',null,JSON.stringify(a));return a;
 }
 function metadata(value:unknown){const a=local.getStore()?.attempts.at(-1);if(!a||!value||typeof value!=='object')return;const v=value as Record<string,unknown>;
  const id=v.id??v.request_id;if(typeof id==='string'&&/^[\w.:-]{1,200}$/.test(id))a.upstreamRequestId=id;
  if(v.usage&&typeof v.usage==='object'){const u=v.usage as Record<string,unknown>,p=u.prompt_tokens??u.input_tokens,c=u.completion_tokens??u.output_tokens;if(Number.isSafeInteger(p)&&Number(p)>=0&&Number.isSafeInteger(c)&&Number(c)>=0)a.usage={prompt:Number(p),completion:Number(c)};}
 }
 async function capture<T>(userId:string,operation:string,fn:()=>Promise<T>):Promise<{value:T;provenance:AiProvenance}>{
  const context={userId,operation,attempts:[] as AiProvenance[]};
  return local.run(context,async()=>{try{const value=await fn();const provenance=context.attempts.at(-1);if(!provenance)throw Error('UPSTREAM_ERROR');for(const a of context.attempts)sql.prepare('UPDATE deepseek_calls SET status=?,error_code=?,data=? WHERE trace_id=?').run('success',null,JSON.stringify(a),a.traceId);return {value,provenance};}
   catch(error){for(const a of context.attempts)sql.prepare('UPDATE deepseek_calls SET status=?,error_code=?,data=? WHERE trace_id=?').run('failed',safeAiError(error),JSON.stringify(a),a.traceId);throw error;}});
 }
 return {start,metadata,capture};
}
