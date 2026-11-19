import { expect,it } from 'vitest';
import { createDatabase } from '../../src/adapters/repository/db';
import { createRepository } from '../../src/services/repository';
import { fixedClock } from '../../src/domain/clock';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import Dexie from 'dexie';
Dexie.dependencies.indexedDB=indexedDB;Dexie.dependencies.IDBKeyRange=IDBKeyRange;

it('certificate descriptions version with owned files, and employer sees only files in its received snapshot',async()=>{
 const db=createDatabase(`certificates-${crypto.randomUUID()}`),repo=createRepository(db);await repo.initialize();
 const student={userId:'user-student-040',role:'student'} as const,other={userId:'user-student-039',role:'student'} as const,company={userId:'user-company-001',role:'company'} as const,foreignCompany={userId:'user-company-002',role:'company'} as const;
 try{
  const file=await repo.addAttachment(student,{fileName:'证书.pdf',blob:new Blob(['%PDF-certificate'],{type:'application/pdf'})},fixedClock);
  const privateFile=await repo.addAttachment(student,{fileName:'私人证明.pdf',blob:new Blob(['%PDF-private'],{type:'application/pdf'})},fixedClock);
  const foreign=await repo.addAttachment(other,{fileName:'他人证书.pdf',blob:new Blob(['%PDF-other'],{type:'application/pdf'})},fixedClock);
  let resume=await repo.readResume(student,'student-040');
  const sections={...resume.sections,certificates:[{id:'cert',name:'测试证书',issuer:'测试机构',awardedAt:'2026-01-01',description:'仅测试库样本：说明本人项目能力',attachmentIds:[file.id]}]};
  const save=(value:typeof sections)=>repo.execute({type:'SAVE_RESUME',entityId:resume.id,expectedRevision:resume.revision,commandId:crypto.randomUUID(),payload:{sections:value}},student,fixedClock);
  await expect(save({...sections,certificates:[{...sections.certificates[0]!,attachmentIds:[foreign.id]}]})).rejects.toMatchObject({code:'FORBIDDEN'});
  await save(sections);resume=await repo.readResume(student,'student-040');
  expect((await repo.readResumeHistory(student,'student-040')).at(-1)?.snapshot.certificates[0]).toMatchObject({description:'仅测试库样本：说明本人项目能力',attachmentIds:[file.id]});
  await expect(repo.readAttachment(company,file.id)).rejects.toMatchObject({code:'FORBIDDEN'});
  await repo.execute({type:'APPLY',entityId:'cert-application',expectedRevision:0,commandId:crypto.randomUUID(),payload:{jobId:'job-001',resumeConsent:true}},student,fixedClock);
  expect((await repo.readAttachment(company,file.id)).fileName).toBe('证书.pdf');
  await expect(repo.readAttachment(company,privateFile.id)).rejects.toMatchObject({code:'FORBIDDEN'});
  await expect(repo.readAttachment(foreignCompany,file.id)).rejects.toMatchObject({code:'FORBIDDEN'});
  await save({...sections,certificates:[]});
  expect((await repo.readAttachment(company,file.id)).id).toBe(file.id); // fixed received snapshot remains authorized
 }finally{await db.delete();}
});
