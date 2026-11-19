import {expect,it} from 'vitest';
import {encodeWav,VoiceBoundary,waitForPlayback} from '../../src/services/interview-audio';
it('encodes real PCM WAV length sample rate and signed samples for ASR',()=>{
 const bytes=encodeWav([new Float32Array([0,1,-1])],16000),view=new DataView(bytes);
 expect(view.getUint32(24,true)).toBe(16000);expect(view.getUint16(22,true)).toBe(1);expect(view.getUint16(34,true)).toBe(16);expect(view.getUint32(40,true)).toBe(6);expect(view.getInt16(46,true)).toBe(32767);
});
it('playback already cancelled before the final drain rejects immediately',async()=>{
 const controller=new AbortController();controller.abort();
 await expect(waitForPlayback(60_000,controller.signal)).rejects.toThrow('CANCELLED');
});
it('silence never submits but enough speech followed by silence ends a turn',()=>{
 const vad=new VoiceBoundary();expect(vad.feed(0,5000)).toBe(false);expect(vad.feed(0.1,5500)).toBe(false);expect(vad.feed(0.1,6000)).toBe(false);expect(vad.feed(0,6500)).toBe(false);expect(vad.feed(0,7800)).toBe(true);
});
