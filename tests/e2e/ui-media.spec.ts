import { test, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// Missing media or a media frame displacing original controls breaks these checks.
test('editorial headings and practice covers enrich content without overflow or hidden controls', async ({ page }, info) => {
  await page.goto('/#/login'); await page.getByRole('button', { name: '以学生身份进入', exact: true }).click();
  for (const route of ['/student', '/student/resume', '/student/jobs', '/student/mock/text', '/student/mock/practice', '/student/service']) {
    await page.goto('/#' + route);
    const heading = page.locator('.workbench-hero').first();
    await expect(heading).toBeVisible();
    const art = heading.locator('.workbench-hero-art img');
    await expect(art).toHaveAttribute('src', /\/media\/(workbench|career)\//);
    await expect.poll(()=>art.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route + width).toBe(true);
      await expect(page.locator('h1').first()).toBeVisible();
    }
  }
  const covers = page.locator('.practice-cover');
  await page.goto('/#/student/mock/practice'); await expect(covers).toHaveCount(3);
  for (const cover of await covers.all()) {
    expect(await cover.evaluate(el => getComputedStyle(el).backgroundImage)).toMatch(/practice-|operations-/);
    expect((await cover.boundingBox())!.height).toBeGreaterThanOrEqual(100);
  }
  await expect(page.getByRole('button', { name: '文字练习', exact: true })).toHaveCount(3);
  await expect(page.getByRole('button', { name: '语音练习', exact: true })).toHaveCount(3);
  const shots = join(tmpdir(), 'careerpilot-media-final-20261118', info.project.name); await mkdir(shots,{recursive:true});
  for (const [width,height] of [[1536,1024],[390,844]]) {
    await page.setViewportSize({width:width!,height:height!}); await page.screenshot({path:join(shots,`practice-${width}.png`),fullPage:true,animations:'disabled'});
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const cover of await covers.all()) expect(parseFloat(await cover.evaluate(el => getComputedStyle(el).transitionDuration))).toBeLessThanOrEqual(.001);
});

test('mobile data-check heading keeps illustration visible without desktop flex-basis blank space', async ({ page }) => {
  await page.setViewportSize({width:390,height:844}); await page.goto('/#/login');
  await page.getByRole('button', { name:'以学生身份进入',exact:true }).click();
  await page.goto('/#/student/data-check');
  const heading=page.locator('.workbench-hero');
  await expect(heading.getByRole('heading',{name:'你的本机数据，清楚可见。',exact:true})).toBeVisible();
  expect((await heading.boundingBox())!.height).toBeLessThan(400);
  const art=(await heading.locator('.workbench-hero-art').boundingBox())!;
  expect(art.width).toBeGreaterThan(200); expect(art.height).toBeGreaterThan(100);
});

test('public resources combine distinct images with original links and keep usable image-failure fallback', async ({ browser }, info) => {
  const { createOnlineApp } = await import('../../server/app');
  const root = await mkdtemp(join(tmpdir(), 'cp-editorial-public-'));
  const app = await createOnlineApp({ databasePath: join(root, 'test.sqlite'), seed: true, staticRoot: resolve('dist') });
  const context = await browser.newContext();
  try {
    await app.listen(0); const address = app.server.address(); if (!address || typeof address === 'string') throw Error('port');
    const page = await context.newPage(), origin = `http://127.0.0.1:${address.port}`;
    await page.goto(origin + '/#/');
    const services = page.getByRole('navigation', { name: '国家平台就业服务', exact: true });
    await expect(services.getByRole('link')).toHaveCount(5);
    expect(await services.getByRole('link').first().evaluate(el => getComputedStyle(el, '::before').backgroundImage)).toContain('/media/career/services/');
    await expect(page.locator('.preparation-links .editorial-thumb')).toHaveCount(3);
    const identity = page.locator('.opportunity-identity').first(); await expect(identity).toBeVisible();
    await expect(identity.locator('img')).toHaveAttribute('src',/\/media\/career\/jobs\//);
    const images = await page.locator('img.editorial-thumb').all();
    for (const image of images) { await image.scrollIntoViewIfNeeded(); await expect.poll(()=>image.evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true); }
    for (const theme of ['light', 'dark']) for (const width of [1440, 390, 320]) {
      await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme); await page.setViewportSize({ width, height: 844 });
      const layout = await page.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('main *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(el=>({tag:el.tagName,class:el.className,parent:el.parentElement?.outerHTML.slice(0,800),grid:el.parentElement&&getComputedStyle(el.parentElement).gridTemplateColumns,width:el.getBoundingClientRect().width}))}));
      expect(layout.scroll, JSON.stringify(layout)).toBeLessThanOrEqual(width+1);
    }
    const link = page.getByRole('link', { name: /简历工作台.*梳理经历/ });
    await expect(link).toHaveAttribute('href', /redirect=\/student\/resume/);
    const shots = join(tmpdir(),'careerpilot-media-final-20261118',info.project.name); await mkdir(shots,{recursive:true});
    await page.evaluate(()=>{document.documentElement.dataset.theme='light';});
    for(const [width,height] of [[1536,1024],[390,844]]) {
      await page.setViewportSize({width:width!,height:height!}); await page.screenshot({path:join(shots,`portal-${width}.png`),fullPage:true,animations:'disabled'});
    }
    await page.route('**/media/**', route => route.abort()); await page.reload();
    await expect(link).toBeVisible(); await link.click();
    await expect(page.getByRole('heading', { name: '登录工作台', exact: true })).toBeVisible();
  } finally { await context.close(); await app.close(); await rm(root, { recursive: true, force: true }); }
});

// Old decorative ellipse positioning must not carry over to content artwork:
// an absolute image otherwise clips behind the fourth recruitment metric.
test('company header illustration remains in layout flow without obscuring recruitment metrics', async ({ page }) => {
  await page.goto('/#/login'); await page.getByRole('radio', { name: '企业', exact: true }).check();
  await page.getByRole('button', { name: '以企业身份进入', exact: true }).click();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const header = page.locator('.workbench-header');
    const illustration = await header.locator('.workbench-hero-art').evaluate(el => {
      const s = getComputedStyle(el); return {position:s.position, transform:s.transform};
    });
    expect(illustration).toEqual({position:'static', transform:'none'});
    await expect(header.getByRole('button', { name: '发布新岗位', exact: true })).toBeVisible();
    for (const metric of await header.locator('.hero-metrics > span').all()) {
      await expect(metric).toBeVisible();
      expect(await metric.evaluate(el => {
        const r=el.getBoundingClientRect(), p=el.closest('.workbench-action-rail')!.getBoundingClientRect();
        return r.left>=p.left && r.right<=p.right && r.bottom<=p.bottom;
      })).toBe(true);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
});
