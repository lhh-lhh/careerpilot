export async function parseEventStream(stream:ReadableStream<Uint8Array>,event:(name:string,data:Record<string,unknown>)=>void){
 const reader=stream.getReader(),decoder=new TextDecoder();let buffer='';
 try{
  while(true){const next=await reader.read();if(next.done)break;buffer=(buffer+decoder.decode(next.value,{stream:true})).replace(/\r\n/g,'\n');
   let end:number;while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);let name='message';const data:string[]=[];
    for(const line of block.split('\n')){if(line.startsWith('event:'))name=line.slice(6).trim();if(line.startsWith('data:'))data.push(line.slice(5).trimStart());}
    if(data.length)event(name,JSON.parse(data.join('\n')));
   }
  }
 }finally{await reader.cancel().catch(()=>undefined);}
}
