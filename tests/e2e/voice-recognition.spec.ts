import { test, expect, type Browser } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createOnlineApp } from '../../server/app';

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

async function fifthRound(browser: Browser) {
  const root = await mkdtemp(join(tmpdir(), 'cp-voice-recognition-'));
  let result: 'success' | 'failure' | 'empty' | 'invalid' | 'pending' = 'success';
  let asrCalls = 0;
  let release: (() => void) | undefined;
  const app = await createOnlineApp({
    databasePath: join(root, 'test.sqlite'), seed: true, staticRoot: resolve('dist'),
    ai: { enabled: true, apiKey: 'isolated-voice-test', dailyGlobalCalls: 60, dailyUserCalls: 50,
      transport: async (url, init) => {
        if (String(url).endsWith('/asr')) {
          asrCalls++;
          if (result === 'pending') await new Promise<void>((resolve, reject) => {
            release = resolve;
            init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
          });
          if (result === 'failure') return new Response('{}', { status: 503 });
          return Response.json({ text: result === 'empty' ? '  ' : '我通过超时状态和请求标识避免并发冲突。', duration_ms: 1000 });
        }
        const wire = JSON.parse(String(init?.body));
        const input = JSON.parse(wire.messages[1].content);
        const data = wire.messages[0].content.includes('INTERVIEW_QUESTION')
          ? { question: `第${input.history.length + 1}轮：如何处理并发请求？` }
          : { dimensions: [{ key: 'relevance', label: '相关性', score: 70, evidence: input.answer.slice(0, 4), reason: '说明了解决方法' }], strengths: [], improvements: [] };
        return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }] });
      },
    },
  });
  const context = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1365, height: 900 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await app.provision('student001', 'Isolated-voice-test-password!');
  await app.listen(0);
  const address = app.server.address();
  if (!address || typeof address === 'string') throw Error('port');
  const origin = `http://127.0.0.1:${address.port}`;
  // Make the browser deadline advance with Playwright's clock, not real waiting.
  await page.addInitScript(() => {
    AbortSignal.timeout = ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms);
      return controller.signal;
    };
  });
  await page.clock.install();
  await page.goto(origin + '/#/login');
  await page.getByLabel('账号', { exact: true }).fill('student001');
  await page.getByLabel('密码', { exact: true }).fill('Isolated-voice-test-password!');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/#\/student$/);
  const { csrf } = await (await context.request.get(origin + '/api/session')).json();
  const post = async (path: string, data: unknown) => {
    const response = await context.request.post(origin + '/api/workbench' + path, { headers: { 'X-CSRF-Token': csrf }, data });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  let { session } = await post('/sessions', { target: { title: '后端开发工程师', requirements: '并发请求与状态管理' }, consent: true });
  for (let round = 0; round < 4; round++) {
    ({ session } = await post('/sessions/' + session.id, { expectedRevision: session.revision, action: 'answer', text: '我负责请求的状态管理和测试。', consent: true }));
  }
  await page.goto(origin + '/#/student/mock/voice?id=' + session.id);
  await expect(page.getByText('第5轮 / 最多6轮', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: '语音主模式：自动播放问题并开始收音', exact: true }).uncheck();
  return {
    page, errors, root,
    setResult: (value: typeof result) => { result = value; },
    calls: () => asrCalls,
    record: async () => {
      await page.getByRole('button', { name: '开始语音回答', exact: true }).click();
      const finish = page.getByRole('button', { name: '我已回答完毕', exact: true });
      await expect(finish).toBeVisible();
      await expect(page.getByText(/录音 [1-9]\d* \/ 120秒/)).toBeVisible();
      await finish.click();
    },
    close: async () => {
      release?.();
      await context.close();
      await app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

for (const result of ['failure', 'empty', 'invalid', 'pending'] as const) {
  test(`fifth-round ASR ${result} exits recognition and allows retry without losing the interview`, async ({ browser }) => {
    test.setTimeout(60000);
    const f = await fifthRound(browser);
    try {
      await f.page.getByLabel('面试回答与转写').fill('已输入的回答草稿');
      f.setResult(result);
      if (result === 'invalid') await f.page.route('**/api/workbench/speech/asr', route => route.fulfill({ json: { text: null } }));
      await f.record();
      if (result === 'pending') {
        await expect(f.page.getByText('正在识别你的回答', { exact: true })).toBeVisible();
        await f.page.clock.fastForward(120_001);
      }
      await expect(f.page.getByText('正在识别你的回答', { exact: true })).toHaveCount(0);
      await expect(f.page.locator('.business-notice')).toContainText(result === 'empty' ? '没有识别到' : result === 'pending' ? '超时' : '转写失败');
      await expect(f.page.getByLabel('面试回答与转写')).toBeEnabled();
      await expect(f.page.getByLabel('面试回答与转写')).toHaveValue('已输入的回答草稿');
      await expect(f.page.getByRole('button', { name: '开始语音回答', exact: true })).toBeEnabled();
      await expect(f.page.getByText('第5轮 / 最多6轮', { exact: true })).toBeVisible();
      if (result === 'failure') await f.page.screenshot({ path: join(tmpdir(), 'cp-voice-recognition-recovered.png') });
      await f.page.clock.fastForward(3000);
      expect(f.calls()).toBe(result === 'invalid' ? 0 : 1);
      if (result === 'invalid') await f.page.unroute('**/api/workbench/speech/asr');
      f.setResult('success');
      await f.record();
      await expect(f.page.getByLabel('面试回答与转写')).toHaveValue('我通过超时状态和请求标识避免并发冲突。');
      await f.page.clock.fastForward(2001);
      await expect(f.page.getByText('第6轮 / 最多6轮', { exact: true })).toBeVisible();
      await f.record();
      await expect(f.page.getByLabel('面试回答与转写')).toHaveValue('我通过超时状态和请求标识避免并发冲突。');
      await f.page.clock.fastForward(2001);
      await expect(f.page).toHaveURL(/voice\/report/);
      expect(f.errors).toEqual([]);
    } finally { await f.close(); }
  });
}
