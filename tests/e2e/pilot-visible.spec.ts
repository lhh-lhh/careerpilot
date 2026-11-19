import {expect,test} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {initializeService} from '../../server/bootstrap';
import {createOnlineApp} from '../../server/app';
import {setupPilot} from '../../server/pilot';

test('new pilot employer and existing student see the same reviewed vacancies, nationwide cities and honest degree labels',async({browser})=>{
 test.setTimeout(60000);
 const root=await mkdtemp(join(tmpdir(),'cp-pilot-visible-')),databasePath=join(root,'service.sqlite');
 const credentials=await initializeService(databasePath),app=await createOnlineApp({databasePath,staticRoot:resolve('dist')});
 const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
 try{
  await app.listen(0);const address=app.server.address();if(!address||typeof address==='string')throw Error('port');const origin=`http://127.0.0.1:${address.port}`;
  await setupPilot({origin,credentials,saveCredential:async c=>{credentials.push(c);}});
  for(const [i,login] of ['hr.pilot','student.chen'].entries()){
   const page=await contexts[i]!.newPage(),credential=credentials.find(c=>c.login===login)!;
   await page.goto(origin+'/#/login');await page.getByLabel('账号',{exact:true}).fill(login);await page.getByLabel('密码',{exact:true}).fill(credential.password);await page.getByRole('button',{name:'登录',exact:true}).click();
   if(i===0){await page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'岗位管理',exact:true}).click();await expect(page.getByRole('table',{name:'企业岗位'}).getByRole('row')).toHaveCount(4);}
   else{
    await page.getByRole('link',{name:'岗位匹配',exact:true}).click();await expect(page.locator('.job-row')).toHaveCount(3);
    await expect(page.locator('.job-skills').first()).toContainText('学历不限');
    await expect(page.getByRole('button',{name:'请先完善教育经历',exact:true})).toHaveCount(3);
    await page.getByLabel('工作城市',{exact:true}).selectOption('city-beijing');await expect(page.locator('.job-row')).toHaveCount(0);
    await page.getByLabel('工作城市',{exact:true}).selectOption('');await page.getByLabel('薪资范围',{exact:true}).selectOption('custom');await page.getByLabel('最低月薪筛选',{exact:true}).fill('10000');await expect(page.locator('.job-row')).toHaveCount(2);
   }
  }
 }finally{await Promise.all(contexts.map(c=>c.close()));await app.close();await rm(root,{recursive:true,force:true});}
});
