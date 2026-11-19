import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createOnlineApp } from '../../server/app';

// Detects UI-triggered remounts, duplicate generation and lost unsaved answers.
// Only the provider boundary is replaced; authorization, routes, state and API are real.
test('UI theme, help, resize and scrolling preserve in-flight AI and answer drafts without extra calls', async ({ browser }) => {
  test.setTimeout(60000);
  const root = await mkdtemp(join(tmpdir(), 'cp-ui-ai-'));
  let calls = 0;
  let questions = 0;
  let evaluations = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolveGate => { release = resolveGate; });
  const app = await createOnlineApp({
    databasePath: join(root, 'db.sqlite'), seed: true, staticRoot: resolve('dist'),
    ai: { enabled: true, apiKey: 'isolated-ui-test-only', dailyGlobalCalls: 100, dailyUserCalls: 80,
      transport: async (_url, init) => {
        calls++;
        const wire = JSON.parse(String(init?.body));
        const task = wire.messages[0].content;
        let content: unknown;
        if (task.includes('INTERVIEW_QUESTION')) {
          questions++;
          if (questions === 1) await gate;
          content = { question: questions === 1 ? '请说明组件测试过程。' : '如何确认回归测试有效？' };
        } else if (task.includes('INTERVIEW_EVALUATE')) {
          evaluations++;
          content = { dimensions: [{ key: 'relevance', label: '相关性', score: 70, evidence: '我为组件编写测试', reason: '描述了测试行动' }], strengths: ['行动清晰'], improvements: ['补充验证结果'] };
        } else throw Error('unexpected upstream task');
        return Response.json({ id: 'ui-invariant-upstream', choices: [{ finish_reason: 'stop', message: {
          content: JSON.stringify(content),
        } }], usage: { prompt_tokens: 20, completion_tokens: 30 } });
      } },
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    await app.provision('student001', 'Isolated-UI-only!');
    await app.listen(0);
    const address = app.server.address();
    if (!address || typeof address === 'string') throw Error('missing test port');
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/#/login`);
    await page.getByLabel('账号', { exact: true }).fill('student001');
    await page.getByLabel('密码', { exact: true }).fill('Isolated-UI-only!');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByRole('link', { name: '简历工作台', exact: true })).toBeVisible();
    await page.goto(`http://127.0.0.1:${address.port}/#/student/mock`);
    await page.getByLabel('目标岗位', { exact: true }).fill('组件开发');
    await page.getByLabel('岗位要求与希望考察的能力', { exact: true }).fill('Vue组件与测试');
    expect(calls).toBe(0);
    await page.getByRole('button', { name: '开始文字面试', exact: true }).click();
    await expect.poll(() => calls).toBe(1);
    await page.getByRole('button', { name: '切换到深色主题', exact: true }).click();
    await page.getByRole('button', { name: '帮助与说明', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '帮助与说明', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    expect(calls).toBe(1);
    release!();
    await expect(page.getByRole('heading', { name: '请说明组件测试过程。', exact: true })).toBeVisible();
    const answer = page.getByLabel('面试回答与转写');
    const draft = '我为组件编写测试，保留了真实的草稿和验证记录。';
    await answer.fill(draft);
    await page.getByRole('button', { name: '切换到浅色主题', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: '帮助与说明', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(answer).toHaveValue(draft);
    expect(calls).toBe(1);
    await page.getByRole('button', { name: '确认并提交回答', exact: true }).click();
    await expect(page.getByRole('heading', { name: '如何确认回归测试有效？', exact: true })).toBeVisible();
    // Existing submission evaluates the answer and then requests the next question.
    expect({ calls, questions, evaluations }).toEqual({ calls: 3, questions: 2, evaluations: 1 });
    expect(errors).toEqual([]);
  } finally {
    release?.();
    await context.close();
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
