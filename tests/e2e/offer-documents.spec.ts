import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createOnlineApp } from '../../server/app';

test('independent offer document versions require student acceptance before the agreement', async ({ browser }) => {
  test.setTimeout(90000);
  const dir = await mkdtemp(join(tmpdir(), 'careerpilot-offer-document-'));
  const app = await createOnlineApp({ databasePath: join(dir, 'test.sqlite'), seed: true, staticRoot: resolve('dist') });
  const studentActor = { userId: 'user-student-040', role: 'student' as const }, companyActor = { userId: 'user-company-001', role: 'company' as const };
  const clock = { now: () => new Date().toISOString() };
  const studentContext = await browser.newContext(), companyContext = await browser.newContext();
  try {
    for (const login of ['student040', 'company1']) await app.provision(login, 'Browser-test-Password-01!');
    await app.repository.execute({ type: 'APPLY', entityId: 'browser-offer', expectedRevision: 0, commandId: crypto.randomUUID(), payload: { jobId: 'job-001', resumeConsent: true } }, studentActor, clock);
    await app.repository.execute({ type: 'APPLICATION_ACTION', entityId: 'browser-offer', expectedRevision: 1, commandId: crypto.randomUUID(), payload: { action: 'SCHEDULE_INTERVIEW', scheduledAt: '2026-12-10T10:00:00Z', location: '测试会议室' } }, companyActor, clock);
    await app.repository.execute({ type: 'APPLICATION_ACTION', entityId: 'browser-offer', expectedRevision: 2, commandId: crypto.randomUUID(), payload: { action: 'COMPLETE_INTERVIEW', result: 'pass', feedback: '实践能力核验通过。' } }, companyActor, clock);
    await app.listen(0); const address = app.server.address(); if (!address || typeof address === 'string') throw Error('no port');
    const base = `http://127.0.0.1:${address.port}`;
    const student = await studentContext.newPage(), company = await companyContext.newPage();
    for (const [page, login] of [[student, 'student040'], [company, 'company1']] as const) {
      await page.goto(`${base}/#/login`); await page.getByRole('textbox', { name: '账号', exact: true }).fill(login);
      await page.getByLabel('密码', { exact: true }).fill('Browser-test-Password-01!');
      await page.getByRole('button', { name: '登录', exact: true }).click();
      await expect(page.getByRole('button', { name: '退出登录' })).toBeVisible();
    }
    await company.goto(`${base}/#/company/candidates?application=browser-offer`);
    await student.goto(`${base}/#/student/applications?application=browser-offer`);
    await expect(student.getByText('等待你的响应', { exact: true })).toHaveCount(0);
    const issue = async (location: string) => {
      await company.getByRole('button', { name: '发出录用意向', exact: true }).click();
      const dialog = company.getByRole('dialog', { name: '签发录用意向文书', exact: true });
      await dialog.getByLabel('工作地点', { exact: true }).fill(location);
      await dialog.getByLabel('薪酬说明', { exact: true }).fill('税前月薪12000元，具体以双方劳动合同为准。');
      await dialog.getByLabel('预计到岗日期', { exact: true }).fill('2027-07-01');
      await dialog.getByLabel('响应截止时间', { exact: true }).fill('2026-12-25T18:00');
      await dialog.getByLabel('补充条款', { exact: true }).fill('请核对后独立作出决定。');
      await dialog.getByRole('button', { name: '签发文书', exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(student.getByRole('region', { name: '当前录用意向文书' }).getByText(location, { exact: true })).toBeVisible();
    };
    await issue('上海测试办公区');
    await expect(company.getByRole('button', { name: '创建就业协议', exact: true })).toHaveCount(0);
    await student.getByRole('button', { name: '接受录用意向', exact: true }).click();
    await student.getByRole('dialog', { name: '接受录用意向', exact: true }).getByRole('button', { name: '提交响应', exact: true }).click();
    await expect(company.getByRole('button', { name: '创建就业协议', exact: true })).toBeVisible();
    await company.getByRole('button', { name: '撤销录用意向', exact: true }).click();
    const withdrawal = company.getByRole('dialog', { name: '撤销录用意向', exact: true });
    await withdrawal.getByLabel('撤销原因', { exact: true }).fill('与学生沟通后更正工作地点，重新签发。');
    await withdrawal.getByRole('button', { name: '确认撤销', exact: true }).click();
    await expect(student.getByRole('region', { name: '当前录用意向文书' }).getByText('已撤销', { exact: true })).toBeVisible();
    await issue('杭州测试办公区');
    await student.reload();
    const current = student.getByRole('region', { name: '当前录用意向文书' });
    await expect(current.getByText('版本 2', { exact: true })).toBeVisible();
    await student.getByText('历史意向文书（1）', { exact: true }).click();
    await expect(student.getByText('上海测试办公区', { exact: true })).toBeVisible();
    await student.setViewportSize({ width: 375, height: 812 });
    expect(await student.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await student.evaluate(() => { window.print = () => { document.body.dataset.printedOffer = document.querySelector('.offer-print-sheet')?.textContent ?? ''; }; });
    await current.getByRole('button', { name: '打印文书', exact: true }).click();
    await expect(student.locator('body')).toHaveAttribute('data-printed-offer', /杭州测试办公区/);
    expect(await student.locator('body').getAttribute('data-printed-offer')).not.toContain('上海测试办公区');
    await student.getByRole('button', { name: '接受录用意向', exact: true }).click();
    await student.getByRole('dialog', { name: '接受录用意向', exact: true }).getByRole('button', { name: '提交响应', exact: true }).click();
    await expect(company.getByRole('button', { name: '创建就业协议', exact: true })).toBeVisible();
    await company.getByRole('button', { name: '创建就业协议', exact: true }).click();
    await company.getByRole('button', { name: '企业确认协议', exact: true }).click();
    await student.goto(`${base}/#/student/destination`);
    await student.getByRole('button', { name: '学生确认协议', exact: true }).click();
    await expect(company.getByText('双方已确认，协议已签署', { exact: true })).toBeVisible();
    await company.reload();
    await expect(company.getByRole('button', { name: '撤销录用意向', exact: true })).toHaveCount(0);
  } finally { await studentContext.close(); await companyContext.close(); await app.close(); await rm(dir, { recursive: true, force: true }); }
});
