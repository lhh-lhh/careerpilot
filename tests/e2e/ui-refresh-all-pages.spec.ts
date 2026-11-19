import { expect, test, type Page } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createOnlineApp } from '../../server/app';

const sizes = [320, 375, 390, 768, 1024, 1280, 1440, 1920];
const directory = join(tmpdir(), 'careerpilot-ui-final-20261117');
function consoleHealth(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => {
    if (!['error', 'warning'].includes(message.type())) return;
    // Anonymous session discovery is intentionally 401; do not suppress other failures.
    if (message.location().url.endsWith('/api/session') && /401/.test(message.text())) return;
    errors.push(`${message.type()} ${message.location().url}: ${message.text()}`);
  });
  return errors;
}
const rolePages = [
  { login: 'student001', role: '学生', paths: ['/student', '/student/resume', '/student/resume/suggestions', '/student/resume/optimize', '/student/resume/import', '/student/resume/preview', '/student/jobs', '/student/jobs/matches', '/student/opportunities', '/student/mock', '/student/mock/text', '/student/mock/voice', '/student/mock/practice', '/student/mock/report', '/student/mock/feedback', '/student/mock/voice/report', '/student/applications', '/student/destination', '/student/service', '/forbidden'] },
  { login: 'company1', role: '企业', paths: ['/company', '/company/jobs', '/company/candidates', '/company/agreements', '/company/schedule', '/company/service'] },
  { login: 'counselor1', role: '辅导员', paths: ['/counselor', '/counselor/review', '/counselor/dashboard', '/counselor/support', '/counselor/service'] },
  { login: 'admin', role: '管理员', paths: ['/admin', '/admin/accounts', '/admin/admission', '/admin/opportunities', '/admin/service'] },
];

async function inspect(page: Page, name: string, browser: string) {
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(page).toHaveTitle(/路鸣职引/);
  const scene = page.locator('.ui-scene').first();
  await expect(scene).toBeVisible();
  const header=page.locator('.workbench-header').first();
  if(await header.count()) {
    await expect.poll(()=>header.locator('.workbench-hero-art img').evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  for (const width of sizes) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), { message: `${name} at ${width}px must not overflow` }).toBe(true);
    if(await header.count()) {
      const covered=await header.evaluate(el=>{
        const image=el.querySelector('.workbench-hero-art')!.getBoundingClientRect();
        return [...el.querySelectorAll('h1,p,a,button,input')].filter(node=>{
          const b=node.getBoundingClientRect();
          return b.width&&b.height&&Math.min(b.right,image.right)>Math.max(b.left,image.left)+1&&Math.min(b.bottom,image.bottom)>Math.max(b.top,image.top)+1;
        }).map(node=>node.textContent);
      });
      expect(covered,`${name} at ${width}px artwork must not cover text or actions`).toEqual([]);
    }
  }
  const path = join(directory, browser, name.replace(/[<>:"/\\|?*]/g, '_'));
  await mkdir(path, { recursive: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: join(path, `${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
    }
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
}

for (const entry of rolePages) test(`UI final online full-page matrix ${entry.role}`, async ({ browser }, info) => {
  test.setTimeout(240000);
  const root = await mkdtemp(join(tmpdir(), 'cp-ui-final-pages-'));
  const app = await createOnlineApp({ databasePath: join(root, 'test.sqlite'), seed: true, staticRoot: resolve('dist') });
  const context = await browser.newContext();
  try {
    await app.provision(entry.login, 'UI-final-isolated-only!');
    await app.listen(0);
    const port = app.server.address(); if (!port || typeof port === 'string') throw Error('missing test port');
    const origin = `http://127.0.0.1:${port.port}`;
    const page = await context.newPage();
    const errors = consoleHealth(page);
    await page.goto(origin + '/#/login');
    await page.getByLabel('账号', { exact: true }).fill(entry.login);
    await page.getByLabel('密码', { exact: true }).fill('UI-final-isolated-only!');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByRole('button', { name: '退出登录', exact: true })).toBeVisible();
    for (const route of [...entry.paths, '/account']) {
      await page.goto(origin + '/#' + route);
      await inspect(page, 'online-' + entry.role + route, info.project.name);
    }
    expect(errors).toEqual([]);
  } finally { await context.close(); await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('UI final public online identity, invitation, detail and status pages', async ({ browser }, info) => {
  test.setTimeout(180000);
  const root = await mkdtemp(join(tmpdir(), 'cp-ui-final-public-'));
  const app = await createOnlineApp({ databasePath: join(root, 'test.sqlite'), seed: true, staticRoot: resolve('dist') });
  const context = await browser.newContext();
  try {
    await app.listen(0); const port = app.server.address(); if (!port || typeof port === 'string') throw Error('missing port');
    const origin = `http://127.0.0.1:${port.port}`, page = await context.newPage();
    const errors = consoleHealth(page);
    for (const route of ['/', '/opportunities', '/opportunities/local:job-001', '/login', '/register', '/register?role=company', '/register?invite=synthetic-invalid&role=counselor&login=ui-final', '/not-found']) {
      await page.goto(origin + '/#' + route);
      if (route.startsWith('/register')) await page.reload();
      await inspect(page, 'public' + route.replaceAll('?', '_'), info.project.name);
      if (route === '/register?role=company') {
        await page.getByRole('combobox', { name: /账号类型/ }).selectOption('company');
        await inspect(page, 'public-company-register', info.project.name);
      }
    }
    expect(errors).toEqual([]);
  } finally { await context.close(); await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('UI final offline role utilities, login, portal and design-system matrix', async ({ page }, info) => {
  test.setTimeout(180000);
  const errors = consoleHealth(page);
  for (const route of ['/', '/login', '/design-system', '/not-found']) {
    await page.goto('/#' + route); await inspect(page, 'offline' + route, info.project.name);
  }
  for (const entry of rolePages) {
    await page.goto('/#/login');
    await page.getByRole('radio', { name: entry.role, exact: true }).check();
    await page.getByRole('button', { name: `以${entry.role}身份进入`, exact: true }).click();
    for (const route of [`/${entry.login === 'company1' ? 'company' : entry.login === 'counselor1' ? 'counselor' : entry.login === 'student001' ? 'student' : 'admin'}/data-check`, ...(entry.role === '学生' ? ['/student/mock', '/student/mock/report'] : [])]) {
      await page.goto('/#' + route); await inspect(page, 'offline-' + entry.role + route, info.project.name);
    }
    await page.getByRole('button', { name: '退出演示', exact: true }).click();
  }
  expect(errors).toEqual([]);
});
