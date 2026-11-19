import { test, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createOnlineApp } from '../../server/app';

test('online reference portal combines full-bleed hero, compact jobs and distinct meaningful imagery',async({browser},info)=>{
  const root=await mkdtemp(join(tmpdir(),'cp-reference-'));
  const app=await createOnlineApp({databasePath:join(root,'fixture.sqlite'),seed:true,staticRoot:resolve('dist')});
  const context=await browser.newContext({viewport:{width:1536,height:1024}});
  try{
    await app.listen(0);const address=app.server.address();if(!address||typeof address==='string')throw Error('port');
    const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${address.port}/#/`);
    await expect(page.locator('.opportunity-row')).toHaveCount(6);
    const hero=await page.locator('.portal-hero-new').boundingBox();
    expect(hero!.x).toBeLessThanOrEqual(1);expect(hero!.width).toBe(1536);expect(hero!.height).toBeLessThanOrEqual(300);
    const jobs=await page.locator('.opportunity-row').all();const boxes=await Promise.all(jobs.map(p=>p.boundingBox()));
    expect(new Set(boxes.map(b=>Math.round(b!.x))).size).toBe(2);
    expect(Math.max(...boxes.map(b=>b!.height))).toBeLessThan(95);
    const art=page.locator('.opportunity-row .job-artwork img');await expect(art).toHaveCount(6);
    expect(new Set(await art.evaluateAll(els=>els.map(e=>(e as HTMLImageElement).src))).size).toBe(6);
    for(const image of await art.all()) await expect.poll(()=>image.evaluate(e=>(e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const serviceBoxes=await Promise.all((await page.locator('.portal-services nav>a').all()).map(p=>p.boundingBox()));
    expect(new Set(serviceBoxes.map(b=>Math.round(b!.y))).size).toBe(1);
    const shots=join(tmpdir(),'careerpilot-reference-final',info.project.name);await mkdir(shots,{recursive:true});
    await page.screenshot({path:join(shots,'portal-1536.png'),fullPage:true,animations:'disabled'});
    for(const width of [1280,1024,768,390,320]){
      await page.setViewportSize({width,height:844});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      await expect(page.getByRole('button',{name:'搜索',exact:true})).toBeVisible();
    }
    await page.screenshot({path:join(shots,'portal-320.png'),fullPage:true,animations:'disabled'});
    await page.getByRole('textbox',{name:'搜索公开岗位',exact:true}).fill('前端');
    await page.getByRole('button',{name:'搜索',exact:true}).click();await expect(page).toHaveURL(/q=/);
    expect(errors).toEqual([]);
  }finally{await context.close();await app.close();await rm(root,{recursive:true,force:true});}
});

test('online reference jobs and practice preserve real controls and use image-first layouts',async({browser},info)=>{
  test.setTimeout(60000);
  const root=await mkdtemp(join(tmpdir(),'cp-reference-student-'));
  const app=await createOnlineApp({databasePath:join(root,'fixture.sqlite'),seed:true,staticRoot:resolve('dist')});
  const context=await browser.newContext({viewport:{width:1536,height:1024}});
  try{
    await app.provision('student001','reference-isolated-only!');await app.listen(0);
    const address=app.server.address();if(!address||typeof address==='string')throw Error('port');
    const origin=`http://127.0.0.1:${address.port}`,page=await context.newPage();
    const errors:string[]=[],generated:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(ai|voice)\//.test(r.url()))generated.push(r.url());});
    await page.goto(origin+'/#/login');await page.getByLabel('账号',{exact:true}).fill('student001');
    await page.getByLabel('密码',{exact:true}).fill('reference-isolated-only!');
    await page.getByRole('button',{name:'登录',exact:true}).click();
    await expect(page.getByRole('button',{name:'退出登录',exact:true})).toBeVisible();
    const shots=join(tmpdir(),'careerpilot-reference-final',info.project.name);await mkdir(shots,{recursive:true});
    for(const [route,name] of [['/student/jobs','jobs'],['/student/mock/practice','practice']]){
      await page.goto(origin+'/#'+route);await expect(page.locator(name==='jobs'?'.jobs-page':'.practice-page')).toBeVisible();
      const header=page.locator('.workbench-hero').first();
      const art=header.locator('.workbench-hero-art img');
      await expect(art).toHaveAttribute('src',name==='practice'?'/media/career/practice-banner.webp':'/media/workbench/student-a-07.webp');
      await expect.poll(()=>art.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      expect((await header.boundingBox())!.height).toBeGreaterThanOrEqual(190);
      expect((await page.locator('.sidebar').boundingBox())!.width).toBe(218);
      if(name==='jobs'){
        await expect(page.locator('.job-row').first()).toBeVisible();
        const images=page.locator('.job-artwork img');expect(await images.count()).toBeGreaterThan(0);
        for(const im of (await images.all()).slice(0,10)){await im.scrollIntoViewIfNeeded();await expect.poll(()=>im.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);}
        const first=await page.locator('.job-results').boundingBox(),rail=await page.locator('.filter-rail').boundingBox();expect(first!.x).toBeLessThan(rail!.x);
      }else{
        await expect(page.locator('.practice-card')).toHaveCount(3);
        await expect.poll(async()=>{const boxes=await Promise.all((await page.locator('.practice-card').all()).map(p=>p.boundingBox()));return new Set(boxes.map(b=>Math.round(b!.y))).size;}).toBe(1);
        await expect(page.getByRole('button',{name:'文字练习',exact:true})).toHaveCount(3);
        await expect(page.getByRole('button',{name:'语音练习',exact:true})).toHaveCount(3);
        await expect(page.getByRole('heading',{name:'你的职业进阶之路',exact:true})).toBeVisible();
      }
      await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(shots,name+'-1536.png'),fullPage:true,animations:'disabled'});
      for(const width of [1280,1024,768,390,320]){
        await page.setViewportSize({width,height:844});
        const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,bad:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:e.className,x:e.getBoundingClientRect().x,r:e.getBoundingClientRect().right})).filter(e=>e.r>innerWidth+1||e.x< -1).slice(0,15)}));
        expect(layout.scroll,name+width+JSON.stringify(layout)).toBeLessThanOrEqual(width+1);
      }
      await page.screenshot({path:join(shots,name+'-320.png'),fullPage:true,animations:'disabled'});
      await page.setViewportSize({width:1536,height:1024});
    }
    expect(generated).toEqual([]);expect(errors).toEqual([]);
  }finally{await context.close();await app.close();await rm(root,{recursive:true,force:true});}
});
