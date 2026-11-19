import {expect,it} from 'vitest';
import {createStaticServer} from '../../scripts/start-demo.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
it('serves local pet animations and license documents with correct MIME, no executable unknown files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cp-static-pet-'));const server=createStaticServer(root);
 try{await writeFile(join(root,'pet.webm'),new Uint8Array([26,69,223,163]));await writeFile(join(root,'LICENSE.txt'),'MIT License');await writeFile(join(root,'config.jsonc'),'{}');await writeFile(join(root,'unsafe.exe'),'not executable');await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const a=server.address();if(!a||typeof a==='string')throw Error();const base=`http://127.0.0.1:${a.port}`;
 for(const [file,mime] of [['pet.webm','video/webm'],['LICENSE.txt','text/plain'],['config.jsonc','application/json']]){const res=await fetch(base+'/'+file);expect(res.status).toBe(200);expect(res.headers.get('content-type')).toContain(mime);}
 expect((await fetch(base+'/unsafe.exe')).status).toBe(404);
 }finally{await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});}
});
