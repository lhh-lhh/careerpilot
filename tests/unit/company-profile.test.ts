import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOnlineApp } from '../../server/app';

const fixtures: { app: Awaited<ReturnType<typeof createOnlineApp>>; root: string }[] = [];
afterEach(async () => { for (const {app,root} of fixtures.splice(0)) { await app.close(); await rm(root,{recursive:true,force:true}); } });
async function setup() {
  const root=await mkdtemp(join(tmpdir(),'careerpilot-company-profile-'));
  const app=await createOnlineApp({databasePath:join(root,'service.sqlite'),seed:true}); fixtures.push({app,root});
  for (const login of ['company1','company2','student001']) await app.provision(login,'Profile-test-only-Password!');
  await app.listen(0); const address=app.server.address(); if(!address||typeof address==='string') throw Error('port');
  const origin=`http://127.0.0.1:${address.port}`;
  async function client(login:string) {
    const response=await fetch(origin+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login,password:'Profile-test-only-Password!'})});
    expect(response.status).toBe(200); const session=await response.json(),cookie=response.headers.get('set-cookie')!.split(';')[0]!;
    return {read:async()=> (await fetch(origin+'/api/read/readCompanyWorkspace',{headers:{Cookie:cookie}})).json(),
      save:(entityId:string,expectedRevision:number,payload:unknown)=>fetch(origin+'/api/commands',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':session.csrf},body:JSON.stringify({type:'SAVE_COMPANY_PROFILE',entityId,expectedRevision,payload,commandId:crypto.randomUUID()})})};
  }
  const company=await client('company1'),other=await client('company2'),student=await client('student001');
  const workspace=await company.read(); const {name,industryId,cityId,scale,description}=workspace.company;
  return {company,other,student,workspace,payload:{name,industryId,cityId,scale,description}};
}

it('owner updates non-certification profile fields with revision and durable readback',async()=>{
  const f=await setup(); const response=await f.company.save(f.workspace.company.id,f.workspace.company.revision,{...f.payload,description:'企业介绍：负责数字产品研发与校招培养，岗位条款以审核结果为准。'});
  expect(response.status).toBe(200);
  const result=await f.company.read(); expect(result.company).toMatchObject({description:'企业介绍：负责数字产品研发与校招培养，岗位条款以审核结果为准。',revision:f.workspace.company.revision+1,verified:f.workspace.company.verified});
  expect((await f.company.save(f.workspace.company.id,f.workspace.company.revision,f.payload)).status).toBe(409);
});
it('profile writes reject foreign ownership, student role, certification injection and invalid dictionaries',async()=>{
  const f=await setup(),id=f.workspace.company.id,revision=f.workspace.company.revision;
  expect((await f.other.save(id,revision,f.payload)).status).toBe(403);
  expect((await f.student.save(id,revision,f.payload)).status).toBe(403);
  expect((await f.company.save(id,revision,{...f.payload,verified:true})).status).toBe(422);
  expect((await f.company.save(id,revision,{...f.payload,cityId:'nonexistent-city'})).status).toBe(422);
  expect((await f.company.read()).company.revision).toBe(revision);
});
it('verified company cannot swap identity while preserving approved status',async()=>{
  const f=await setup(); expect(f.workspace.company.verified).toBe(true);
  expect((await f.company.save(f.workspace.company.id,f.workspace.company.revision,{...f.payload,name:'冒用其他公司的名称'})).status).toBe(422);
  expect((await f.company.read()).company.name).toBe(f.payload.name);
});
