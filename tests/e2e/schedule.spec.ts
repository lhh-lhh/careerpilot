import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createOnlineApp } from '../../server/app';

test('company schedule filters authorized invitations and opens the correct candidate', async ({ browser }) => {
  const root = await mkdtemp(join(tmpdir(), 'careerpilot-schedule-'));
  const app = await createOnlineApp({ databasePath: join(root, 'db.sqlite'), seed: true, staticRoot: resolve('dist') });
  const context = await browser.newContext();
  try {
    await app.provision('company1', 'Test-only-schedule-password!');
    await app.listen(0); const address = app.server.address(); if (!address || typeof address === 'string') throw Error('no port');
    const page = await context.newPage(); await page.goto(`http://127.0.0.1:${address.port}/#/login`);
    await page.getByRole('textbox', { name: '账号', exact: true }).fill('company1'); await page.getByLabel('密码', { exact: true }).fill('Test-only-schedule-password!');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('link', { name: '面试日程', exact: true }).click();
    await expect(page.getByRole('heading', { name: '让每一次见面，安排有序。', exact: true })).toBeVisible();
    await expect(page.getByRole('region', {name:'面试月历',exact:true})).toBeVisible();
    const snapshot = await app.repository.readCompanyWorkspace({ role: 'company', userId: 'user-company-001' });
    const next = snapshot.interviews.find(i => i.status === 'scheduled'); if (!next) throw Error('missing seed invitation');
    await page.getByLabel('日程状态', { exact: true }).selectOption('scheduled');
    await expect(page.locator(`[data-interview="${next.id}"]`)).toBeVisible();
    await page.getByLabel('日程日期（北京时间）', { exact: true }).fill('2030-01-01');
    await expect(page.getByText('当前筛选下没有面试日程。', { exact: true })).toBeVisible();
    await page.getByLabel('日程日期（北京时间）', { exact: true }).fill('');
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    await page.locator(`[data-interview="${next.id}"]`).getByRole('link', { name: '办理邀约', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`application=${next.applicationId}`));
    await expect(page.getByRole('button', { name: '调整面试', exact: true })).toBeVisible();
  } finally { await context.close(); await app.close(); await rm(root, { recursive: true, force: true }); }
});
