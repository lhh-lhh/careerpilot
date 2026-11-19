import { randomBytes, randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createSqlDatabase } from './database';
import { createAuth } from './auth';
import { createAccounts } from './accounts';
import { createSeedPack } from '../src/data/seed/seed';
export async function initializeService(path: string) {
  await mkdir(dirname(path), { recursive: true });
  // Atomic reservation protects existing databases, even across concurrent CLI processes.
  const reserved = await open(path, 'wx', 0o600); await reserved.close();
  const database = createSqlDatabase(path), { db, sql } = database;
  const credentials: { login: string; password: string }[] = [];
  try {
    await database.transaction(async () => {
      const now = new Date().toISOString(), base = () => ({ id: randomUUID(), revision: 1, createdAt: now, updatedAt: now });
      // Reuse only reviewed generic reference material, never people, employers, jobs or activity.
      const reference = createSeedPack();
      await db.dictionaries.bulkAdd(reference.dictionaries.map(r => ({ ...r, createdAt: now, updatedAt: now })));
      await db.skillOntology.bulkAdd(reference.skillOntology.map(r => ({ ...r, createdAt: now, updatedAt: now })));
      await db.mockQuestions.bulkAdd(reference.mockQuestions.map(r => ({ ...r, createdAt: now, updatedAt: now })));
      for (const [key,value] of Object.entries({schemaVersion:'3',serviceVersion:'1.0',algorithmVersion:'1.0',auditSequence:0,aiMode:'RULE'})) await db.configs.add({...base(),key,value,scope:'system'});
      const admin = { ...base(), login:'admin',displayName:'周宁',role:'admin' as const,active:true,studentId:null,companyId:null,accountStatus:'approved' as const };
      await db.users.add(admin);
      const auth = createAuth(sql,db), accounts = createAccounts(sql,db,auth);
      async function provision(login:string) { const password=randomBytes(18).toString('base64url');await auth.provision(login,password);credentials.push({login,password});return password; }
      await provision(admin.login);
      const invitation=await accounts.invite({userId:admin.id,role:'admin'},{login:'teacher.lin',role:'counselor'});
      const teacherPassword=randomBytes(18).toString('base64url');
      const teacher=await accounts.register({login:'teacher.lin',password:teacherPassword,displayName:'林知微',role:'counselor',inviteToken:invitation.token},'bootstrap');credentials.push({login:'teacher.lin',password:teacherPassword});
      for (const input of [
        {login:'student.chen',displayName:'陈思远',role:'student',studentNo:'2027000101',majorId:'major-1',cohortYear:2027},
        {login:'student.li',displayName:'李沐晴',role:'student',studentNo:'2027000102',majorId:'major-2',cohortYear:2027},
        {login:'hr.yuanxing',displayName:'方知行',role:'company',companyName:'远行科技有限公司'},
      ]) {
        const password=randomBytes(18).toString('base64url'),user=await accounts.register({...input,password},'bootstrap');credentials.push({login:input.login,password});
        await accounts.review({userId:admin.id,role:'admin'},{userId:user.id,expectedRevision:1,decision:'approve',reason:'本机管理员初始化，企业资质另行审核',...(input.role==='student'?{counselorId:teacher.id}:{})});
      }
    });
    return credentials;
  } finally { await database.close(); }
}
