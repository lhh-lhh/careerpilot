import {test,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createOnlineApp} from '../../server/app';

test('pet remains draggable with chat closed, persists safely and preserves original chat',async({browser},testInfo)=>{
 test.setTimeout(60000);
 const root=await mkdtemp(join(tmpdir(),'cp-pet-e2e-'));let calls=0;
 const app=await createOnlineApp({databasePath:join(root,'db.sqlite'),seed:true,staticRoot:resolve('dist'),ai:{enabled:true,apiKey:'isolated-pet-not-real',dailyGlobalCalls:10,dailyUserCalls:5,transport:async()=>{calls++;return new Response('data: {"choices":[{"delta":{"content":"仅隔离测试回复"}}]}\n\ndata: {"choices":[{"finish_reason":"stop","delta":{}}]}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});}}});
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 // Existing users keep their original floating preference; fresh users are covered by the safe-dock test.
 await context.addInitScript(()=>{if(!localStorage.getItem('careerpilot.assistant-pet.v1'))localStorage.setItem('careerpilot.assistant-pet.v1',JSON.stringify({x:1106,y:690,size:150,paused:false,roam:false}));});
 const page=await context.newPage();
 const runtimeErrors:string[]=[];let authenticated=false;page.on('pageerror',error=>runtimeErrors.push(error.message));page.on('console',message=>{if(authenticated&&message.type()==='error')runtimeErrors.push(message.text());});
 try{
  await app.provision('student001','Pet-E2E-only-password!');await app.listen(0);const address=app.server.address();if(!address||typeof address==='string')throw Error('port');const origin=`http://127.0.0.1:${address.port}`;
  await page.goto(origin+'/#/login');await page.getByLabel('账号',{exact:true}).fill('student001');await page.getByLabel('密码',{exact:true}).fill('Pet-E2E-only-password!');await page.getByRole('button',{name:'登录',exact:true}).click();
  const pet=page.getByRole('button',{name:'AI Chatbot · 长按拖动',exact:true}),panel=page.getByRole('dialog',{name:'全局AI助手'});
  await expect(pet).toBeVisible();await expect(panel).toHaveCount(0);await expect.poll(()=>page.locator('.pet-video.is-front').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(0);
  authenticated=true; // The anonymous /api/session probe intentionally returns401 before login.
  await expect(page).toHaveURL(/#\/student/);await expect(page).toHaveTitle(/CareerPilot/);await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.screenshot({path:join(tmpdir(),`careerpilot-pet-desktop-${testInfo.project.name}.png`)});
  await page.getByRole('button',{name:'宠物动作与设置',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'播放原版动作',exact:true}).locator('option:not([disabled])')).toHaveCount(114);
  await page.getByRole('button',{name:'关闭宠物设置',exact:true}).click();
  await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(()=>page.locator('.pet-video.is-front').evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true);
  await page.emulateMedia({reducedMotion:'no-preference'});await expect.poll(()=>page.locator('.pet-video.is-front').evaluate((v:HTMLVideoElement)=>v.paused)).toBe(false);
  const before=await pet.boundingBox();if(!before)throw Error('pet box');await page.mouse.move(before.x+before.width/2,before.y+before.height/2);await page.mouse.down();await page.waitForTimeout(350);await page.mouse.move(250,300,{steps:6});await page.mouse.up();await expect(panel).toHaveCount(0);
  const moved=await pet.boundingBox();expect(moved!.x).toBeLessThan(before.x-100);expect(calls).toBe(0);
  await page.reload();await expect(pet).toBeVisible();const restored=await pet.boundingBox();expect(Math.abs(restored!.x-moved!.x)).toBeLessThan(2);
  await pet.focus();await pet.press('ArrowLeft');await pet.press('ArrowUp');const keyed=await pet.boundingBox();expect(keyed!.x).toBeCloseTo(restored!.x-16,0);expect(keyed!.y).toBeCloseTo(restored!.y-16,0);
  await pet.press('Enter');await expect(panel).toBeVisible();await panel.getByRole('button',{name:'收起AI助手'}).click();await pet.focus();await pet.press('Space');await expect(panel).toBeVisible();await panel.getByRole('button',{name:'收起AI助手'}).click();
  await page.mouse.move(keyed!.x+keyed!.width/2,keyed!.y+keyed!.height/2);await page.mouse.down();await pet.dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();await expect(panel).toHaveCount(0);
  await pet.click();await expect(panel).toBeVisible();await panel.getByLabel('向AI助手提问').fill('测试入口');await panel.getByRole('button',{name:'发送',exact:true}).click();await expect(panel.getByText('仅隔离测试回复',{exact:true})).toBeVisible();await expect(panel.locator('.ai-provenance')).toContainText('DeepSeek');expect(calls).toBe(1);await panel.getByRole('button',{name:'收起AI助手'}).click();
  for(const target of [{x:10,y:10},{x:1260,y:10},{x:10,y:880},{x:1260,y:880}]){
   const box=await pet.boundingBox();await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();await page.waitForTimeout(330);await page.mouse.move(target.x,target.y,{steps:5});await page.mouse.up();await pet.click();await expect(panel).toBeVisible();const bounds=await panel.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.y).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(1280);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(900);await panel.getByRole('button',{name:'收起AI助手'}).click();
  }
  await page.goto(origin+'/#/student/resume');await expect(pet).toBeVisible();await page.setViewportSize({width:390,height:844});const small=await pet.boundingBox();expect(small!.x+small!.width).toBeLessThanOrEqual(390);expect(small!.y+small!.height).toBeLessThanOrEqual(844);await pet.click();await expect(panel.getByLabel('向AI助手提问')).toBeVisible();expect(calls).toBe(1);
  await page.screenshot({path:join(tmpdir(),`careerpilot-pet-mobile-${testInfo.project.name}.png`)});expect(runtimeErrors).toEqual([]);
 }finally{await context.close();await app.close();await rm(root,{recursive:true,force:true});}
});
