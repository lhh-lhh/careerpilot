import {expect,it} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initializeService} from '../../server/bootstrap';
import {createOnlineApp} from '../../server/app';
import {backupDatabase,restoreDatabase} from '../../server/backup';
it('fresh service accounts complete reviewed recruiting, mutual agreement, destination review, restore and continue',async()=>{
  const root=await mkdtemp(join(tmpdir(),'careerpilot-service-chain-')),path=join(root,'service.sqlite');
  const credentials=await initializeService(path),app=await createOnlineApp({databasePath:path});
  let restored:Awaited<ReturnType<typeof createOnlineApp>>|null=null;
  type Client={cookie:string;read:(path:string)=>Promise<Response>;post:(path:string,body:unknown)=>Promise<Response>};
  async function client(server:typeof app,login:string):Promise<Client>{
    const address=server.server.address();if(!address||typeof address==='string')throw Error('port');const origin=`http://127.0.0.1:${address.port}`;
    const response=await fetch(origin+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login,password:credentials.find(c=>c.login===login)!.password})});expect(response.status).toBe(200);
    const session=await response.json(),cookie=response.headers.get('set-cookie')!.split(';')[0]!;
    return {cookie,read:path=>fetch(origin+path,{headers:{Cookie:cookie}}),post:(path,body)=>fetch(origin+path,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':session.csrf},body:JSON.stringify(body)})};
  }
  async function command(who:Client,type:string,entityId:string,expectedRevision:number,payload:unknown){const response=await who.post('/api/commands',{type,entityId,expectedRevision,payload,commandId:crypto.randomUUID()});const result=await response.json();expect(result).not.toHaveProperty('error');expect(response.status).toBe(200);return result;}
  try{
    await app.listen(0);const admin=await client(app,'admin'),company=await client(app,'hr.yuanxing'),student=await client(app,'student.chen'),teacher=await client(app,'teacher.lin');
    const workspace=await (await company.read('/api/read/readCompanyWorkspace')).json();expect(workspace.jobs).toEqual([]);expect(workspace.company.verified).toBe(false);
    await command(admin,'REVIEW_COMPANY',workspace.company.id,1,{verified:true,reason:'隔离测试：管理员核验准入材料'});
    const deadline=new Date(Date.now()+90*86400_000).toISOString();
    await command(company,'SAVE_JOB','service-job',0,{title:'前端开发工程师',categoryId:'jobCategory-digital',industryId:'industry-1',cityId:'city-1',salaryRange:{min:8000,max:12000},requiredSkills:[{skillId:'skill-1',weight:1}],preferredMajorIds:['major-1'],minDegree:null,minExperienceMonths:0,jdText:'负责前端页面实现与自动化测试，完成团队协作任务。',deadline});
    await command(company,'JOB_ACTION','service-job',1,{action:'PUBLISH'});
    expect((await(await student.read('/api/public/opportunities')).json()).total).toBe(0);
    expect(await (await student.read('/api/read/listJobs')).json()).toEqual([]);
    await command(admin,'REVIEW_JOB','service-job',2,{decision:'approve',reason:'隔离测试：确认岗位职责与条款'});
    const publicOpportunities = await (await student.read('/api/public/opportunities')).json();
    expect(publicOpportunities.items).toEqual([expect.objectContaining({id:'local:service-job',kind:'local',title:'前端开发工程师',localJobId:'service-job'})]);
    expect(await (await student.read('/api/read/listJobs')).json()).toHaveLength(1);
    const snapshot=await (await student.read('/api/read/readScopedSnapshot')).json();expect(snapshot.applications).toEqual([]);
    const initialResume=snapshot.resumes[0];
    await command(student,'SAVE_RESUME',initialResume.id,initialResume.revision,{sections:{...initialResume.sections,education:[{id:'education-1',school:'求职者填写的毕业院校',majorId:'major-1',degree:'bachelor',startDate:'2023-09-01',endDate:'2027-06-30'}]}});
    // Production mutation caught: removing committed() recipients or SSE publication would
    // leave the employer unaware of a persisted student application.
    const companyAddress=app.server.address();if(!companyAddress||typeof companyAddress==='string')throw Error('port');
    const companyEvents=await fetch(`http://127.0.0.1:${companyAddress.port}/api/events`,{headers:{Cookie:company.cookie},signal:AbortSignal.timeout(8000)});
    const eventReader=companyEvents.body!.getReader();await eventReader.read();
    const nextEvent=eventReader.read();
    await command(student,'APPLY','service-application',0,{jobId:'service-job',resumeConsent:true});
    const event=await nextEvent;expect(new TextDecoder().decode(event.value)).toContain('event: change');await eventReader.cancel();
    expect((await(await company.read('/api/notifications')).json()).find((n:{entityId:string;type:string})=>n.entityId==='service-application'&&n.type==='APPLY')).toMatchObject({title:'收到新的简历投递'});
    const scheduledAt=new Date(Date.now()+86400_000).toISOString();
    await command(company,'APPLICATION_ACTION','service-application',1,{action:'SCHEDULE_INTERVIEW',scheduledAt,location:'线上会议室'});
    expect((await(await student.read('/api/notifications')).json()).find((n:{entityId:string;type:string})=>n.entityId==='service-application'&&n.type==='APPLICATION_ACTION')).toMatchObject({title:'企业已发送面试邀约，请回应'});
    await command(student,'APPLICATION_ACTION','service-application',2,{action:'CONFIRM_INTERVIEW'});
    expect((await(await company.read('/api/read/readCompanyWorkspace')).json()).interviews[0].studentResponse).toBe('accepted');
    await command(company,'APPLICATION_ACTION','service-application',3,{action:'COMPLETE_INTERVIEW',result:'pass',feedback:'隔离测试：已确认项目经验'});
    await command(company,'APPLICATION_ACTION','service-application',4,{action:'ISSUE_OFFER_DOCUMENT',offer:{location:'上海',compensation:'税前月薪10000元',startDate:'2027-07-01',responseDeadline:deadline,note:''}});
    await command(student,'APPLICATION_ACTION','service-application',5,{action:'ACCEPT_OFFER'});
    await command(company,'APPLICATION_ACTION','service-application',6,{action:'CREATE_AGREEMENT'});
    await command(company,'APPLICATION_ACTION','service-application',7,{action:'CONFIRM_AGREEMENT'});
    await command(student,'APPLICATION_ACTION','service-application',8,{action:'CONFIRM_AGREEMENT'});
    const signed=await (await student.read('/api/read/readScopedSnapshot')).json();expect(signed.agreements[0].status).toBe('signed');
    const proof=await (await student.post('/api/attachments',{fileName:'就业证明.pdf',mime:'application/pdf',base64:Buffer.from('%PDF-isolated-service-test').toString('base64')})).json();
    await command(student,'SAVE_DESTINATION','service-destination',0,{studentId:snapshot.students[0].id,type:'employment',source:'internal',applicationId:'service-application',agreementId:signed.agreements[0].id,organizationName:workspace.company.name,industryId:'industry-1',attachmentIds:[proof.id]});
    await command(student,'DESTINATION_ACTION','service-destination',1,{action:'SUBMIT'});await command(teacher,'DESTINATION_ACTION','service-destination',2,{action:'APPROVE'});
    expect((await (await student.read('/api/read/readScopedSnapshot')).json()).destinations[0].status).toBe('approved');
    await backupDatabase(path,join(root,'snapshot'));const restoredPath=await restoreDatabase(join(root,'snapshot'),join(root,'restored'));
    restored=await createOnlineApp({databasePath:restoredPath});await restored.listen(0);const recovered=await client(restored,'student.chen');
    const recoveredState=await (await recovered.read('/api/read/readScopedSnapshot')).json();expect(recoveredState.destinations[0].status).toBe('approved');expect(recoveredState.agreements[0].status).toBe('signed');
    const address=restored.server.address();if(!address||typeof address==='string')throw Error('port');expect((await fetch(`http://127.0.0.1:${address.port}/api/account`,{headers:{Cookie:student.cookie}})).status).toBe(401);
    const resume=recoveredState.resumes[0];await command(recovered,'SAVE_RESUME',resume.id,resume.revision,{sections:{...resume.sections,basic:{...resume.sections.basic,email:'chen@example.com'}}});
    expect((await (await recovered.read('/api/read/readScopedSnapshot')).json()).resumes[0].sections.basic.email).toBe('chen@example.com');
  }finally{await restored?.close();await app.close();await rm(root,{recursive:true,force:true});}
},20000);
