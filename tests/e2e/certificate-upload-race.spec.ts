import { expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initializeService } from '../../server/bootstrap';
import { createOnlineApp } from '../../server/app';

test('an uploaded certificate attaches to the current draft after a synchronized resume replacement', async ({ browser }) => {
  test.setTimeout(60000);
  const root = await mkdtemp(join(tmpdir(), 'cp-certificate-race-'));
  const databasePath = join(root, 'service.sqlite');
  const credentials = await initializeService(databasePath);
  const app = await createOnlineApp({ databasePath, staticRoot: resolve('dist') });
  const context = await browser.newContext();
  let releaseUpload = () => {};
  try {
    await app.listen(0);
    const address = app.server.address();
    if (!address || typeof address === 'string') throw Error('port');
    const origin = `http://127.0.0.1:${address.port}`;
    const page = await context.newPage();
    const credential = credentials.find(c => c.login === 'student.chen')!;
    await page.goto(origin + '/#/login');
    await page.getByLabel('账号', { exact: true }).fill(credential.login);
    await page.getByLabel('密码', { exact: true }).fill(credential.password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('link', { name: '简历工作台', exact: true }).click();
    await page.getByRole('button', { name: '添加证书', exact: true }).click();
    const row = page.locator('#resume-certificates .entry').last();
    await row.getByLabel('证书名称', { exact: true }).fill('隔离测试证书');
    await row.getByLabel('颁发机构', { exact: true }).fill('隔离测试机构');
    await row.getByLabel('获得日期', { exact: true }).fill('2026-01-01');
    await page.getByRole('button', { name: '保存新版本', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('已保存');

    let uploaded = () => {};
    const uploadReachedServer = new Promise<void>(resolve => { uploaded = resolve; });
    const uploadResponseGate = new Promise<void>(resolve => { releaseUpload = resolve; });
    await page.route('**/api/attachments', async route => {
      const response = await route.fetch(); // real write and SSE, only response delivery is delayed
      uploaded();
      await uploadResponseGate;
      await route.fulfill({ response });
    });
    await row.getByLabel('上传证书文件', { exact: true }).setInputFiles({
      name: 'race.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-race'),
    });
    await uploadReachedServer;

    // Another authenticated tab saves while this tab has no unsaved changes.
    const session = await (await context.request.get(origin + '/api/session')).json();
    const snapshot = await (await context.request.get(origin + '/api/read/readScopedSnapshot?args=%5B%5D')).json();
    const resume = snapshot.resumes[0];
    resume.sections.certificates[0].issuer = '另一标签页更新的测试机构';
    const saved = await context.request.post(origin + '/api/commands', {
      headers: { 'X-CSRF-Token': session.csrf },
      data: { type: 'SAVE_RESUME', entityId: resume.id, expectedRevision: resume.revision,
        commandId: crypto.randomUUID(), payload: { sections: resume.sections } },
    });
    expect(saved.ok()).toBe(true);
    await expect(row.getByLabel('颁发机构', { exact: true })).toHaveValue('另一标签页更新的测试机构');
    releaseUpload();
    await expect(row.getByRole('button', { name: '下载 race.pdf', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '保存新版本', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('已保存');
    await page.reload();
    await expect(page.getByRole('button', { name: '下载 race.pdf', exact: true })).toBeVisible();
  } finally {
    releaseUpload();
    await context.close();
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
