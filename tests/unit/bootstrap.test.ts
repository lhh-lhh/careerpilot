import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSqlDatabase } from '../../server/database';
import { createOnlineApp } from '../../server/app';
const exec = promisify(execFile);
it('service initialization creates usable accounts but no fabricated recruitment activity and refuses overwrite',async()=>{
  const root=await mkdtemp(join(tmpdir(),'careerpilot-bootstrap-')),path=join(root,'service.sqlite');
  try {
    const initialized=await exec(process.execPath,['--import','tsx','server/cli.ts','init'],{env:{...process.env,CAREERPILOT_DATABASE:path}});
    expect(initialized.stdout).not.toMatch(/虚构|演示/);
    const database=createSqlDatabase(path);
    try {
      expect(await database.db.jobs.count()).toBe(0);expect(await database.db.applications.count()).toBe(0);expect(await database.db.agreements.count()).toBe(0);expect(await database.db.destinations.count()).toBe(0);
      const users=await database.db.users.toArray();expect(users).toHaveLength(5);expect(new Set(users.map(u=>u.role)).size).toBe(4);
      expect((await database.db.companies.toArray()).every(c=>!c.verified)).toBe(true);
      expect((await database.db.resumes.toArray()).every(r=>!r.sections.education.length&&!r.sections.projects.length)).toBe(true);
      expect(await database.db.mockQuestions.count()).toBeGreaterThan(0);
    } finally {await database.close();}
    const duplicate=await exec(process.execPath,['--import','tsx','server/cli.ts','init'],{env:{...process.env,CAREERPILOT_DATABASE:path}}).then(()=>0,()=>1);expect(duplicate).toBe(1);
    const app=await createOnlineApp({databasePath:path});await app.close();
  } finally {await rm(root,{recursive:true,force:true});}
},15000);
it('operator credential export is exclusive and does not print passwords to process output',async()=>{
  const root=await mkdtemp(join(tmpdir(),'careerpilot-credential-export-')),path=join(root,'service.sqlite'),credentialsPath=join(root,'credentials.json');
  try{
    const result=await exec(process.execPath,['--import','tsx','server/cli.ts','init','--credentials-file',credentialsPath],{env:{...process.env,CAREERPILOT_DATABASE:path}});
    const credentials=JSON.parse(await readFile(credentialsPath,'utf8')) as {login:string;password:string}[];expect(credentials).toHaveLength(5);
    for(const row of credentials){expect(result.stdout).not.toContain(row.password);expect(row.password.length).toBeGreaterThanOrEqual(12);}
    expect(result.stdout).toContain(credentialsPath);
    await expect(exec(process.execPath,['--import','tsx','server/cli.ts','init','--credentials-file',credentialsPath],{env:{...process.env,CAREERPILOT_DATABASE:join(root,'another.sqlite')}})).rejects.toThrow();
    expect(JSON.parse(await readFile(credentialsPath,'utf8'))).toEqual(credentials);
  }finally{await rm(root,{recursive:true,force:true});}
},15000);
