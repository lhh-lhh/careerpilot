import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOnlineApp } from '../../server/app';
import type { OnlineAiOptions } from '../../server/ai';
import { DatabaseSync } from 'node:sqlite';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const clean of cleanups.splice(0).reverse()) await clean(); });
async function fixture(ai?: OnlineAiOptions) {
  const root = await mkdtemp(join(tmpdir(), 'careerpilot-ai-'));
  const options = { databasePath: join(root, 'db.sqlite'), seed: true, ai };
  let app = await createOnlineApp(options);
  cleanups.push(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  for (const login of ['student001', 'student002', 'company1', 'admin', 'counselor1']) await app.provision(login, 'Isolated-AI-test-password!');
  await app.listen(0);
  function base() { const a = app.server.address(); if (!a || typeof a === 'string') throw Error('no address'); return `http://127.0.0.1:${a.port}`; }
  async function login(name = 'student001') {
    const response = await fetch(base() + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: name, password: 'Isolated-AI-test-password!' }) });
    expect(response.status).toBe(200);
    const session = await response.json(), cookie = response.headers.get('set-cookie')!.split(';')[0]!;
    return {
      get: (path: string) => fetch(base() + path, { headers: { Cookie: cookie } }),
      post: (path: string, data: unknown) => fetch(base() + path, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf }, body: JSON.stringify(data) }),
    };
  }
  return { login, databasePath: options.databasePath, get app() { return app; }, reopen: async () => { await app.close(); app = await createOnlineApp({ ...options, seed: false }); await app.listen(0); } };
}
const selection = { module: 'A1', operation: 'rewrite', resource: { strategy: 'concise', keepMyTone: true } };
function isolatedConfig(extra: Partial<OnlineAiOptions> = {}): OnlineAiOptions {
  return { enabled: true, apiKey: 'test-only-not-a-real-key', dailyGlobalCalls: 10, dailyUserCalls: 3,
    transport: async (_url, init) => {
      const wire = JSON.parse(String(init?.body));
      expect(wire.model).toBe('deepseek-flash');
      expect(wire.max_tokens).toBe(1200);
      expect(wire.stream).toBe(false);
      expect(String(init?.body)).not.toMatch(/DEMO2026|@example|林知夏/);
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ module: 'A1', operation: 'rewrite', suggestions: [], summary: '请根据原有经历核实表述。' }) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }), { status: 200 });
    }, ...extra };
}
it('online AI is disabled by default and never treats client telemetry as a model success', async () => {
  const f = await fixture(), student = await f.login();
  expect(await (await student.get('/api/ai/status')).json()).toMatchObject({ enabled: false, provider: 'deepseek',mode:'UNAVAILABLE' });
  expect((await student.post('/api/ai/prepare', selection)).status).toBe(503);
  expect(await (await student.post('/api/ai-runs', { effectiveMode: 'LIVE', status: 'success' })).json()).toEqual({ recorded: false });
});
it('supplies exact server-derived evidence spans so the model need not count UTF16 offsets',async()=>{
 const f=await fixture(isolatedConfig({transport:async(_url,init)=>{const wire=JSON.parse(String(init?.body)),input=JSON.parse(wire.messages[1].content),field=input.fields[0],e=field.sourceEvidence;
  if(!e)return Response.json({choices:[{finish_reason:'stop',message:{content:'{}'}}]});
  expect(e).toEqual({fieldPath:field.fieldPath,start:0,end:field.text.length,quote:field.text});
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({module:'A1',operation:'rewrite',summary:'基于原文整理',suggestions:[{id:'s1',resumeVersionId:input.resumeVersionId,fieldPath:field.fieldPath,before:field.text,after:field.text,reason:'保留事实',evidence:[e],requiresUserInput:false,disposition:'pending'}]})}}]});
 }})),student=await f.login(),prepared=await (await student.post('/api/ai/prepare',selection)).json();
 expect((await student.post('/api/ai/confirm',{ticket:prepared.ticket,consent:true})).status).toBe(200);
});
it('server prepares masked authoritative input, binds consent to one session and never repeats a consumed ticket', async () => {
  const f = await fixture(isolatedConfig()), student = await f.login(), secondSession = await f.login();
  expect((await student.post('/api/ai/prepare', { ...selection, variables: { fake: 'untrusted' } })).status).toBe(422);
  expect((await (await f.login('company1')).post('/api/ai/prepare', selection)).status).toBe(403);
  const preparedResponse = await student.post('/api/ai/prepare', selection); expect(preparedResponse.status).toBe(200);
  const prepared = await preparedResponse.json();
  expect(JSON.stringify(prepared)).not.toMatch(/林知夏|@example|test-only-not/);
  expect((await secondSession.post('/api/ai/confirm', { ticket: prepared.ticket, consent: true })).status).toBe(403);
  expect((await student.post('/api/ai/confirm', { ticket: prepared.ticket, consent: false })).status).toBe(422);
  const result = await student.post('/api/ai/confirm', { ticket: prepared.ticket, consent: true }); expect(result.status).toBe(200);
  const output=await result.json();
  expect(output).toMatchObject({ effectiveMode: 'LIVE', origin: 'MODEL', domainRevision: prepared.request.domainRevision, usage: { prompt: 100, completion: 20 },provenance:{traceId:output.traceId,provider:'deepseek',model:'deepseek-flash',createdAt:expect.any(String)} });
  const {validateResponse}=await import('../../src/domain/ai-guard/schema');expect(validateResponse(output)).toBe(true);
  expect((await student.post('/api/ai/confirm', { ticket: prepared.ticket, consent: true })).status).toBe(409);
  const sql = new DatabaseSync(f.databasePath);
  try {
    const runs = sql.prepare("SELECT data FROM aiRuns WHERE json_extract(data,'$.requestedMode')='LIVE'").all();
    expect(runs).toHaveLength(1);
    expect(String(runs[0]!.data)).not.toMatch(/请根据原有经历|test-only-not/);
    expect(JSON.parse(String(runs[0]!.data)).createdAt).toBe(output.provenance.createdAt);
  } finally { sql.close(); }
});
it('a changed resume invalidates consent before any upstream call', async () => {
  const f = await fixture(isolatedConfig({ transport: async () => { throw Error('must never call stale input'); } })), student = await f.login();
  const prepared = await (await student.post('/api/ai/prepare', selection)).json();
  const snapshot = await (await student.get('/api/read/readScopedSnapshot')).json(), resume = snapshot.resumes[0];
  resume.sections.projects[0].description += '（已更新）';
  expect((await student.post('/api/commands', { type: 'SAVE_RESUME', entityId: resume.id, commandId: crypto.randomUUID(), expectedRevision: resume.revision, payload: { sections: resume.sections } })).status).toBe(200);
  expect((await student.post('/api/ai/confirm', { ticket: prepared.ticket, consent: true })).status).toBe(409);
});
it('failed upstream attempts consume persistent quotas and cannot reset them by restarting the server', async () => {
  const f = await fixture(isolatedConfig({ dailyUserCalls: 1, transport: async () => new Response('private upstream diagnostic', { status: 429 }) })), student = await f.login();
  const prepared = await (await student.post('/api/ai/prepare', selection)).json();
  const failed = await student.post('/api/ai/confirm', { ticket: prepared.ticket, consent: true });
  expect(failed.status).toBe(429); expect(await failed.json()).toEqual({ error: 'RATE_LIMITED' });
  await f.reopen(); const fresh = await f.login();
  const next = await (await fresh.post('/api/ai/prepare', selection)).json();
  const blocked = await fresh.post('/api/ai/confirm', { ticket: next.ticket, consent: true });
  expect(blocked.status).toBe(429); expect(await blocked.json()).toEqual({ error: 'BUDGET_EXCEEDED' });
});
it('student and counselor modules rebuild their authorized resources instead of accepting client metrics or identities', async () => {
  const f = await fixture(isolatedConfig()), student = await f.login(), counselor = await f.login('counselor1');
  const matching = await student.post('/api/ai/prepare', { module: 'A3', operation: 'explain', resource: { jobId: 'job-001' } });
  expect(matching.status).toBe(200);
  const matched = await matching.json();
  expect(matched.request.variables.match.total).toBeGreaterThanOrEqual(0);
  expect(matched.request.variables.job.jobId).toBe('job-current');
  expect((await student.post('/api/ai/prepare', { module: 'A3', operation: 'explain', resource: { jobId: 'job-001', score: 100 } })).status).toBe(422);
  expect((await student.post('/api/ai/prepare', { module: 'A7', operation: 'query', resource: { queryText: '去向落实率' } })).status).toBe(403);
  const query = await counselor.post('/api/ai/prepare', { module: 'A7', operation: 'query', resource: { queryText: '去向落实率' } });
  expect(query.status).toBe(200);
  const scoped = await query.json();
  expect(scoped.request.variables).toMatchObject({ intent: 'destinationRate', targetStudents: [] });
  expect(scoped.request.variables.metricContext[0].value).toBeGreaterThanOrEqual(0);
  expect(scoped.request.variables.metricContext[0].value).toBeLessThanOrEqual(1);
  expect((await counselor.post('/api/ai/prepare', { module: 'A7', operation: 'advice', resource: { queryText: '如何帮扶', studentId: 'student-040' } })).status).toBe(403);
  const created = await student.post('/api/commands', { type: 'CREATE_MOCK', entityId: 'ai-mock', commandId: crypto.randomUUID(), expectedRevision: 0, payload: { targetJobId: 'job-001' } });
  expect(created.status).toBe(200);
  const state = await (await student.get('/api/read/readScopedSnapshot')).json();
  const session = state.mockSessions.find((s: { id: string }) => s.id === 'ai-mock');
  expect((await student.post('/api/ai/prepare', { module: 'A2', operation: 'question', resource: { sessionId: session.id, questionId: session.questionIds[0] } })).status).toBe(422);
  expect((await student.post('/api/commands', { type: 'MOCK_ACTION', entityId: session.id, expectedRevision: 1, commandId: crypto.randomUUID(), payload: { action: 'START' } })).status).toBe(200);
  expect((await student.post('/api/ai/prepare', { module: 'A2', operation: 'question', resource: { sessionId: session.id, questionId: session.questionIds[0] } })).status).toBe(200);
  expect((await student.post('/api/ai/prepare', { module: 'A2', operation: 'question', resource: { sessionId: session.id, questionId: session.questionIds[1] } })).status).toBe(422);
  const outsider = await f.login('student002');
  expect((await outsider.post('/api/ai/prepare', { module: 'A2', operation: 'question', resource: { sessionId: session.id, questionId: session.questionIds[0] } })).status).toBe(403);
});
it('interview follow-up only reads the immediately preceding submitted answer, never a future or skipped question', async () => {
  const f = await fixture(isolatedConfig()), student = await f.login();
  const command = (revision: number, action: string, extra = {}) => student.post('/api/commands', { type: 'MOCK_ACTION', entityId: 'follow-session', expectedRevision: revision, commandId: crypto.randomUUID(), payload: { action, ...extra } });
  await student.post('/api/commands', { type: 'CREATE_MOCK', entityId: 'follow-session', expectedRevision: 0, commandId: crypto.randomUUID(), payload: { targetJobId: 'job-001' } });
  await command(1,'START');
  const snapshot = await (await student.get('/api/read/readScopedSnapshot')).json(), session = snapshot.mockSessions.find((s: {id:string}) => s.id === 'follow-session');
  const prepare = (questionId: string) => student.post('/api/ai/prepare', { module: 'A2', operation: 'followUp', resource: { sessionId: session.id, questionId } });
  expect((await prepare(session.questionIds[0])).status).toBe(422);
  await command(2, 'SUBMIT_ANSWER', { text: '我负责界面开发，完成页面核对。' });
  expect((await prepare(session.questionIds[1])).status).toBe(422);
  expect((await prepare(session.questionIds[0])).status).toBe(200);
  await command(3, 'FOLLOW_UP', { text: '我负责核对表单交互。' }); await command(4, 'FOLLOW_UP', { text: '完成复查并记录问题。' });
  expect((await prepare(session.questionIds[0])).status).toBe(422);
  await command(5,'SKIP');
  expect((await prepare(session.questionIds[1])).status).toBe(422);
  await command(6, 'END_EARLY');
  expect((await student.post('/api/ai/prepare', { module: 'A2', operation: 'feedback', resource: { sessionId: session.id, questionId: session.questionIds[0] } })).status).toBe(200);
  expect((await student.post('/api/ai/prepare', { module: 'A2', operation: 'feedback', resource: { sessionId: session.id, questionId: session.questionIds[1] } })).status).toBe(422);
});
it('invalid model output is rejected without becoming successful telemetry or leaking upstream content', async () => {
  const f = await fixture(isolatedConfig({ transport: async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ module: 'A1', operation: 'rewrite', suggestions: [], summary: '<script>private-upstream-marker</script>' }) } }] })) })), student = await f.login();
  const prepared = await (await student.post('/api/ai/prepare', selection)).json();
  const response = await student.post('/api/ai/confirm', { ticket: prepared.ticket, consent: true });
  expect(response.status).toBe(502); expect(await response.json()).toEqual({ error: 'SEMANTIC_INVALID' });
  const sql = new DatabaseSync(f.databasePath);
  try { const rows = sql.prepare('SELECT data FROM aiRuns').all(); expect(rows).toHaveLength(1); expect(JSON.parse(String(rows[0]!.data)).status).toBe('failed'); expect(JSON.stringify(rows)).not.toContain('private-upstream-marker'); } finally { sql.close(); }
});
it('waiting on upstream does not hold the business transaction and disabled accounts cannot receive its result', async () => {
  let sent!: () => void, finish!: () => void;
  const started = new Promise<void>(r => { sent = r; }), release = new Promise<void>(r => { finish = r; });
  const f = await fixture(isolatedConfig({ transport: async () => { sent(); await release; return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ module: 'A1', operation: 'rewrite', suggestions: [], summary: '核实后再采用。' }) } }] })); } }));
  const student = await f.login(), admin = await f.login('admin');
  const prepared = await (await student.post('/api/ai/prepare', selection)).json();
  const pending = student.post('/api/ai/confirm', { ticket: prepared.ticket, consent: true });
  await started;
  try {
    expect((await admin.post('/api/admin/users', { userId: 'user-student-001', active: false })).status).toBe(200);
  } finally { finish(); }
  expect((await pending).status).toBe(401);
});

