import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeService } from '../../server/bootstrap';
import { createOnlineApp } from '../../server/app';
import { DatabaseSync } from 'node:sqlite';
import type { SeedPack } from '../../src/types/entities';

it('pilot setup creates reviewed employer and three visible jobs without changing existing accounts or resumes; rerun is no-op',async()=>{
  const root=await mkdtemp(join(tmpdir(),'careerpilot-pilot-')),databasePath=join(root,'service.sqlite');
  const credentials=await initializeService(databasePath),app=await createOnlineApp({databasePath});
  try {
    await app.listen(0); const address=app.server.address(); if(!address||typeof address==='string')throw Error('port');
    const snapshot=()=>{ const sql=new DatabaseSync(databasePath,{readOnly:true});try{return Object.fromEntries(['users','resumes','applications','jobs','companies'].map(table=>[table,sql.prepare(`SELECT data FROM ${table} ORDER BY id`).all().map(row=>JSON.parse(String(row.data)))])) as Pick<SeedPack,'users'|'resumes'|'applications'|'jobs'|'companies'>;}finally{sql.close();} };
    const seedBefore=snapshot();
    const { setupPilot }=await import('../../server/pilot');
    const options={origin:`http://127.0.0.1:${address.port}`,credentials,saveCredential:async(value:{login:string;password:string})=>{credentials.push(value);}};
    const result=await setupPilot(options);
    expect(result).toMatchObject({login:'hr.pilot',linkedStudent:'student.chen',jobs:3,bookmarked:3,readiness:'education-required'});
    const after=snapshot();
    expect(after.users).toHaveLength(seedBefore.users.length+1);
    expect(after.users.filter(u=>u.login!=='hr.pilot')).toEqual(seedBefore.users);
    expect(after.resumes).toEqual(seedBefore.resumes);
    expect(after.applications).toEqual([]);
    expect(after.jobs).toHaveLength(3); expect(after.jobs.every(j=>j.status==='published'&&j.reviewStatus==='approved'&&j.jdText.includes('试运行'))).toBe(true);
    const pilotCompany=after.companies.find(c=>c.name.includes('试运行'))!;
    expect(pilotCompany).toMatchObject({verified:true,scale:'20–99人（试运行配置）',reviewReason:expect.stringContaining('非工商认证')});
    const revision=pilotCompany.revision,versions=after.jobs.map(j=>j.revision);
    await setupPilot(options);
    const repeated=snapshot();
    expect(repeated.companies.find(c=>c.id===pilotCompany.id)?.revision).toBe(revision);
    expect(repeated.jobs.map(j=>j.revision)).toEqual(versions);
    expect(repeated.users).toHaveLength(6);expect(repeated.resumes).toEqual(seedBefore.resumes);
    // Synthetic education exists only in this temporary database, never actual user data.
    const studentUser=repeated.users.find(u=>u.login==='student.chen')!,resume=repeated.resumes.find(r=>r.studentId===studentUser.studentId)!;
    await app.repository.execute({type:'SAVE_RESUME',entityId:resume.id,expectedRevision:resume.revision,commandId:crypto.randomUUID(),payload:{sections:{...resume.sections,education:[{id:'test-education',school:'隔离测试院校',majorId:'major-1',degree:'bachelor',startDate:'2023-09-01',endDate:'2027-06-30'}]}}},{userId:studentUser.id,role:'student'},{now:()=>new Date().toISOString()});
    const ready=await setupPilot(options);
    expect(ready).toMatchObject({readiness:'interview-invited',applicationId:expect.any(String)});
    expect(snapshot().applications).toMatchObject([{status:'interview',resumeConsent:true,jobId:'pilot-recruitment-1'}]);
    const count=snapshot().applications.length;await setupPilot(options);expect(snapshot().applications).toHaveLength(count);
  } finally {await app.close();await rm(root,{recursive:true,force:true});}
},20000);
