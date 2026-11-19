import { test, expect, type Page } from '@playwright/test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createOnlineApp } from '../../server/app';
import { contrastRatio } from '../../src/domain/design/contrast';

const evidence = join(tmpdir(), 'careerpilot-ui-refresh-20261117');
async function frame(page: Page) {
  // Charts resize in ResizeObserver after viewport changes; verify the settled frame.
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
}
async function shot(page: Page, name: string) {
  await mkdir(join(evidence, 'after'), { recursive: true });
  await page.screenshot({ path: join(evidence, 'after', name + '.png'), fullPage: true });
}

// Catches undersized branding, hidden mobile navigation and decoration intercepting controls.
test('UI public brand and complete navigation remain readable on desktop and mobile', async ({ page }) => {
  await page.goto('/#/');
  for (const width of [1440, 390, 320, 768, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const header = page.locator('.portal-header');
    await expect(header.locator('.brand-wordmark strong')).toHaveCSS('font-size', width <= 650 ? '30px' : '36px');
    await expect(header.locator('.brand-mark > svg')).toHaveCSS('width', width <= 650 ? '56px' : '64px');
    await expect(header.getByRole('navigation', { name: '公共导航' })).toBeVisible();
    await expect(header.getByRole('button', { name: '切换到深色主题' })).toBeVisible();
    await expect(header.getByText('闻鸣知路，循引赴职。', { exact: true })).toBeVisible();
    if (width <= 650) {
      const mark = await header.locator('.brand-mark').boundingBox();
      const theme = await header.locator('.theme-toggle').boundingBox();
      const nav = await header.getByRole('navigation', { name: '公共导航' }).boundingBox();
      expect(theme!.y).toBeLessThan(mark!.y + mark!.height);
      expect(nav!.x).toBeCloseTo(mark!.x, 0);
    }
    await frame(page);
    if ([1440, 390].includes(width)) await shot(page, `portal-${width}`);
  }
  const destinations = await page.locator('.service-route a').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')));
  expect(destinations).toEqual(['#/login?redirect=/student/resume', '#/login?redirect=/student/jobs', '#/login?redirect=/student/mock']);
  await page.getByRole('button', { name: '切换到深色主题' }).click();
  await shot(page, 'portal-dark');
  await page.getByRole('textbox', { name: '搜索公开岗位' }).fill('not-a-real-vacancy');
  await expect(page.getByText('暂时没有符合条件的岗位，试试其他关键词。')).toBeVisible();
});

test('UI dashboard charts retain enough space for complete labels', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#/login');
  await page.getByRole('radio', { name: '辅导员', exact: true }).click();
  await page.getByRole('button', { name: '以辅导员身份进入' }).click();
  await page.goto('/#/counselor/dashboard');
  const chart = page.locator('.chart-matrix .chart-canvas').nth(1);
  await expect(chart).toBeVisible();
  expect((await chart.boundingBox())!.width).toBeGreaterThan(400);
  // ECharts uses SVG; every funnel label must fit inside its drawing surface.
  await expect.poll(() => chart.evaluate(el => {
    const bounds = el.getBoundingClientRect();
    const labels = [...el.querySelectorAll('text')];
    return labels.length >= 4 && labels.every(label => {
      const box = label.getBoundingClientRect();
      return box.left >= bounds.left - 1 && box.right <= bounds.right + 1;
    });
  })).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => chart.evaluate(el => {
    const bounds = el.getBoundingClientRect();
    return [...el.querySelectorAll('text')].every(label => label.getBoundingClientRect().right <= bounds.right + 1);
  })).toBe(true);
  await frame(page);
});

test('UI resume keeps editing ahead of diagnosis on mobile and all sections reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/login');
  await page.getByRole('button', { name: '以学生身份进入' }).click();
  await page.goto('/#/student/resume');
  const editor = page.locator('.resume-editor');
  const diagnosis = page.locator('.diagnosis-rail');
  await expect(editor).toBeVisible();
  expect((await editor.boundingBox())!.y).toBeLessThan((await diagnosis.boundingBox())!.y);
  for (const name of ['基本信息', '教育背景', '实习经历', '项目经历', '技能标签', '证书']) {
    await expect(editor.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await frame(page);
  const palette = await page.locator('.business-footer').evaluate(el => {
    const scene = el.closest('.ui-scene')!;
    const style = getComputedStyle(scene);
    return { text: getComputedStyle(el).color, ends: [style.getPropertyValue('--scene-a').trim(), style.getPropertyValue('--scene-b').trim()] };
  });
  const hex = '#' + palette.text.match(/\d+/g)!.slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('');
  for (const endpoint of palette.ends) expect(contrastRatio(hex, endpoint)).toBeGreaterThanOrEqual(4.5);
});

test('UI online portal preserves five services, three preparation links and role entries', async ({ browser }) => {
  const root = await mkdtemp(join(tmpdir(), 'cp-ui-public-'));
  const app = await createOnlineApp({ databasePath: join(root, 'db.sqlite'), seed: true, staticRoot: resolve('dist') });
  await app.listen(0);
  const address = app.server.address();
  if (!address || typeof address === 'string') throw Error('missing test port');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/#/`);
    await expect(page.locator('.public-header .brand-wordmark strong')).toHaveCSS('font-size', '26px');
    expect(await page.locator('[aria-label="国家平台就业服务"] a').evaluateAll(ns => ns.map(n => n.getAttribute('href')))).toEqual([
      'https://www.ncss.cn/student/jobfair/index.html', 'https://www.ncss.cn/student/shixi.html',
      'https://www.ncss.cn/zdxw', 'https://www.ncss.cn/zcxw', 'https://www.ncss.cn/jyfxts',
    ]);
    await expect(page.locator('.preparation-links > a')).toHaveCount(3);
    await expect(page.locator('.portal-role-band a')).toHaveCount(3);
    await shot(page, 'online-portal-1440');
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await frame(page);
      await expect(page.locator('.public-header .brand-wordmark strong')).toHaveCSS('font-size', '26px');
      await expect(page.getByRole('button', { name: '切换到深色主题' })).toBeVisible();
    }
    await shot(page, 'online-portal-320');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: '切换到深色主题' }).click();
    await shot(page, 'online-portal-dark');
    await page.getByRole('textbox', { name: '搜索公开岗位' }).fill('Vue');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(page).toHaveURL(/opportunities\?q=Vue/);
    expect(errors).toEqual([]);
  } finally {
    await context.close(); await app.close(); await rm(root, { recursive: true, force: true });
  }
});

