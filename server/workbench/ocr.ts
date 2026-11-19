import type {IncomingMessage} from 'node:http';
import sharp from 'sharp';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {createWorkbenchProvider} from './provider';
export async function recognizeDocument(request:IncomingMessage,provider:ReturnType<typeof createWorkbenchProvider>,userId:string,signal:AbortSignal){
 if(request.headers['x-ai-consent']!=='true')throw Error('FORBIDDEN');
 let size=0;const chunks:Buffer[]=[];
 for await(const chunk of request){size+=chunk.length;if(size>2*1024*1024)throw Error('PAYLOAD_TOO_LARGE');chunks.push(chunk);}
 const bytes=Buffer.concat(chunks);let mime='',name='';
 if(bytes.subarray(0,5).toString()==='%PDF-'){
  const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:false});
  try{const pdf=await task.promise;if(pdf.numPages>20)throw Error('VALIDATION_ERROR');mime='application/pdf';name='document.pdf';}catch{throw Error('VALIDATION_ERROR');}finally{await task.destroy();}
 }else{
  try{const meta=await sharp(bytes,{limitInputPixels:20_000_000}).metadata();if(!['png','jpeg'].includes(meta.format??''))throw Error();mime=meta.format==='png'?'image/png':'image/jpeg';name=meta.format==='png'?'document.png':'document.jpg';}catch{throw Error('VALIDATION_ERROR');}
 }
 if(signal.aborted)throw Error('CANCELLED');
 const form=new FormData();form.append('purpose','text_recognition');form.append('file',new Blob([bytes],{type:mime}),name);
 const result=await provider.tool(userId,'/v1/tools/ocr',{method:'POST',body:form},signal);
 try{
  const data=await provider.toolJson(result.response);provider.metadata(data);
  if(data.error)throw Error('UPSTREAM_ERROR');
  if(!Number.isInteger(data.page_count)||Number(data.page_count)<1||Number(data.page_count)>20||!Array.isArray(data.pages)||data.pages.length!==data.page_count)throw Error('SCHEMA_INVALID');
  const pages=data.pages.map((p:Record<string,unknown>,index:number)=>{if(!p||p.index!==index||typeof p.text!=='string'||p.text.length>300000||!['stop','length'].includes(String(p.finish_reason)))throw Error('SCHEMA_INVALID');return {index,text:p.text,finish_reason:p.finish_reason as 'stop'|'length'};});
  return {pages,page_count:data.page_count as number};
 }finally{result.release();}
}
