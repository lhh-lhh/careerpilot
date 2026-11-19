import {expect,it} from 'vitest';
import {parseEventStream} from '../../src/services/workbench-stream';
it('parses fragmented SSE blocks and refuses text on final moderation',async()=>{
 const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode('event: delta\ndata: {"te'));c.enqueue(new TextEncoder().encode('xt":"你好"}\n\nevent: refusal\ndata: {}\n\nevent: error\ndata: {"error":"INPUT_BLOCKED"}\n\n'));c.close();}});
 const received:string[]=[];await parseEventStream(stream,(e,d)=>received.push(e+':'+String(d.text??'')));expect(received).toEqual(['delta:你好','refusal:','error:']);
});
it('parses CRLF separators even when carriage return and newline arrive in different chunks',async()=>{
 const stream=new ReadableStream<Uint8Array>({start(c){for(const part of ['event: delta\r','\ndata: {"text":"完整"}\r','\n\r','\nevent: done\r','\ndata: {}\r','\n\r','\n'])c.enqueue(new TextEncoder().encode(part));c.close();}});
 const received:string[]=[];await parseEventStream(stream,(e,d)=>received.push(e+':'+String(d.text??'')));
 expect(received).toEqual(['delta:完整','done:']);
});
