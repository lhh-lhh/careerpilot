import { test, expect, type Page } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createOnlineApp } from '../../server/app';

async function shot(page: Page, browser: string, name: string) {
  const path = join(tmpdir(), 'careerpilot-ui-final-20261117', browser, 'states');
  await mkdir(path, { recursive: true });
  await page.screenshot({ path: join(path, name + '.png'), fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function confirm(page: Page, accept: boolean, action: () => Promise<unknown>, expected: RegExp) {
  const dialog = page.waitForEvent('dialog');
  const operation = action();
  const prompt = await dialog;
  expect(prompt.type()).toBe('confirm'); expect(prompt.message()).toMatch(expected);
  await (accept ? prompt.accept() : prompt.dismiss()); await operation;
}

// Catches lost drafts, implicit saves or suppressed native confirmation branches.
test('UI final optimization native save, restore and leave confirmations preserve cancel and accept behavior', async ({ page }, info) => {
  await page.goto('/#/login'); await page.getByRole('button', { name: '以学生身份进入', exact: true }).click();
  await page.goto('/#/student/resume/optimize');
  const field = page.locator('.draft-field textarea').first();
  const original = await field.inputValue(); const draft = original + ' 隔离验收未保存的草稿。';
  await field.fill(draft);
  await confirm(page, false, () => page.getByRole('button', { name: '确认并保存到简历', exact: true }).click(), /保存为新的正式简历版本/);
  await expect(field).toHaveValue(draft);
  await confirm(page, false, () => page.getByRole('link', { name: '返回简历工作台', exact: true }).click(), /尚未保存/);
  await expect(page).toHaveURL(/optimize/); await expect(field).toHaveValue(draft);
  await confirm(page, true, () => page.getByRole('button', { name: '确认并保存到简历', exact: true }).click(), /保存为新的正式简历版本/);
  await expect(page.getByRole('status')).toContainText('已保存为新版本');
  await page.getByRole('button', { name: '查看保存版本', exact: true }).click();
  const restore = page.getByRole('button', { name: '载入草稿以恢复', exact: true }).last();
  await confirm(page, false, () => restore.click(), /历史版本载入草稿/); await expect(field).toHaveValue(draft);
  await confirm(page, true, () => restore.click(), /历史版本载入草稿/); await expect(field).toHaveValue(original);
  await page.setViewportSize({ width: 320, height: 480 }); await shot(page, info.project.name, 'W40-history-dirty-320');
  await confirm(page, true, () => page.getByRole('link', { name: '返回简历工作台', exact: true }).click(), /尚未保存/);
  await expect(page).toHaveURL(/student\/resume$/);
});

test('UI final online chat history and interview native confirmations preserve explicit user decisions and call counts', async ({ browser }, info) => {
  test.setTimeout(90000);
  const root = await mkdtemp(join(tmpdir(), 'cp-ui-final-native-')); let calls = 0;
  const app = await createOnlineApp({ databasePath: join(root, 'test.sqlite'), seed: true, staticRoot: resolve('dist'),
    ai: { enabled: true, apiKey: 'synthetic-ui-native-only', dailyGlobalCalls: 100, dailyUserCalls: 80, transport: async (_url, init) => {
      calls++; const wire = JSON.parse(String(init?.body));
      if (wire.stream) return new Response('data: {"choices":[{"delta":{"content":"隔离验收保留的聊天回复。"}}]}\n\ndata: {"choices":[{"finish_reason":"stop","delta":{}}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
      const task = wire.messages[0].content;
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(task.includes('RESUME_OPTIMIZE') ? { summary: '仅隔离验收，不新增事实。', patches: [] } : { question: '请描述组件验证方法。' }) } }] });
    } } });
  const context = await browser.newContext();
  try {
    await app.provision('student001', 'UI-state-isolated-only!'); await app.listen(0);
    const address = app.server.address(); if (!address || typeof address === 'string') throw Error('port');
    const origin = `http://127.0.0.1:${address.port}`, page = await context.newPage();
    await page.goto(origin + '/#/login'); await page.getByLabel('账号', { exact: true }).fill('student001'); await page.getByLabel('密码', { exact: true }).fill('UI-state-isolated-only!'); await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('button', { name: 'AI Chatbot · 长按拖动', exact: true }).click();
    const assistant = page.getByRole('dialog', { name: '全局AI助手' });
    await assistant.getByLabel('向AI助手提问').fill('全站验收历史会话'); await assistant.getByRole('button', { name: '发送', exact: true }).click();
    await expect(assistant.getByText('隔离验收保留的聊天回复。', { exact: true })).toBeVisible(); expect(calls).toBe(1);
    await assistant.getByText('历史会话（1）', { exact: true }).click();
    await confirm(page, false, () => assistant.getByRole('button', { name: '删除历史会话', exact: true }).click(), /删除此会话/);
    await expect(assistant.getByRole('button', { name: '删除历史会话', exact: true })).toHaveCount(1);
    await page.setViewportSize({ width: 390, height: 844 }); await shot(page, info.project.name, 'W39-chat-history-390');
    await confirm(page, true, () => assistant.getByRole('button', { name: '删除历史会话', exact: true }).click(), /删除此会话/);
    await expect(assistant.getByRole('button', { name: '删除历史会话', exact: true })).toHaveCount(0); expect(calls).toBe(1);
    await assistant.getByRole('button', { name: '收起AI助手', exact: true }).click();
    await page.goto(origin + '/#/student/resume/optimize'); const field = page.locator('.draft-field textarea').first(); const draft = (await field.inputValue()) + ' 未保存草稿。'; await field.fill(draft);
    await confirm(page, false, () => page.getByRole('button', { name: '生成AI优化方案', exact: true }).click(), /重新生成将丢弃/); expect(calls).toBe(1); await expect(field).toHaveValue(draft);
    await confirm(page, true, () => page.getByRole('button', { name: '生成AI优化方案', exact: true }).click(), /重新生成将丢弃/);
    await expect(page.getByText('仅隔离验收，不新增事实。', { exact: true })).toBeVisible(); expect(calls).toBe(2);
    await page.goto(origin + '/#/student/mock/text'); await page.getByLabel('目标岗位', { exact: true }).fill('全站原生确认验收'); await page.getByLabel('岗位要求与希望考察的能力', { exact: true }).fill('组件与回归验证'); await page.getByRole('button', { name: '开始文字面试', exact: true }).click();
    await expect(page.getByRole('heading', { name: '请描述组件验证方法。', exact: true })).toBeVisible(); expect(calls).toBe(3);
    await page.getByLabel('面试回答与转写').fill('隔离验收未提交回答，取消不能丢失。');
    await confirm(page, false, () => page.getByRole('link', { name: '题库快速练习', exact: true }).click(), /当前正在面试/);
    await expect(page.getByLabel('面试回答与转写')).toHaveValue('隔离验收未提交回答，取消不能丢失。');
    await confirm(page, false, () => page.getByRole('button', { name: '结束并查看AI反馈', exact: true }).click(), /结束本场练习/); expect(calls).toBe(3);
    await shot(page, info.project.name, 'W41-active-cancel-390');
    await confirm(page, true, () => page.getByRole('button', { name: '结束并查看AI反馈', exact: true }).click(), /结束本场练习/);
    await expect(page).toHaveURL(/mock\/feedback/);
    await page.goto(origin + '/#/student/mock/text');
    const remove = page.locator('.history-row').filter({ hasText: '全站原生确认验收' }).getByRole('button', { name: '删除', exact: true });
    await confirm(page, false, () => remove.click(), /永久删除此练习/); await expect(remove).toBeVisible();
    await confirm(page, true, () => remove.click(), /永久删除此练习/); await expect(remove).toHaveCount(0); expect(calls).toBe(3);
  } finally { await context.close(); await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('UI final practice pending-leave native confirmation cancels navigation without duplicate generation', async ({ browser }, info) => {
  test.setTimeout(60000);
  const root = await mkdtemp(join(tmpdir(), 'cp-ui-final-practice-')); let calls = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolveGate => { release = resolveGate; });
  const app = await createOnlineApp({ databasePath: join(root, 'test.sqlite'), seed: true, staticRoot: resolve('dist'),
    ai: { enabled: true, apiKey: 'synthetic-ui-practice-only', dailyGlobalCalls: 10, dailyUserCalls: 5, transport: async () => {
      calls++; await gate;
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ question: '隔离练习开场问题。' }) } }] });
    } } });
  const context = await browser.newContext();
  try {
    await app.provision('student001', 'UI-state-isolated-only!'); await app.listen(0);
    const address = app.server.address(); if (!address || typeof address === 'string') throw Error('port');
    const origin = `http://127.0.0.1:${address.port}`, page = await context.newPage();
    await page.goto(origin + '/#/login'); await page.getByLabel('账号', { exact: true }).fill('student001'); await page.getByLabel('密码', { exact: true }).fill('UI-state-isolated-only!'); await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.goto(origin + '/#/student/mock/practice');
    await page.getByRole('button', { name: '换一组', exact: true }).click(); expect(calls).toBe(0);
    await page.getByRole('button', { name: '文字练习', exact: true }).first().click(); await expect.poll(() => calls).toBe(1);
    await confirm(page, false, () => page.getByRole('link', { name: '生涯概览', exact: true }).click(), /正在准备练习/);
    await expect(page).toHaveURL(/practice/); await expect(page.getByRole('button', { name: '换一组', exact: true })).toBeDisabled();
    await page.setViewportSize({ width: 390, height: 844 }); await shot(page, info.project.name, 'W42-pending-390'); expect(calls).toBe(1);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await confirm(page, true, () => page.getByRole('link', { name: '生涯概览', exact: true }).click(), /正在准备练习/);
    await expect(page).toHaveURL(/#\/student$/); expect(calls).toBe(1);
  } finally { release?.(); await context.close(); await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('UI final account pending, rejection, password-error and invalid-invitation states remain usable in both themes', async ({ browser }, info) => {
  test.setTimeout(60000);
  const root = await mkdtemp(join(tmpdir(), 'cp-ui-final-account-'));
  const app = await createOnlineApp({ databasePath: join(root, 'test.sqlite'), seed: true, staticRoot: resolve('dist') });
  const contexts = [await browser.newContext(), await browser.newContext()];
  try {
    await app.provision('admin', 'UI-state-isolated-only!'); await app.listen(0);
    const address = app.server.address(); if (!address || typeof address === 'string') throw Error('port');
    const origin = `http://127.0.0.1:${address.port}`, student = await contexts[0]!.newPage(), admin = await contexts[1]!.newPage();
    await student.goto(origin + '/#/register');
    await student.getByLabel('账号', { exact: true }).fill('ui.final.pending'); await student.getByLabel('姓名', { exact: true }).fill('全站验收'); await student.getByLabel('密码', { exact: true }).fill('UI-state-isolated-only!'); await student.getByLabel('学号', { exact: true }).fill('ui-final-2027'); await student.getByLabel('专业', { exact: true }).selectOption('major-1'); await student.getByLabel('毕业年份', { exact: true }).fill('2027'); await student.getByRole('button', { name: '提交注册', exact: true }).click();
    await expect(student.getByRole('heading', { name: '等待账号审核', exact: true })).toBeVisible();
    for (const theme of ['light', 'dark']) { await student.evaluate(value => { document.documentElement.dataset.theme = value; }, theme); await student.setViewportSize({ width: 320, height: 480 }); await shot(student, info.project.name, `P10-pending-${theme}-320`); }
    await admin.goto(origin + '/#/login'); await admin.getByLabel('账号', { exact: true }).fill('admin'); await admin.getByLabel('密码', { exact: true }).fill('UI-state-isolated-only!'); await admin.getByRole('button', { name: '登录', exact: true }).click();
    await admin.goto(origin + '/#/admin/accounts'); const card = admin.getByRole('article').filter({ hasText: 'ui.final.pending' });
    await card.getByLabel('审核说明', { exact: true }).fill('隔离验收身份资料需进一步核实。'); await card.getByRole('button', { name: '拒绝', exact: true }).click();
    await student.getByRole('button', { name: '刷新审核状态', exact: true }).click(); await expect(student.getByRole('heading', { name: '账号审核未通过', exact: true })).toBeVisible();
    await student.getByText('修改密码', { exact: true }).click(); await student.getByLabel('当前密码', { exact: true }).fill('synthetic-wrong-password'); await student.getByLabel('新密码', { exact: true }).fill('synthetic-new-password!'); await student.getByRole('button', { name: '更新密码', exact: true }).click(); await expect(student.getByRole('alert')).toBeVisible();
    for (const theme of ['light', 'dark']) { await student.evaluate(value => { document.documentElement.dataset.theme = value; }, theme); await shot(student, info.project.name, `P10-rejected-password-error-${theme}-320`); }
    await student.getByRole('button', { name: '退出登录', exact: true }).click();
    await expect(student).toHaveURL(/login/);
    await student.goto(origin + '/#/register?invite=synthetic-invalid&role=counselor&login=ui.invalid');
    await student.getByLabel('姓名', { exact: true }).fill('邀请验收'); await student.getByLabel('密码', { exact: true }).fill('UI-state-isolated-only!'); await student.getByRole('button', { name: '提交注册', exact: true }).click();
    await expect(student.getByRole('alert')).toContainText('邀请已失效'); await shot(student, info.project.name, 'P09-invitation-error-320');
  } finally { for (const context of contexts) await context.close(); await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('UI final slow and failed opportunity detail keeps loading, error and safe navigation visible', async ({ browser }, info) => {
  test.setTimeout(30000);
  const root = await mkdtemp(join(tmpdir(), 'cp-ui-final-network-'));
  const app = await createOnlineApp({ databasePath: join(root, 'test.sqlite'), seed: true, staticRoot: resolve('dist') });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let release: (() => void) | undefined; const gate = new Promise<void>(resolveGate => { release = resolveGate; });
  try {
    await app.listen(0); const address = app.server.address(); if (!address || typeof address === 'string') throw Error('port');
    const page = await context.newPage(), origin = `http://127.0.0.1:${address.port}`;
    await page.route('**/api/public/opportunities/local%3Ajob-001', async route => { await gate; await route.continue(); });
    await page.goto(origin + '/#/opportunities/local:job-001');
    await expect(page.getByRole('status')).toContainText('正在读取岗位'); await shot(page, info.project.name, 'P04-loading-390');
    release!(); await expect(page.locator('.detail-title')).toBeVisible();
    await page.route('**/api/public/opportunities/synthetic-missing', route => route.abort('failed'));
    await page.goto(origin + '/#/opportunities/synthetic-missing'); await page.reload(); await expect(page.getByRole('alert')).toContainText('岗位未找到或暂时无法读取。');
    await shot(page, info.project.name, 'P04-network-error-390'); await page.getByRole('link', { name: '返回岗位列表', exact: true }).click(); await expect(page).toHaveURL(/opportunities$/);
  } finally { release?.(); await context.close(); await app.close(); await rm(root, { recursive: true, force: true }); }
});
