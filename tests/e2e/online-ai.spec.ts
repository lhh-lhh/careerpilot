import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createOnlineApp } from '../../server/app';

test('online AI generates on click with masked input and preserves question and follow-up behavior', async ({ browser }) => {
  test.setTimeout(60000);
  const root = await mkdtemp(join(tmpdir(), 'careerpilot-ai-ui-'));
  let calls = 0;
  const app = await createOnlineApp({ databasePath: join(root, 'db.sqlite'), seed: true, staticRoot: resolve('dist'), ai: {
    enabled: true, apiKey: 'isolated-not-real', dailyGlobalCalls: 10, dailyUserCalls: 10,
    transport: async (_url, init) => { calls++; const wire = JSON.parse(String(init?.body)), input = JSON.parse(wire.messages[1].content),task=wire.messages[0].content;
      const payload=task.includes('INTERVIEW_QUESTION')?{question:input.history.length?'请说明你本人如何核对交互问题。':'请结合原题描述项目任务与行动。'}:task.includes('INTERVIEW_EVALUATE')?{dimensions:[{key:'relevance',label:'相关性',score:70,evidence:input.answer.slice(0,6),reason:'提供具体行动'}],strengths:['行动清晰'],improvements:['补充验证结果']}:{module:'A1',operation:'rewrite',suggestions:[],summary:'隔离上游测试结果，仅用于验证确认流程。'};
      return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(payload)}}]}); },
  } });
  const context = await browser.newContext();
  try {
    await app.provision('student001', 'Isolated-ui-password!'); await app.listen(0);
    const address = app.server.address(); if (!address || typeof address === 'string') throw Error('no address');
    const page = await context.newPage(); await page.goto(`http://127.0.0.1:${address.port}/#/login`);
    await page.getByRole('textbox', { name: '账号', exact: true }).fill('student001'); await page.getByLabel('密码', { exact: true }).fill('Isolated-ui-password!');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('link', { name: '简历工作台', exact: true }).click();
    await page.getByRole('button', { name: '生成表达建议', exact: true }).click();
    await expect(page.getByText('隔离上游测试结果，仅用于验证确认流程。', { exact: true })).toBeVisible(); expect(calls).toBe(1);
    await expect(page.getByText('LIVE · 模型生成', { exact: true })).toBeVisible();
    const receipt=page.getByLabel('表达建议子页').locator('.ai-provenance');
    await expect(receipt).toContainText('DeepSeek');
    await receipt.locator('summary').click();
    await expect(receipt).toContainText('deepseek-flash');
    await expect(receipt).toContainText('本地请求标识');
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    await page.goto(`http://127.0.0.1:${address.port}/#/student/mock`);
    await page.getByLabel('目标岗位',{exact:true}).fill('前端开发');
    await page.getByLabel('岗位要求与希望考察的能力',{exact:true}).fill('Vue页面和交互核对');
    await page.getByRole('button', { name: '开始文字面试', exact: true }).click();
    await expect(page.getByRole('heading',{name:'请结合原题描述项目任务与行动。',exact:true})).toBeVisible();
    await page.getByLabel('面试回答与转写').fill('我负责页面开发，完成交互核对。');
    await page.getByRole('button', { name: '确认并提交回答', exact: true }).click();
    await expect(page.getByRole('heading',{name:'请说明你本人如何核对交互问题。',exact:true})).toBeVisible();
    await page.getByLabel('面试回答与转写').fill('我本人核对了表单状态与错误提示，并记录可复现步骤。');
    await page.getByRole('button', { name: '确认并提交回答', exact: true }).click();
    await expect(page.getByLabel('面试回答与转写')).toHaveValue('');
    await page.reload();
    const sessions=(await (await context.request.get(`http://127.0.0.1:${address.port}/api/workbench/sessions`)).json()).sessions;
    expect(sessions[0].turns[1].answer).toBe('我本人核对了表单状态与错误提示，并记录可复现步骤。');
    expect(sessions[0].turns[1].evaluation.total).toBe(70);
    expect(calls).toBe(6);
  } finally { await context.close(); await app.close(); await rm(root, { recursive: true, force: true }); }
});
