import {test,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {createOnlineApp} from '../../server/app';
test('online AI defaults to click-to-generate using a masked ticket, supports global shutdown, and never calls on page load',async({browser})=>{
 test.setTimeout(60000);const root=await mkdtemp(join(tmpdir(),'careerpilot-ai-defaults-'));let calls=0;const wires:string[]=[];
 const app=await createOnlineApp({databasePath:join(root,'db.sqlite'),seed:true,staticRoot:resolve('dist'),ai:{enabled:true,apiKey:'isolated-not-real',dailyGlobalCalls:10,dailyUserCalls:5,transport:async(_url,init)=>{calls++;wires.push(String(init?.body));return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({module:'A1',operation:'rewrite',suggestions:[],summary:'隔离测试：点击后生成，原简历未改动。'})}}]});}}});
 const context=await browser.newContext();try{await app.provision('student001','Isolated-ui-password!');await app.listen(0);const address=app.server.address();if(!address||typeof address==='string')throw Error('port');const page=await context.newPage();await page.goto(`http://127.0.0.1:${address.port}/#/login`);await page.getByLabel('账号',{exact:true}).fill('student001');await page.getByLabel('密码',{exact:true}).fill('Isolated-ui-password!');await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('link',{name:'简历工作台',exact:true}).click();expect(calls).toBe(0);
  await page.getByRole('button',{name:'生成表达建议',exact:true}).click();await expect(page.getByText('隔离测试：点击后生成，原简历未改动。',{exact:true})).toBeVisible();expect(calls).toBe(1);expect(wires[0]).not.toContain('林知夏');await expect(page.getByRole('dialog',{name:'确认本次脱敏外发'})).toHaveCount(0);
 await page.getByRole('switch',{name:'AI默认授权'}).click();await page.getByRole('button',{name:'生成表达建议',exact:true}).click();expect(calls).toBe(1);await page.getByRole('switch',{name:'AI默认授权'}).click();
 }finally{await context.close();await app.close();await rm(root,{recursive:true,force:true});}
});
