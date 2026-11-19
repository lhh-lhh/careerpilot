// Isolated manual acceptance fixture. Never used by normal startup or shipped account provisioning.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initializeService } from '../server/bootstrap';
import { createOnlineApp } from '../server/app';
const root = await mkdtemp(join(tmpdir(), 'careerpilot-manual-service-'));
await initializeService(join(root,'service.sqlite'));
const app=await createOnlineApp({databasePath:join(root,'service.sqlite'),staticRoot:resolve('dist')});
await app.provision('admin','Manual-acceptance-Password!');
await app.listen(4188);
console.log('Isolated account acceptance fixture: http://127.0.0.1:4188/');
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>void app.close().then(()=>rm(root,{recursive:true,force:true})).then(()=>process.exit(0)));