const roles = [
  { name: '学生', routes: ['/student', '/student/resume', '/student/resume/preview', '/student/resume/optimize', '/student/resume/import', '/student/jobs', '/student/jobs/matches', '/student/mock', '/student/mock/text', '/student/mock/practice', '/student/mock/report', '/student/applications', '/student/destination', '/student/service', '/student/data-check'] },
  { name: '企业', routes: ['/company', '/company/jobs', '/company/candidates', '/company/agreements', '/company/schedule', '/company/service', '/company/data-check'] },
  { name: '辅导员', routes: ['/counselor', '/counselor/students', '/counselor/support', '/counselor/dashboard', '/counselor/service', '/counselor/data-check'] },
  { name: '管理员', routes: ['/admin', '/admin/admission', '/admin/service', '/admin/data-check'] },
];
for (const role of roles) test(`UI ${role.name} pages have full-area scenes without narrow-screen overflow`, async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/#/login');
  await page.getByRole('radio', { name: role.name, exact: true }).click();
  await page.getByRole('button', { name: `以${role.name}身份进入` }).click();
  for (const route of role.routes) {
    await page.goto('/#' + route);
    const main = page.locator('main#main-content');
    await expect(main).toBeVisible();
    // Route redirects can detach the previously visible main between assertions.
    // Re-resolve the current element until its decoration is attached and styled.
    await expect.poll(() => main.evaluate(el => {
      const s = getComputedStyle(el, '::before');
      return { image: s.backgroundImage !== 'none' && s.backgroundImage !== '', events: s.pointerEvents, tall: parseFloat(s.height) > 300 };
    })).toEqual({ image: true, events: 'none', tall: true });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await frame(page);
    }
    if (['/student/resume', '/student', '/counselor/dashboard', '/company/candidates', '/admin'].includes(route)) {
      await shot(page, route.slice(1).replaceAll('/', '-') + '-390');
      await page.setViewportSize({ width: 1440, height: 1000 });
      await shot(page, route.slice(1).replaceAll('/', '-') + '-1440');
    }
  }
});

test('UI teleported dialogs keep solid body, decorated header, focus and scroll restoration', async ({ page }) => {
  await page.goto('/#/design-system');
  const trigger = page.getByRole('button', { name: '打开抽屉演示' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '一束清晰的指引' });
  await expect(dialog).toBeVisible();
  expect(await dialog.locator('header').evaluate(el => getComputedStyle(el).backgroundImage)).not.toBe('none');
  await expect(dialog.locator('.overlay-body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(dialog.getByRole('button', { name: '关闭' })).toHaveCSS('width', '44px');
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '完成演示' })).toBeFocused();
  await shot(page, 'drawer');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('UI teleported resume, AI and help windows retain their distinct scene families', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#/login');
  await page.getByRole('button', { name: '以学生身份进入' }).click();
  await page.goto('/#/student/resume');
  // Header controls exist before the original async resume read completes.
  // Exercise the loaded history flow, not the unchanged pre-load guard.
  await expect(page.getByRole('textbox', { name: '姓名', exact: true })).toHaveValue('林知夏');
  const cases = [
    { trigger: '版本对比', title: '简历版本对比', color: '#e0e4fa' },
    { trigger: '本机AI连接', title: '本机 AI 连接', color: '#ddd8f7' },
    { trigger: '帮助与说明', title: '帮助与说明', color: '#d2e8f2' },
  ];
  for (const item of cases) {
    await page.getByRole('button', { name: item.trigger, exact: true }).click();
    const window = page.getByRole('dialog', { name: item.title, exact: true });
    await expect(window).toBeVisible();
    expect(await window.evaluate(el => getComputedStyle(el).getPropertyValue('--scene-a').trim())).toBe(item.color);
    expect(await window.locator('header').evaluate(el => getComputedStyle(el).backgroundImage)).toContain('gradient');
    await window.getByRole('button', { name: '关闭', exact: true }).click();
  }
  await page.getByRole('button', { name: '宠物动作与设置', exact: true }).click();
  const menu = page.getByRole('region', { name: '宠物动作与设置', exact: true });
  await expect(menu.getByRole('button', { name: '关闭宠物设置', exact: true })).toHaveCSS('min-height', '44px');
  expect(await menu.locator('header').evaluate(el => getComputedStyle(el).backgroundImage)).not.toBe('none');
  await menu.getByRole('button', { name: '关闭宠物设置', exact: true }).click();
  await page.getByRole('button', { name: 'AI Chatbot · 长按拖动', exact: true }).click();
  const assistant = page.getByRole('dialog', { name: '全局AI助手', exact: true });
  await expect(assistant.getByRole('button', { name: '收起AI助手', exact: true })).toHaveCSS('min-height', '44px');
  await shot(page, 'assistant-window');
});
