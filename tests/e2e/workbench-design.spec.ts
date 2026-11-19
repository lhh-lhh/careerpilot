import { test, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createOnlineApp } from '../../server/app';

test('approved interview design isolates every original navigation control from artwork and never calls AI on entry', async ({ browser }, info) => {
  test.setTimeout(90000);
  const root = await mkdtemp(join(tmpdir(), 'cp-design-'));
  const app = await createOnlineApp({ databasePath: join(root, 'test.sqlite'), seed: true, staticRoot: resolve('dist') });
  const context = await browser.newContext();
  try {
    await app.provision('student001', 'Design-isolated-only!'); await app.listen(0);
    const address = app.server.address(); if (!address || typeof address === 'string') throw Error('port');
    const origin = `http://127.0.0.1:${address.port}`, page = await context.newPage(), calls: string[] = [];
    page.on('request', r => { if (r.method() === 'POST' && /\/api\/(ai|voice)\//.test(r.url())) calls.push(r.url()); });
    await page.goto(origin + '/#/login'); await page.getByLabel('账号', { exact: true }).fill('student001');
    await page.getByLabel('密码', { exact: true }).fill('Design-isolated-only!'); await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByRole('button', { name: '退出登录', exact: true })).toBeVisible();
    const shots = join(tmpdir(), 'careerpilot-workbench-20261118', info.project.name); await mkdir(shots, { recursive: true });
    for (const route of ['/student/mock/voice', '/student/mock/text', '/student/resume', '/student/resume/suggestions']) {
      await page.goto(origin + '/#' + route);
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        const art = page.locator('.workbench-hero-art'); await expect(art).toBeVisible();
        const hero = (await page.locator('.workbench-hero').boundingBox())!;
        const actions = page.locator('.workbench-action-rail'); await expect(actions).toBeVisible();
        expect((await actions.boundingBox())!.y).toBeGreaterThanOrEqual(hero.y + hero.height);
        const overlap = await page.locator('.workbench-header').evaluate(el => {
          const image = el.querySelector('.workbench-hero-art')!.getBoundingClientRect();
          return [...el.querySelectorAll('h1,p,a,button,input')].filter(n => {
            const b = n.getBoundingClientRect(); return b.width && b.height && Math.min(b.right, image.right) > Math.max(b.left, image.left) + 1 && Math.min(b.bottom, image.bottom) > Math.max(b.top, image.top) + 1;
          }).map(n => n.textContent);
        });
        expect(overlap).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        await page.screenshot({ path: join(shots, route.replaceAll('/', '_') + '-' + width + '.png'), fullPage: true, animations: 'disabled' });
      }
      if (route.endsWith('/suggestions')) {
        await page.setViewportSize({width:1440,height:1000});
        const settings=(await page.locator('.diagnosis-rail .form-stack').boundingBox())!;
        const guide=(await page.locator('.diagnosis-rail .workbench-guide').boundingBox())!;
        const comparison=(await page.locator('.diff-area').boundingBox())!;
        expect(settings.x+settings.width).toBeLessThan(guide.x);
        expect(comparison.x).toBeCloseTo(settings.x,0);
        expect(comparison.y).toBeGreaterThanOrEqual(settings.y+settings.height);
      }
      if (route.includes('/mock/')) {
        await expect(page.locator('.workbench-action-rail a')).toHaveCount(3);
        await expect(page.getByText('共享日额度限制', { exact: false })).toBeVisible();
      }
    }
    await page.goto(origin + '/#/student');
    await expect(page.locator('.recommendation-row .job-artwork img').first()).toBeVisible();
    expect(calls).toEqual([]);
  } finally { await context.close(); await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('fresh assistant uses an in-flow safe dock and preserves manual drag preferences', async ({browser}) => {
  const root=await mkdtemp(join(tmpdir(),'cp-dock-'));
  const app=await createOnlineApp({databasePath:join(root,'test.sqlite'),seed:true,staticRoot:resolve('dist')});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  try {
    await app.provision('student001','Dock-isolated-only!');await app.listen(0);
    const address=app.server.address();if(!address||typeof address==='string')throw Error('port');
    const page=await context.newPage(),origin=`http://127.0.0.1:${address.port}`;
    await page.goto(origin+'/#/login');await page.getByLabel('账号',{exact:true}).fill('student001');
    await page.getByLabel('密码',{exact:true}).fill('Dock-isolated-only!');await page.getByRole('button',{name:'登录',exact:true}).click();
    await expect(page.getByRole('button',{name:'退出登录',exact:true})).toBeVisible();
    await page.goto(origin+'/#/student/resume');
    const dock=page.locator('[data-pet-dock]');await expect(dock).toHaveCount(1);
    await page.reload();await expect(page.locator('[data-pet-launcher]')).toHaveAttribute('data-docked','true');
    await expect(page.getByLabel('姓名',{exact:true})).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>{
      const main=document.querySelector('#main-content')!.getBoundingClientRect();
      const safeDock=document.querySelector('[data-pet-dock]')!.getBoundingClientRect();
      return safeDock.top>=main.bottom-1;
    }),{message:'loaded dock must remain below the complete page in the same layout frame'}).toBe(true);
    await page.getByRole('button',{name:'打开AI助手',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'全局AI助手',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'收起AI助手',exact:true}).click();
    await page.getByRole('button',{name:'AI Chatbot · 长按拖动',exact:true}).click();
    await expect(page.locator('[data-pet-launcher]')).toHaveAttribute('data-docked','true');
    await page.getByRole('button',{name:'收起AI助手',exact:true}).click();
    await page.getByRole('button',{name:'AI Chatbot · 长按拖动',exact:true}).focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('[data-pet-launcher]')).toHaveAttribute('data-docked','false');
    const point=await page.locator('[data-pet-launcher]').boundingBox();await page.reload();
    await expect(page.locator('[data-pet-launcher]')).toHaveAttribute('data-docked','false');
    expect((await page.locator('[data-pet-launcher]').boundingBox())!.x).toBeCloseTo(point!.x,0);
    await page.getByRole('button',{name:'宠物动作与设置',exact:true}).click();
    await page.getByRole('button',{name:'停靠安全位',exact:true}).click();
    await expect(page.locator('[data-pet-launcher]')).toHaveAttribute('data-docked','true');
    await page.getByRole('button',{name:'宠物动作与设置',exact:true}).click();
    await page.getByRole('combobox',{name:'角色大小',exact:true}).selectOption('180');
    await page.getByRole('button',{name:'关闭宠物设置',exact:true}).click();
    await page.setViewportSize({width:320,height:480});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }finally{await context.close();await app.close();await rm(root,{recursive:true,force:true});}
});
