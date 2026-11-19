import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOnlineApp } from '../../server/app';
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0)) await close(); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'careerpilot-accounts-'));
  const app = await createOnlineApp({databasePath:join(root,'db.sqlite'),seed:true});
  cleanups.push(async()=>{await app.close();await rm(root,{recursive:true,force:true});});
  await app.provision('admin','Account-test-Password!'); await app.provision('student001','Account-test-Password!');
  await app.listen(0); const address=app.server.address(); if(!address||typeof address==='string')throw Error('port');
  const origin=`http://127.0.0.1:${address.port}`;
  const post=(path:string,data:unknown)=>fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});
  async function login(name:string,password='Account-test-Password!') {
    const response=await post('/api/session',{login:name,password}); expect(response.status).toBe(200);
    const result=await response.json(), cookie=response.headers.get('set-cookie')!.split(';')[0]!;
    return {cookie,csrf:result.csrf,read:(path:string)=>fetch(origin+path,{headers:{Cookie:cookie}}),post:(path:string,data:unknown)=>fetch(origin+path,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json','X-CSRF-Token':result.csrf},body:JSON.stringify(data)})};
  }
  const register=(extra:Record<string,unknown>={})=>post('/api/register',{login:'new.student',password:'Account-test-Password!',displayName:'陈思远',role:'student',studentNo:'2027000101',majorId:'major-1',cohortYear:2027,...extra});
  return {app,origin,post,login,register,databasePath:join(root,'db.sqlite')};
}
it('registration waits for independent review, creates an empty resume and rejects stale approval',async()=>{
  const f=await fixture(); expect((await f.register()).status).toBe(201);
  const student=await f.login('NEW.STUDENT');
  const status=await (await student.read('/api/account')).json();expect(status.accountStatus).toBe('pending');
  for(const path of ['/api/read/readScopedSnapshot','/api/events','/api/ai/status']) expect((await student.read(path)).status).toBe(403);
  const admin=await f.login('admin');
  const request={userId:status.id,expectedRevision:status.revision,decision:'approve',reason:'校内信息核对通过',counselorId:'user-counselor-001'};
  expect((await student.post('/api/admin/accounts/review',request)).status).toBe(403);
  expect((await admin.post('/api/admin/accounts/review',request)).status).toBe(200);
  expect((await admin.post('/api/admin/accounts/review',request)).status).toBe(409);
  const active=await f.login('new.student');const snapshot=await (await active.read('/api/read/readScopedSnapshot')).json();
  expect(snapshot.students).toHaveLength(1);expect(snapshot.resumes).toHaveLength(1);expect(snapshot.applications).toHaveLength(0);
  expect(snapshot.resumes[0].sections.education).toEqual([]);expect(snapshot.resumes[0].sections.projects).toEqual([]);
  expect(snapshot.students[0].counselorId).toBe('user-counselor-001');
});
it('normalizes duplicate accounts and does not allow role escalation or leak passwords in audit',async()=>{
  const f=await fixture();expect((await f.register({role:'admin'})).status).toBe(400);
  expect((await f.register({role:'counselor'})).status).toBe(400);
  const responses=await Promise.all([f.register(),f.register({login:'NEW.STUDENT'})]);expect(responses.map(r=>r.status).sort()).toEqual([201,409]);
  const admin=await f.login('admin');const audit=JSON.stringify(await (await admin.read('/api/read/exportRedactedAudit')).json());expect(audit).not.toContain('Account-test-Password!');
});
it('staff invitations are bound to account and role, expire and are consumed once',async()=>{
  const f=await fixture(),admin=await f.login('admin');
  const issued=await admin.post('/api/admin/accounts/invite',{login:'teacher.lin',role:'counselor'});expect(issued.status).toBe(201);
  const {token}=await issued.json();
  expect((await f.register({login:'teacher.other',role:'counselor',inviteToken:token})).status).toBe(403);
  expect((await f.register({login:'teacher.lin',role:'admin',inviteToken:token})).status).toBe(403);
  expect((await f.register({login:'teacher.lin',role:'counselor',inviteToken:token})).status).toBe(201);
  expect((await f.register({login:'teacher.lin',role:'counselor',inviteToken:token})).status).toBe(403);
  const teacher=await f.login('teacher.lin');expect((await teacher.read('/api/read/readScopedSnapshot')).status).toBe(200);
  const expired=await (await admin.post('/api/admin/accounts/invite',{login:'teacher.old',role:'counselor'})).json();
  const {DatabaseSync}=await import('node:sqlite');const sql=new DatabaseSync(f.databasePath);
  sql.prepare('UPDATE account_invites SET expires_at=0 WHERE login=?').run('teacher.old');sql.close();
  expect((await f.register({login:'teacher.old',role:'counselor',inviteToken:expired.token})).status).toBe(403);
});
it('company registration does not publish jobs or confer verified status; password change revokes old sessions',async()=>{
  const f=await fixture();expect((await f.register({login:'hr.team',role:'company',companyName:'远行科技有限公司'})).status).toBe(201);
  const hr=await f.login('hr.team'),profile=await (await hr.read('/api/account')).json(),admin=await f.login('admin');
  expect((await admin.post('/api/admin/accounts/review',{userId:profile.id,expectedRevision:profile.revision,decision:'approve',reason:'账号信息确认，企业资质另审'})).status).toBe(200);
  const current=await f.login('hr.team');const response=await current.read('/api/read/readCompanyWorkspace');expect(response.status).toBe(200);const workspace=await response.json();expect(workspace.company.verified).toBe(false);expect(workspace.jobs).toEqual([]);
  expect((await current.post('/api/account/password',{currentPassword:'incorrect',newPassword:'Different-secure-Password!'})).status).toBe(400);
  expect((await current.post('/api/account/password',{currentPassword:'Account-test-Password!',newPassword:'Different-secure-Password!'})).status).toBe(200);
  expect((await current.read('/api/account')).status).toBe(401);await f.login('hr.team','Different-secure-Password!');
});
it('rejected applicants remain restricted and cannot be enabled through the legacy user switch',async()=>{
  const f=await fixture();await f.register();const applicant=await f.login('new.student'),admin=await f.login('admin');
  const profile=await (await applicant.read('/api/account')).json();
  expect((await admin.post('/api/admin/users',{userId:profile.id,active:true})).status).toBe(403);
  expect((await admin.post('/api/admin/accounts/review',{userId:profile.id,expectedRevision:profile.revision,decision:'reject',reason:'学籍信息需核实'})).status).toBe(200);
  expect((await (await applicant.read('/api/account')).json()).accountStatus).toBe('rejected');
  for(const path of ['/api/read/readScopedSnapshot','/api/me/media','/api/attachments/other','/api/bookmarks','/api/events']) expect((await applicant.read(path)).status).toBe(403);
});
it('registration rejects injected privileges and staff invitation requires an administrator',async()=>{
  const f=await fixture();expect((await f.register({active:true,accountStatus:'approved'})).status).toBe(400);
  const student=await f.login('student001');expect((await student.post('/api/admin/accounts/invite',{login:'teacher.test',role:'admin'})).status).toBe(403);
  const admin=await f.login('admin');const result=await (await admin.post('/api/admin/accounts/invite',{login:'teacher.test',role:'counselor'})).json();
  const {DatabaseSync}=await import('node:sqlite');const sql=new DatabaseSync(f.databasePath);
  const stored=sql.prepare('SELECT token_hash FROM account_invites WHERE login=?').get('teacher.test');expect(stored?.token_hash).not.toBe(result.token);sql.close();
  expect((await f.post('/api/admin/accounts/invite',{login:'x',role:'admin'})).status).toBe(401);
});
it('account review rejects CSRF and cross-origin writes without approving the applicant',async()=>{
  const f=await fixture();await f.register();const applicant=await f.login('new.student'),admin=await f.login('admin'),profile=await (await applicant.read('/api/account')).json();
  const payload={userId:profile.id,expectedRevision:profile.revision,decision:'approve',reason:'校内信息确认',counselorId:'user-counselor-001'};
  const invalidHeaders: Record<string,string>[] = [{Cookie:admin.cookie,Origin:f.origin},{Cookie:admin.cookie,Origin:'https://untrusted.example','X-CSRF-Token':String(admin.csrf)}];
  for(const headers of invalidHeaders) {
    const response=await fetch(f.origin+'/api/admin/accounts/review',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(payload)});expect(response.status).toBe(403);
  }
  expect((await (await applicant.read('/api/account')).json()).accountStatus).toBe('pending');
});
it('concurrent reviews commit a single profile and duplicate student numbers roll back approval',async()=>{
  const f=await fixture();await f.register();await f.register({login:'another.student'});
  const a=await f.login('new.student'),b=await f.login('another.student'),admin=await f.login('admin');
  const profile=await (await a.read('/api/account')).json(),other=await (await b.read('/api/account')).json();
  const payload={userId:profile.id,expectedRevision:profile.revision,decision:'approve',reason:'学籍核对通过',counselorId:'user-counselor-001'};
  const results=await Promise.all([admin.post('/api/admin/accounts/review',payload),admin.post('/api/admin/accounts/review',payload)]);expect(results.map(r=>r.status).sort()).toEqual([200,409]);
  expect((await admin.post('/api/admin/accounts/review',{...payload,userId:other.id,expectedRevision:other.revision})).status).toBe(409);
  expect((await (await b.read('/api/account')).json()).accountStatus).toBe('pending');
  expect((await b.read('/api/read/readScopedSnapshot')).status).toBe(403);
});
it('registration limits persist across restart and no password is stored in clear text',async()=>{
  const f=await fixture();await f.register();
  const {DatabaseSync}=await import('node:sqlite');const sql=new DatabaseSync(f.databasePath);
  const rows=sql.prepare('SELECT * FROM credentials').all();expect(JSON.stringify(rows)).not.toContain('Account-test-Password!');sql.close();
  for(let i=0;i<19;i++)expect((await f.register({role:'admin'})).status).toBe(400);
  expect((await f.register({login:'blocked.student'})).status).toBe(429);await f.app.close();
  const restarted=await createOnlineApp({databasePath:f.databasePath});cleanups.unshift(()=>restarted.close());await restarted.listen(0);
  const address=restarted.server.address();if(!address||typeof address==='string')throw Error('port');
  const response=await fetch(`http://127.0.0.1:${address.port}/api/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});expect(response.status).toBe(429);
});
