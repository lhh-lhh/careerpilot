import { randomBytes, randomUUID } from 'node:crypto';
import type { Application, Company, Job, Resume, User } from '../src/types/entities';
import type { JobDraft } from '../src/services/job-command';

type Credential={login:string;password:string};
type Options={origin:string;credentials:Credential[];saveCredential:(value:Credential)=>Promise<void>};
const LOGIN='hr.pilot',COMPANY='路鸣校招实践企业（试运行）';
const DISCLAIMER='【本机试运行】本企业及岗位用于课程平台招聘流程实操，不代表真实雇主、工商认证、劳动关系或录用承诺。请勿支付费用或提交额外敏感材料。';

/** Explicit operator workflow, never called by startup or by an ordinary page load. */
export async function setupPilot(options:Options) {
  const origin=new URL(options.origin);
  if(origin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname)||origin.pathname!=='/'||origin.username||origin.password)throw Error('PILOT_REQUIRES_LOOPBACK');
  const request=async(path:string,init:RequestInit={})=>{
    const response=await fetch(origin.origin+path,{...init,signal:AbortSignal.timeout(15_000)});
    const value=await response.json(); if(!response.ok)throw Error(`PILOT_HTTP_${response.status}:${String(value.error??'FAILED')}`);return value;
  };
  async function client(login:string) {
    const credential=options.credentials.find(c=>c.login===login);if(!credential)throw Error(`PILOT_CREDENTIAL_REQUIRED:${login}`);
    const response=await fetch(origin.origin+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credential),signal:AbortSignal.timeout(15_000)});
    const session=await response.json();if(!response.ok)throw Error(`PILOT_LOGIN_FAILED:${login}`);
    const cookie=response.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw Error('PILOT_SESSION_FAILED');
    return {read:(path:string)=>request(path,{headers:{Cookie:cookie}}),post:(path:string,payload:unknown)=>request(path,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':session.csrf},body:JSON.stringify(payload)})};
  }
  type Client=Awaited<ReturnType<typeof client>>;
  const command=(who:Client,type:string,entityId:string,expectedRevision:number,payload:unknown)=>who.post('/api/commands',{type,entityId,expectedRevision,payload,commandId:randomUUID()});
  const admin=await client('admin');
  let users=await admin.read('/api/admin/accounts') as User[];
  let pilot=users.find(u=>u.login===LOGIN);
  if(!pilot) {
    let credential=options.credentials.find(c=>c.login===LOGIN);
    if(!credential){credential={login:LOGIN,password:randomBytes(24).toString('base64url')};await options.saveCredential(credential);if(!options.credentials.some(c=>c.login===LOGIN))options.credentials.push(credential);}
    await request('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...credential,displayName:'校招实践招聘专员（试运行）',role:'company',companyName:COMPANY})});
    users=await admin.read('/api/admin/accounts') as User[];pilot=users.find(u=>u.login===LOGIN);
  }
  if(!pilot||pilot.role!=='company'||!pilot.active||pilot.accountRequest?.companyName!==COMPANY)throw Error('PILOT_ACCOUNT_IDENTITY_CONFLICT');
  if(pilot.accountStatus==='pending') await admin.post('/api/admin/accounts/review',{userId:pilot.id,expectedRevision:pilot.revision,decision:'approve',reason:'管理员批准本机试运行账号，不代表工商认证或真实招聘主体。'});
  else if(pilot.accountStatus!=='approved')throw Error('PILOT_ACCOUNT_NOT_APPROVED');
  const company=await client(LOGIN);
  const workspace=()=>company.read('/api/read/readCompanyWorkspace') as Promise<{company:Company;jobs:Job[];applications:Application[]}>;
  let work=await workspace();
  if(work.company.name!==COMPANY)throw Error('PILOT_COMPANY_IDENTITY_CONFLICT');
  // Existing completed setup is preserved byte-for-byte, not overwritten from a seed.
  if(!work.company.description.trim()) {
    await command(company,'SAVE_COMPANY_PROFILE',work.company.id,work.company.revision,{name:COMPANY,industryId:'industry-1',cityId:'city-1',scale:'20–99人（试运行配置）',description:DISCLAIMER+'\n面向应届毕业生演练数字产品开发、数据分析与产品运营招聘，岗位按职责、能力、培养方向及月薪区间组织。实际求职须由合法用人单位另行核验。参考信息结构：国家大学生就业服务平台 https://www.ncss.cn/student/jobs/index.html 。'});
    work=await workspace();
  }
  if(!work.company.verified){await command(admin,'REVIEW_COMPANY',work.company.id,work.company.revision,{verified:true,reason:'仅批准本机课程试运行，非工商认证；已核对试运行标识与无收费风险提示。'});work=await workspace();}
  const deadline=new Date(Date.now()+90*86400_000).toISOString();
  const drafts:JobDraft[]=[
    {title:'前端开发工程师｜校招试运行',cityId:'city-1',salaryRange:{min:8000,max:12000},requiredSkills:[{skillId:'skill-1',weight:1},{skillId:'skill-2',weight:1},{skillId:'skill-3',weight:1}],preferredMajorIds:['major-1'],jdText:DISCLAIMER+'\n职责：使用Vue与TypeScript实现招聘平台页面、表单、筛选与组件；完成接口联调、可访问性与自动化测试。\n要求：理解JavaScript、HTML/CSS、组件状态与HTTP；能够清晰说明课程项目中的个人贡献；欢迎应届毕业生，无正式工作年限要求。\n培养：代码评审、需求拆解与测试实践。税前参考月薪8,000–12,000元，非实际薪酬承诺。'},
    {title:'数据分析助理｜校招试运行',cityId:'city-2',salaryRange:{min:7000,max:11000},requiredSkills:[{skillId:'skill-4',weight:1},{skillId:'skill-5',weight:1},{skillId:'skill-8',weight:0.5}],preferredMajorIds:['major-2'],jdText:DISCLAIMER+'\n职责：整理业务数据、编写SQL、核对口径并输出可解释的分析结论；与产品团队复核指标异常。\n要求：掌握基础SQL、统计概念与电子表格，能够区分数据事实和假设；可用课程研究展示思路。\n培养：数据质量、指标设计及报告沟通。税前参考月薪7,000–11,000元，非实际薪酬承诺。'},
    {title:'产品运营助理｜校招试运行',cityId:'city-3',salaryRange:{min:5000,max:8000},requiredSkills:[{skillId:'skill-6',weight:1},{skillId:'skill-8',weight:1}],preferredMajorIds:['major-3'],jdText:DISCLAIMER+'\n职责：开展用户需求整理、活动方案、内容维护与效果复盘；协调产品问题跟进。\n要求：书面表达清晰，能用实际课程或社团经历说明目标、行动和结果，不要求虚构工作经验。\n培养：用户研究、项目协作及基本数据分析。税前参考月薪5,000–8,000元，非实际薪酬承诺。'},
  ].map(d=>({...d,categoryId:'jobCategory-digital',industryId:'industry-1',minDegree:null,minExperienceMonths:0,deadline}));
  for(let i=0;i<drafts.length;i++) {
    const id=`pilot-recruitment-${i+1}`;
    let job=work.jobs.find(j=>j.id===id);
    if(job && (!job.jdText.includes('本机试运行')||job.companyId!==work.company.id))throw Error('PILOT_JOB_IDENTITY_CONFLICT');
    if(!job){await command(company,'SAVE_JOB',id,0,drafts[i]);work=await workspace();job=work.jobs.find(j=>j.id===id)!;}
    if(job.reviewStatus==='draft'){await command(company,'JOB_ACTION',id,job.revision,{action:'PUBLISH'});work=await workspace();job=work.jobs.find(j=>j.id===id)!;}
    if(job.reviewStatus==='pending'){await command(admin,'REVIEW_JOB',id,job.revision,{decision:'approve',reason:'本机试运行岗位审核：职责要求、月薪区间、截止时间及非真实录用声明齐全。'});work=await workspace();}
    else if(job.status!=='published')throw Error('PILOT_EXISTING_JOB_REQUIRES_OPERATOR_REVIEW');
  }
  const student=await client('student.chen'),snapshot=await student.read('/api/read/readScopedSnapshot') as {resumes:Resume[];applications:Application[]};
  const resume=snapshot.resumes[0];
  const readiness=!resume?.sections.basic.name.trim()?'name-required':!resume.sections.education.length?'education-required':'ready';
  const visible=work.jobs.filter(j=>j.id.startsWith('pilot-recruitment-')&&j.status==='published');
  let bookmarks=await student.read('/api/bookmarks') as string[];
  for(const job of visible)if(!bookmarks.includes(job.id))bookmarks=await student.post('/api/bookmarks',{jobId:job.id,saved:true}) as string[];
  let application=snapshot.applications.find(a=>a.jobId==='pilot-recruitment-1');
  if(readiness==='ready'&&!application){const id=randomUUID();await command(student,'APPLY',id,0,{jobId:'pilot-recruitment-1',resumeConsent:true});application=(await workspace()).applications.find(a=>a.id===id);}
  if(application?.status==='applied'){await command(company,'APPLICATION_ACTION',application.id,application.revision,{action:'START_SCREEN'});application=(await workspace()).applications.find(a=>a.id===application!.id);}
  if(application?.status==='screening') {
    const scheduledAt=new Date(Date.now()+2*86400_000).toISOString();
    await command(company,'APPLICATION_ACTION',application.id,application.revision,{action:'SCHEDULE_INTERVIEW',scheduledAt,location:'本机平台试运行面试（非真实招聘邀约），请在我的投递中确认或申请改期。'});
    application=(await workspace()).applications.find(a=>a.id===application!.id);
  }
  return {login:LOGIN,companyName:COMPANY,companyId:work.company.id,linkedStudent:'student.chen',jobs:visible.length,bookmarked:visible.filter(j=>bookmarks.includes(j.id)).length,readiness:application?.status==='interview'?'interview-invited':readiness,applicationId:application?.id??null};
}