it('parallel confirmations for one account are rejected without consuming the second consent ticket', async () => {
  let sent!: () => void, finish!: () => void, calls = 0;
  const started = new Promise<void>(r => { sent = r; }), release = new Promise<void>(r => { finish = r; });
  const original = isolatedConfig().transport!;
  const f = await fixture(isolatedConfig({ transport: async (url, init) => { calls++; sent(); await release; return original(url, init); } }));
  const student = await f.login(), first = await (await student.post('/api/ai/prepare', selection)).json(), second = await (await student.post('/api/ai/prepare', selection)).json();
  const pending = student.post('/api/ai/confirm', { ticket: first.ticket, consent: true }); await started;
  try { expect((await student.post('/api/ai/confirm', { ticket: second.ticket, consent: true })).status).toBe(429); expect(calls).toBe(1); }
  finally { finish(); }
  expect((await pending).status).toBe(200);
  expect((await student.post('/api/ai/confirm', { ticket: second.ticket, consent: true })).status).toBe(200);
  expect(calls).toBe(2);
});
it('expired consent never starts a paid attempt and oversized upstream responses fail closed', async () => {
  let calls = 0;
  const f = await fixture(isolatedConfig({ transport: async () => { calls++; return new Response('x'.repeat(256 * 1024 + 1)); } })), student = await f.login();
  const ticket = await (await student.post('/api/ai/prepare', selection)).json();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 121000);
  try { expect((await student.post('/api/ai/confirm', { ticket: ticket.ticket, consent: true })).status).toBe(409); expect(calls).toBe(0); }
  finally { clock.mockRestore(); }
  const next = await (await student.post('/api/ai/prepare', selection)).json();
  const failed = await student.post('/api/ai/confirm', { ticket: next.ticket, consent: true });
  expect(failed.status).toBe(502); expect(await failed.json()).toEqual({ error: 'UPSTREAM_ERROR' }); expect(calls).toBe(1);
});
it('the total upstream deadline aborts a stalled response without retrying or recording success', async () => {
  let calls = 0;
  const f = await fixture(isolatedConfig({ transport: async (_url, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }));
  } })), student = await f.login();
  const prepared = await (await student.post('/api/ai/prepare', selection)).json();
  const response = await student.post('/api/ai/confirm', { ticket: prepared.ticket, consent: true });
  expect(response.status).toBe(504); expect(await response.json()).toEqual({ error: 'TIMEOUT' }); expect(calls).toBe(1);
  const sql = new DatabaseSync(f.databasePath);
  try { expect(JSON.parse(String(sql.prepare('SELECT data FROM aiRuns').get()!.data))).toMatchObject({ status: 'failed', fallbackReason: 'TIMEOUT', effectiveMode: null }); } finally { sql.close(); }
}, 12000);
it('client disconnect aborts the upstream and keeps only cancelled metadata', async () => {
  let sent!: () => void, stopped!: () => void;
  const started = new Promise<void>(r => { sent = r; }), aborted = new Promise<void>(r => { stopped = r; });
  const f = await fixture(isolatedConfig({ transport: async (_url, init) => {
    sent(); return new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => { stopped(); reject(new DOMException('aborted', 'AbortError')); }, { once: true }));
  } }));
  const address = f.app.server.address(); if (!address || typeof address === 'string') throw Error('no address');
  const base = `http://127.0.0.1:${address.port}`;
  const login = await fetch(base + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'student001', password: 'Isolated-AI-test-password!' }) });
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!, { csrf } = await login.json();
  const headers = { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
  const prepared = await (await fetch(base + '/api/ai/prepare', { method: 'POST', headers, body: JSON.stringify(selection) })).json();
  const controller = new AbortController();
  const pending = fetch(base + '/api/ai/confirm', { method: 'POST', headers, signal: controller.signal, body: JSON.stringify({ ticket: prepared.ticket, consent: true }) }).catch(() => null);
  await started; controller.abort(); await pending; await aborted;
  const sql = new DatabaseSync(f.databasePath);
  try { await expect.poll(() => sql.prepare('SELECT COUNT(*) AS n FROM aiRuns').get()!.n).toBe(1); expect(JSON.parse(String(sql.prepare('SELECT data FROM aiRuns').get()!.data))).toMatchObject({ status: 'cancelled', fallbackReason: 'CANCELLED', effectiveMode: null }); }
  finally { sql.close(); }
});
