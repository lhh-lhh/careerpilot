import {test,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createOnlineApp} from '../../server/app';
test('offline counselor generation reports unavailability without labeling an answer as local AI',async({page})=>{
 await page.goto('/#/login');await page.getByRole('radio',{name:'辅导员',exact:true}).click();await page.getByRole('button',{name:'以辅导员身份进入'}).click();
 await page.goto('/#/counselor/dashboard');await page.getByRole('button',{name:'生成问数解读',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'在线DeepSeek'})).toBeVisible();await expect(page.locator('.ai-block')).toHaveCount(0);
});
test('online historical rule reports are explicitly read-only',async({browser})=>{
 const root=await mkdtemp(join(tmpdir(),'cp-old-report-')),app=await createOnlineApp({databasePath:join(root,'db.sqlite'),seed:true,staticRoot:resolve('dist')}),context=await browser.newContext();
 try{await app.provision('student001','Old-history-only!');await app.listen(0);const a=app.server.address();if(!a||typeof a==='string')throw Error('port');const page=await context.newPage();await page.goto(`http://127.0.0.1:${a.port}/#/login`);await page.getByLabel('账号',{exact:true}).fill('student001');await page.getByLabel('密码',{exact:true}).fill('Old-history-only!');await page.getByRole('button',{name:'登录',exact:true}).click();await page.goto(`http://127.0.0.1:${a.port}/#/student/mock/report`);
 await expect(page.getByText('旧规则练习记录 · 仅供历史核对',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'生成文字反馈'})).toHaveCount(0);
 }finally{await context.close();await app.close();await rm(root,{recursive:true,force:true});}
});
