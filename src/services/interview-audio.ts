import {aiFetch} from '../adapters/repository/http';
export function encodeWav(chunks:Float32Array[],sampleRate:number):ArrayBuffer{
 const count=chunks.reduce((a,c)=>a+c.length,0),buffer=new ArrayBuffer(44+count*2),v=new DataView(buffer);
 const word=(offset:number,text:string)=>{for(let i=0;i<text.length;i++)v.setUint8(offset+i,text.charCodeAt(i));};
 word(0,'RIFF');v.setUint32(4,36+count*2,true);word(8,'WAVE');word(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);word(36,'data');v.setUint32(40,count*2,true);
 let offset=44;for(const chunk of chunks)for(const raw of chunk){const value=Math.max(-1,Math.min(1,raw));v.setInt16(offset,value<0?value*32768:value*32767,true);offset+=2;}return buffer;
}
export class VoiceBoundary{
 private speech=false;private lastSound=0;private start=0;
 feed(rms:number,ms:number):boolean{if(rms>0.015){if(!this.speech)this.start=ms;this.speech=true;this.lastSound=ms;return false;}return this.speech&&this.lastSound-this.start>=300&&ms-this.lastSound>=1600;}
}
export interface AnswerRecording{stop:()=>Blob;cancel:()=>void}
export function waitForPlayback(ms:number,signal:AbortSignal):Promise<void>{
 return new Promise<void>((resolve,reject)=>{
  if(signal.aborted){reject(Error('CANCELLED'));return;}
  const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(Error('CANCELLED'));};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
  signal.addEventListener('abort',abort,{once:true});
 });
}
export async function recordAnswer(onEnd:()=>void,onLevel:(seconds:number,level:number)=>void):Promise<AnswerRecording>{
 const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
 let context:AudioContext|undefined,processor:ScriptProcessorNode|undefined,source:MediaStreamAudioSourceNode|undefined,closed=false;
 const chunks:Float32Array[]=[],vad=new VoiceBoundary();let samples=0;
 const release=()=>{if(closed)return;closed=true;processor?.disconnect();source?.disconnect();stream.getTracks().forEach(t=>t.stop());void context?.close();};
 try{
  context=new AudioContext({sampleRate:16000});await context.resume();source=context.createMediaStreamSource(stream);processor=context.createScriptProcessor(2048,1,1);
  processor.onaudioprocess=e=>{if(closed)return;const input=e.inputBuffer.getChannelData(0),remaining=120*16000-samples;if(remaining<=0){onEnd();return;}const block=new Float32Array(input.subarray(0,remaining));chunks.push(block);samples+=block.length;const rms=Math.sqrt(block.reduce((n,s)=>n+s*s,0)/block.length);onLevel(samples/16000,rms);if(vad.feed(rms,samples/16)||samples>=120*16000)onEnd();};
  source.connect(processor);processor.connect(context.destination);
  return {stop:()=>{release();return new Blob([encodeWav(chunks,16000)],{type:'audio/wav'});},cancel:release};
 }catch(error){release();throw error;}
}
export async function speakQuestion(text:string,signal:AbortSignal):Promise<void>{
 const response=await aiFetch('/speech/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,consent:true}),signal});
 const context=new AudioContext({sampleRate:24000}),nodes:AudioBufferSourceNode[]=[];
 let cursor=context.currentTime+0.08,remainder=new Uint8Array(0),bytes=0,closed=false;
 const stop=()=>{if(closed)return;closed=true;for(const node of nodes){try{node.stop();}catch{/* Already ended. */}}void context.close().catch(()=>undefined);};
 signal.addEventListener('abort',stop,{once:true});
 try{
  await context.resume();const reader=response.body?.getReader();if(!reader)throw Error('AUDIO_EMPTY');
  while(true){const next=await reader.read();if(next.done)break;if(signal.aborted)throw Error('CANCELLED');
   const joined=new Uint8Array(remainder.length+next.value.length);joined.set(remainder);joined.set(next.value,remainder.length);const length=joined.length-joined.length%2;remainder=joined.slice(length);bytes+=length;
   if(!length)continue;const buffer=context.createBuffer(1,length/2,24000),data=buffer.getChannelData(0),view=new DataView(joined.buffer,0,length);for(let i=0;i<data.length;i++)data[i]=view.getInt16(i*2,true)/32768;
   const node=context.createBufferSource();node.buffer=buffer;node.connect(context.destination);cursor=Math.max(cursor,context.currentTime+0.03);node.start(cursor);cursor+=buffer.duration;nodes.push(node);
  }
  if(!bytes||remainder.length)throw Error('AUDIO_TRUNCATED');
  await waitForPlayback(Math.max(0,cursor-context.currentTime)*1000+40,signal);
 }finally{signal.removeEventListener('abort',stop);stop();}
}
