import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const fixtures: { close: () => Promise<void>; path: string }[] = [];
afterEach(async () => {
  for (const f of fixtures.splice(0)) {
    await f.close();
    await rm(f.path, { recursive: true, force: true });
  }
});
async function fixture() {
  const { createOnlineApp } = await import("../../server/app");
  const path = await mkdtemp(join(tmpdir(), "careerpilot-online-"));
  const options = { databasePath: join(path, "test.sqlite"), seed: true };
  const app = await createOnlineApp(options);
  await app.provision("student001", "Test-only-Password-001!");
  await app.provision("student002", "Test-only-Password-002!");
  await app.provision("company1", "Test-only-Password-001!");
  await app.provision("admin", "Test-only-Password-001!");
  await app.provision("counselor1", "Test-only-Password-001!");
  await app.listen(0);
  fixtures.push({ close: app.close, path });
  const address = app.server.address();
  if (!address || typeof address === "string") throw Error("no port");
  const base = `http://127.0.0.1:${address.port}`;
  const request = (url: string, init: RequestInit = {}) => fetch(base + url, init);
  async function login(login = "student001", password = "Test-only-Password-001!") {
    const response = await request("/api/session", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ login, password }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    return {
      cookie,
      read: (url: string) => request(url, { headers: { Cookie: cookie } }),
      post: (url: string, data: unknown) => request(url, {
        method: "POST", headers: { Cookie: cookie, Origin: base,
          "Content-Type": "application/json", "X-CSRF-Token": body.csrf },
        body: JSON.stringify(data),
      }),
    };
  }
  return { app, request, login, options };
}

describe("online trusted boundary (real SQLite and HTTP)", () => {
  it('service tickets enforce ownership, independent administration, revisions and metadata-only audit', async () => {
    const f = await fixture(), student = await f.login(), outsider = await f.login('student002','Test-only-Password-002!'), admin = await f.login('admin'), company = await f.login('company1');
    const create = { type: 'CREATE_TICKET', entityId: 'service-one', expectedRevision: 0, commandId: crypto.randomUUID(), payload: { body: '无法核对当前投递进度，请协助确认操作入口。' } };
    expect((await student.post('/api/commands', create)).status).toBe(200);
    expect((await student.post('/api/commands', create)).status).toBe(200);
    const read = (client: typeof student) => client.read('/api/read/readTickets');
    expect((await read(student)).status).toBe(200);
    expect((await (await read(outsider)).json()).some((t: {id:string}) => t.id === 'service-one')).toBe(false);
    const change = (client: typeof student, revision: number, action: string, text: string, commandId = crypto.randomUUID()) => client.post('/api/commands', { type:'TICKET_ACTION', entityId:'service-one', expectedRevision:revision, commandId, payload:{action,text} });
    expect((await change(student,1,'REPLY','不能自办')).status).toBe(403);
    expect((await change(outsider,1,'REOPEN','不能读取别人')).status).toBe(403);
    expect((await change(admin,1,'CLOSE','未答复不能结案')).status).toBe(422);
    const replyId = crypto.randomUUID();
    expect((await change(admin,1,'REPLY','请在我的投递页面核对最新状态与通知。',replyId)).status).toBe(200);
    expect((await change(admin,1,'REPLY','请在我的投递页面核对最新状态与通知。',replyId)).status).toBe(200);
    expect((await change(admin,1,'REPLY','旧版本不得覆盖')).status).toBe(409);
    expect((await change(admin,2,'CLOSE','入口已经确认，本次服务结案。')).status).toBe(200);
    expect((await change(student,3,'REOPEN','刷新后仍需进一步协助确认。')).status).toBe(200);
    const ticket = (await (await read(student)).json()).find((t:{id:string}) => t.id === 'service-one');
    expect(ticket).toMatchObject({ ownerUserId:'user-student-001', status:'open', revision:4, reply:'请在我的投递页面核对最新状态与通知。' });
    expect(ticket.history).toHaveLength(3);
    expect((await company.post('/api/commands',{ ...create, entityId:'company-service',commandId:crypto.randomUUID() })).status).toBe(200);
    expect((await (await read(company)).json()).map((t:{id:string})=>t.id)).toEqual(['company-service']);
    expect((await (await student.read('/api/notifications')).json()).some((n:{type:string})=>n.type==='TICKET_ACTION')).toBe(true);
    const audit = await (await admin.read('/api/read/exportRedactedAudit')).json();
    expect(JSON.stringify(audit)).not.toContain('无法核对当前投递');
    const sql = new DatabaseSync(f.options.databasePath);
    try { expect(sql.prepare('SELECT count(*) AS n FROM feedback').get()!.n).toBe(2); expect(JSON.stringify(sql.prepare("SELECT data FROM auditLogs WHERE json_extract(data,'$.entityType')='ServiceTicket'").all())).not.toContain('请在我的投递'); } finally { sql.close(); }
  });
  it('interview scheduling rejects company and cross-company student overlaps atomically and releases cancelled slots', async () => {
    const f = await fixture();
    for (const name of ['student039', 'student040', 'company2']) await f.app.provision(name, 'Test-only-Password-001!');
    const one = await f.login('student039'), two = await f.login('student040'), company = await f.login('company1'), other = await f.login('company2');
    const apply = (client: typeof one, id: string, jobId: string) => client.post('/api/commands', { type: 'APPLY', entityId: id, expectedRevision: 0, commandId: crypto.randomUUID(), payload: { jobId, resumeConsent: true } });
    const action = (client: typeof one, id: string, revision: number, name: string, scheduledAt: string) => client.post('/api/commands', { type: 'APPLICATION_ACTION', entityId: id, expectedRevision: revision, commandId: crypto.randomUUID(), payload: { action: name, scheduledAt, location: '隔离日程会议室' } });
    const otherJobs = await (await other.read('/api/read/readCompanyWorkspace')).json();
    const otherJob = otherJobs.jobs.find((j: {status:string}) => j.status === 'published');
    expect((await apply(one, 'slot-one', 'job-001')).status).toBe(200);
    expect((await apply(two, 'slot-two', 'job-001')).status).toBe(200);
    expect((await apply(one, 'slot-other', otherJob.id)).status).toBe(200);
    expect((await action(company, 'slot-one', 1, 'SCHEDULE_INTERVIEW', '2026-12-14T02:00:00Z')).status).toBe(200);
    expect((await action(company, 'slot-two', 1, 'SCHEDULE_INTERVIEW', '2026-12-14T02:30:00Z')).status).toBe(422);
    expect((await action(other, 'slot-other', 1, 'SCHEDULE_INTERVIEW', '2026-12-14T02:30:00Z')).status).toBe(422);
    let snapshot = await (await two.read('/api/read/readScopedSnapshot')).json();
    expect(snapshot.applications.find((a: {id:string}) => a.id === 'slot-two')).toMatchObject({ revision: 1, status: 'applied' });
    expect(snapshot.interviews.some((i: {applicationId:string}) => i.applicationId === 'slot-two')).toBe(false);
    expect((await action(company, 'slot-two', 1, 'SCHEDULE_INTERVIEW', '2026-12-14T03:00:00Z')).status).toBe(200);
    expect((await action(company, 'slot-two', 2, 'RESCHEDULE', '2026-12-14T02:59:00Z')).status).toBe(422);
    expect((await company.post('/api/commands', { type: 'APPLICATION_ACTION', entityId: 'slot-one', expectedRevision: 2, commandId: crypto.randomUUID(), payload: { action: 'CANCEL_INTERVIEW', reason: '已与候选人沟通取消安排。' } })).status).toBe(200);
    expect((await action(company, 'slot-two', 2, 'RESCHEDULE', '2026-12-14T02:00:00Z')).status).toBe(200);
    snapshot = await (await two.read('/api/read/readScopedSnapshot')).json();
    expect(snapshot.interviews.find((i: {applicationId:string}) => i.applicationId === 'slot-two')).toMatchObject({ scheduledAt: '2026-12-14T02:00:00Z', studentResponse: 'pending' });
  });
  it('offer declines are final and expired documents cannot be accepted or used to create agreements', async () => {
    const f = await fixture(); await f.app.provision('student040','Test-only-Password-001!');
    const student = await f.login('student040'), company = await f.login('company1');
    const studentActor = { role: 'student' as const, userId: 'user-student-040' }, companyActor = { role: 'company' as const, userId: 'user-company-001' };
    const oldClock = { now: () => '2020-01-01T00:00:00Z' };
    const execute = (type: 'APPLY' | 'APPLICATION_ACTION', revision: number, payload: object, actor = companyActor as typeof studentActor | typeof companyActor) => f.app.repository.execute({ type, entityId: 'expired-offer', expectedRevision: revision, commandId: crypto.randomUUID(), payload } as Parameters<typeof f.app.repository.execute>[0], actor, oldClock);
    await execute('APPLY', 0, { jobId: 'job-001', resumeConsent: true }, studentActor);
    await execute('APPLICATION_ACTION', 1, { action: 'SCHEDULE_INTERVIEW', scheduledAt: '2020-01-02T00:00:00Z', location: '受控时间测试会议室' });
    await execute('APPLICATION_ACTION', 2, { action: 'COMPLETE_INTERVIEW', result: 'pass', feedback: '通过实践核验。' });
    const terms = { location: '测试办公区', compensation: '税前月薪12000元', startDate: '2027-07-01', responseDeadline: '2020-01-03T00:00:00Z', note: '' };
    await execute('APPLICATION_ACTION', 3, { action: 'ISSUE_OFFER_DOCUMENT', offer: terms });
    const action = (client: typeof student, revision: number, action: string, extra = {}) => client.post('/api/commands', { type: 'APPLICATION_ACTION', entityId: 'expired-offer', expectedRevision: revision, commandId: crypto.randomUUID(), payload: { action, ...extra } });
    expect((await action(student, 4, 'ACCEPT_OFFER')).status).toBe(422);
    expect((await action(student, 4, 'DECLINE_OFFER', { reason: '超时不得响应' })).status).toBe(422);
    expect((await action(company, 4, 'CREATE_AGREEMENT')).status).toBe(422);
    expect((await action(company, 4, 'WITHDRAW_OFFER', { reason: '原文书已到期，重新核实招聘安排。' })).status).toBe(200);
    expect((await action(company, 5, 'ISSUE_OFFER_DOCUMENT', { offer: { ...terms, responseDeadline: '2026-12-25T00:00:00Z' } })).status).toBe(200);
    expect((await action(student, 6, 'DECLINE_OFFER', { reason: '已决定继续深造。' })).status).toBe(200);
    expect((await action(student, 7, 'ACCEPT_OFFER')).status).toBe(422);
    expect((await action(company, 7, 'CREATE_AGREEMENT')).status).toBe(422);
    const snapshot = await (await student.read('/api/read/readScopedSnapshot')).json();
    expect(snapshot.applications.find((a: {id:string}) => a.id === 'expired-offer')).toMatchObject({ status: 'closed', closedReason: 'declined', offerDocuments: [{ version: 1, status: 'withdrawn' }, { version: 2, status: 'declined', responseReason: '已决定继续深造。' }] });
  });
  it('offer documents keep immutable term versions and require the actual student response before agreement', async () => {
    const f = await fixture(); await f.app.provision('student040','Test-only-Password-001!');
    const student = await f.login('student040'), company = await f.login('company1'), outsider = await f.login();
    const action = (client: typeof student, revision: number, action: string, extra = {}, commandId = crypto.randomUUID()) => client.post('/api/commands', { type: 'APPLICATION_ACTION', entityId: 'document-offer', commandId, expectedRevision: revision, payload: { action, ...extra } });
    expect((await student.post('/api/commands', { type: 'APPLY', entityId: 'document-offer', commandId: crypto.randomUUID(), expectedRevision: 0, payload: { jobId: 'job-001', resumeConsent: true } })).status).toBe(200);
    await action(company,1,'SCHEDULE_INTERVIEW',{scheduledAt:'2026-12-10T10:00:00Z',location:'隔离测试会议室'});
    await action(company,2,'COMPLETE_INTERVIEW',{result:'pass',feedback:'已通过岗位实践能力核验。'});
    const terms = { location: '上海办公区', compensation: '税前月薪区间，以劳动合同约定为准', startDate: '2027-07-01', responseDeadline: '2026-12-25T00:00:00Z', note: '请携带毕业证明办理后续入职手续。' };
    expect((await action(company,3,'ISSUE_OFFER_DOCUMENT',{offer: {...terms,responseDeadline:'2020-01-01T00:00:00Z'}})).status).toBe(422);
    expect((await action(company,3,'ISSUE_OFFER')).status).toBe(422);
    expect((await action(company,3,'ISSUE_OFFER_DOCUMENT',{offer:terms})).status).toBe(200);
    expect((await action(company,4,'CREATE_AGREEMENT')).status).toBe(422);
    expect((await action(company,4,'ACCEPT_OFFER')).status).toBe(403);
    expect((await action(outsider,4,'ACCEPT_OFFER')).status).toBe(403);
    const commandId = crypto.randomUUID();
    expect((await action(student,4,'ACCEPT_OFFER',{},commandId)).status).toBe(200);
    expect((await action(student,4,'ACCEPT_OFFER',{},commandId)).status).toBe(200);
    expect((await action(student,4,'DECLINE_OFFER',{reason:'已选择其他机会。'})).status).toBe(409);
    expect((await action(company,5,'WITHDRAW_OFFER',{reason:'经双方沟通调整原有招聘安排。'})).status).toBe(200);
    expect((await action(company,6,'CREATE_AGREEMENT')).status).toBe(422);
    expect((await action(company,6,'ISSUE_OFFER_DOCUMENT',{offer:{...terms,location:'杭州办公区'}})).status).toBe(200);
    const snapshot = await (await student.read('/api/read/readScopedSnapshot')).json();
    const documents = snapshot.applications.find((a: {id:string}) => a.id === 'document-offer').offerDocuments;
    expect(documents).toHaveLength(2);
    expect(documents[0]).toMatchObject({version:1,location:'上海办公区',status:'withdrawn',withdrawalReason:'经双方沟通调整原有招聘安排。'});
    expect(documents[1]).toMatchObject({version:2,location:'杭州办公区',status:'pending',companyName:'青屿数字（虚构）',jobTitle:'前端开发工程师'});
    expect((await action(student,7,'ACCEPT_OFFER')).status).toBe(200);
    expect((await action(company,8,'CREATE_AGREEMENT')).status).toBe(200);
    expect((await action(company,9,'CONFIRM_AGREEMENT')).status).toBe(200);
    expect((await action(student,10,'CONFIRM_AGREEMENT')).status).toBe(200);
    expect((await action(company,11,'WITHDRAW_OFFER',{reason:'不能绕过双方协议终止流程。'})).status).toBe(422);
  });
  it("administrator reassignment transfers support and revokes old counselor reads and attachments immediately", async () => {
    const f = await fixture(), admin = await f.login('admin'), oldCounselor = await f.login('counselor1'), student = await f.login('student002', 'Test-only-Password-002!');
    await f.app.provision('counselor4', 'Test-only-Password-001!'); const nextCounselor = await f.login('counselor4');
    const attachment = await f.app.repository.addAttachment({ userId: 'user-student-002', role: 'student' }, { fileName: 'scope.pdf', blob: new Blob(['%PDF-test-scope'], { type: 'application/pdf' }) }, { now: () => new Date().toISOString() });
    const support = { type: 'CREATE_ASSISTANCE', entityId: 'handover-support', expectedRevision: 0, commandId: crypto.randomUUID(), payload: { studentId: 'student-002', alertRuleIds: ['manual'], note: '持续支持学生完成当前求职行动计划。', nextReviewAt: '2026-12-20T00:00:00Z' } };
    expect((await oldCounselor.post('/api/commands', support)).status).toBe(200);
    expect((await oldCounselor.read(`/api/attachments/${attachment.id}`)).status).toBe(200);
    const command = { type: 'REASSIGN_STUDENT', entityId: 'student-002', expectedRevision: 1, commandId: crypto.randomUUID(), payload: { counselorId: 'user-counselor-004', reason: '学院确认工作交接，由新辅导员继续跟进。' } };
    expect((await oldCounselor.post('/api/commands', command)).status).toBe(403);
    expect((await admin.post('/api/commands', { ...command, commandId: crypto.randomUUID(), payload: { ...command.payload, counselorId: 'user-company-001' } })).status).toBe(422);
    expect((await admin.post('/api/commands', command)).status).toBe(200);
    expect((await admin.post('/api/commands', command)).status).toBe(200);
    expect((await admin.post('/api/commands', { ...command, commandId: crypto.randomUUID() })).status).toBe(409);
    expect((await oldCounselor.read('/api/read/readResume?args=["student-002"]')).status).toBe(403);
    expect((await oldCounselor.read(`/api/attachments/${attachment.id}`)).status).toBe(403);
    expect((await nextCounselor.read(`/api/attachments/${attachment.id}`)).status).toBe(200);
    const oldSnapshot = await (await oldCounselor.read('/api/read/readScopedSnapshot')).json();
    expect(oldSnapshot.students.some((s: { id: string }) => s.id === 'student-002')).toBe(false);
    const nextSnapshot = await (await nextCounselor.read('/api/read/readScopedSnapshot')).json();
    const record = nextSnapshot.assistance.find((s: { id: string }) => s.id === 'handover-support');
    expect(record).toMatchObject({ counselorId: 'user-counselor-004', status: 'open', revision: 2 });
    const review = { type: 'ASSISTANCE_ACTION', commandId: crypto.randomUUID(), entityId: record.id, expectedRevision: record.revision, payload: { action: 'REVIEW', reviewNote: '已完成交接沟通，继续执行学生行动计划。' } };
    expect((await oldCounselor.post('/api/commands', review)).status).toBe(403);
    expect((await nextCounselor.post('/api/commands', review)).status).toBe(200);
    for (const client of [oldCounselor, nextCounselor, student]) {
      expect((await (await client.read('/api/notifications')).json()).some((n: { type: string }) => n.type === 'REASSIGN_STUDENT')).toBe(true);
    }
  });
  it("online admission requires company approval and reviewed jobs, retaining history after takedown", async () => {
    const f = await fixture(), admin = await f.login('admin'), company = await f.login('company1');
    await f.app.provision('student040', 'Test-only-Password-001!');
    const student = await f.login('student040');
    const cmd = (client: typeof admin, type: string, entityId: string, expectedRevision: number, payload: object, commandId = crypto.randomUUID()) => client.post('/api/commands', { type, entityId, expectedRevision, payload, commandId });
    const governance = await (await admin.read('/api/read/readGovernance')).json();
    expect(governance.companies).toBeDefined();
    expect(JSON.stringify(governance)).not.toMatch(/resumeSnapshot|sections|blob|salt|csrf/);
    const originalCompany = governance.companies.find((c: { id: string }) => c.id === 'company-001');
    expect((await cmd(company, 'REVIEW_COMPANY', originalCompany.id, originalCompany.revision, { verified: false, reason: '越权操作不应成功' })).status).toBe(403);
    expect((await cmd(admin, 'REVIEW_COMPANY', originalCompany.id, originalCompany.revision, { verified: false, reason: '试用企业等待人工核实' })).status).toBe(200);
    const existing = (await (await company.read('/api/read/readCompanyWorkspace')).json()).jobs[0];
    const { title, categoryId, industryId, cityId, salaryRange, requiredSkills, preferredMajorIds, minDegree, minExperienceMonths, jdText } = existing;
    const draft = { title, categoryId, industryId, cityId, salaryRange, requiredSkills, preferredMajorIds, minDegree, minExperienceMonths, jdText, deadline: '2026-12-20T10:00:00Z' };
    expect((await cmd(company, 'SAVE_JOB', 'reviewed-job', 0, draft)).status).toBe(200);
    expect((await cmd(company, 'JOB_ACTION', 'reviewed-job', 1, { action: 'PUBLISH' })).status).toBe(403);
    expect((await cmd(admin, 'REVIEW_COMPANY', originalCompany.id, originalCompany.revision + 1, { verified: true, reason: '已由管理员人工核实准入' })).status).toBe(200);
    expect((await cmd(company, 'JOB_ACTION', 'reviewed-job', 1, { action: 'PUBLISH' })).status).toBe(200);
    const publicJobs = async () => (await (await f.request('/api/public/jobs')).json()).jobs;
    expect((await publicJobs()).some((j: { id: string }) => j.id === 'reviewed-job')).toBe(false);
    expect((await cmd(student, 'APPLY', 'admission-application', 0, { jobId: 'reviewed-job', resumeConsent: true })).status).toBe(422);
    expect((await cmd(company, 'REVIEW_JOB', 'reviewed-job', 2, { decision: 'approve', reason: '企业不能自己批准岗位' })).status).toBe(403);
    const approveId = crypto.randomUUID();
    expect((await cmd(admin, 'REVIEW_JOB', 'reviewed-job', 2, { decision: 'approve', reason: '已核实职责与用工条件' }, approveId)).status).toBe(200);
    expect((await cmd(admin, 'REVIEW_JOB', 'reviewed-job', 2, { decision: 'approve', reason: '已核实职责与用工条件' }, approveId)).status).toBe(200);
    expect((await cmd(admin, 'REVIEW_JOB', 'reviewed-job', 2, { decision: 'reject', reason: '旧版本不得覆盖最新审核' })).status).toBe(409);
    expect((await publicJobs()).some((j: { id: string }) => j.id === 'reviewed-job')).toBe(true);
    expect((await cmd(student, 'APPLY', 'admission-application', 0, { jobId: 'reviewed-job', resumeConsent: true })).status).toBe(200);
    expect((await cmd(admin, 'REVIEW_JOB', 'reviewed-job', 3, { decision: 'takedown', reason: '发现岗位条件需重新核实' })).status).toBe(200);
    expect((await publicJobs()).some((j: { id: string }) => j.id === 'reviewed-job')).toBe(false);
    const workspace = await (await company.read('/api/read/readCompanyWorkspace')).json();
    expect(workspace.applications.some((a: { id: string }) => a.id === 'admission-application')).toBe(true);
    expect((await cmd(company, 'SAVE_JOB', 'reviewed-job', 4, { ...draft, title: '修改后重新审核的岗位' })).status).toBe(200);
    expect((await cmd(company, 'JOB_ACTION', 'reviewed-job', 5, { action: 'PUBLISH' })).status).toBe(200);
    expect((await cmd(admin, 'REVIEW_JOB', 'reviewed-job', 6, { decision: 'reject', reason: '请补充具体职责与工作时间' })).status).toBe(200);
    expect((await (await company.read('/api/read/readCompanyWorkspace')).json()).jobs.find((j: { id: string }) => j.id === 'reviewed-job')).toMatchObject({ status: 'draft', reviewStatus: 'rejected', reviewReason: '请补充具体职责与工作时间', revision: 7 });
  });
  it("multiple SSE subscribers share one recovery poller and revoked sessions are disconnected", async () => {
    const f = await fixture(), student = await f.login(), admin = await f.login('admin');
    const timers = vi.spyOn(globalThis, 'setInterval');
    const clients: { abort: AbortController; reader: ReadableStreamDefaultReader<Uint8Array> }[] = [];
    try {
      for (let i = 0; i < 4; i++) {
        const abort = new AbortController();
        const response = await f.request('/api/events', { headers: { Cookie: student.cookie }, signal: abort.signal });
        const reader = response.body!.getReader(); await reader.read(); clients.push({ abort, reader });
      }
      // Per-connection timers would scan all subscribers N times and grow quadratically.
      expect(timers.mock.calls.filter(call => call[1] === 1000)).toHaveLength(1);
      expect((await admin.post('/api/admin/users', { userId: 'user-student-001', active: false })).status).toBe(200);
      const deadline = setTimeout(() => clients.forEach(c => c.abort.abort()), 2500);
      try {
        for (const client of clients) {
          while (!(await client.reader.read()).done) { /* Drain before observing server close. */ }
        }
      } finally { clearTimeout(deadline); }
    } finally {
      timers.mockRestore();
      for (const client of clients) { client.abort.abort(); await client.reader.cancel().catch(() => undefined); }
    }
  });
  it("manual support can be closed and reopened independently of alerts, but never outside counselor scope", async () => {
    const f = await fixture(), counselor = await f.login('counselor1'), company = await f.login('company1');
    const create = { type: 'CREATE_ASSISTANCE', commandId: 'manual-support-create', entityId: 'manual-support', expectedRevision: 0, payload: { studentId: 'student-010', alertRuleIds: ['manual'], note: '已与学生核实，制定就业准备行动计划。', nextReviewAt: '2026-12-10T00:00:00Z' } };
    expect((await counselor.post('/api/commands', { ...create, commandId: 'outside-scope', entityId: 'outside-scope', payload: { ...create.payload, studentId: 'student-040' } })).status).toBe(403);
    expect((await company.post('/api/commands', create)).status).toBe(403);
    expect((await counselor.post('/api/commands', create)).status).toBe(200);
    const action = (revision: number, action: string, extra = {}) => counselor.post('/api/commands', { type: 'ASSISTANCE_ACTION', commandId: crypto.randomUUID(), entityId: 'manual-support', expectedRevision: revision, payload: { action, ...extra } });
    expect((await action(1, 'REVIEW', { reviewNote: '已按计划完成简历修整，待持续跟进。' })).status).toBe(200);
    expect((await action(2, 'CLOSE', { confirmed: true })).status).toBe(200);
    expect((await action(3, 'REOPEN', { reviewNote: '学生再次需要支持，重新开启跟进。', nextReviewAt: '2026-12-20T00:00:00Z' })).status).toBe(200);
    const snapshot = await (await counselor.read('/api/read/readScopedSnapshot')).json();
    expect(snapshot.assistance.find((r: { id: string }) => r.id === 'manual-support')).toMatchObject({ status: 'open', revision: 4, closedAt: null, nextReviewAt: '2026-12-20T00:00:00Z' });
    expect(snapshot.auditLogs.some((r: { action: string }) => r.action === 'REOPEN_ASSISTANCE')).toBe(true);
    expect((await counselor.post('/api/commands', { ...create, commandId: 'duplicate-open', entityId: 'duplicate-open' })).status).toBe(422);
  });
  it("student support tasks expose only the explicitly shared plan, never private notes or risk rules", async () => {
    const f = await fixture(), counselor = await f.login('counselor1'), student = await f.login('student002', 'Test-only-Password-002!');
    const create = { type: 'CREATE_ASSISTANCE', entityId: 'private-support', commandId: crypto.randomUUID(), expectedRevision: 0, payload: { studentId: 'student-002', alertRuleIds: ['inactive7d'], note: '仅辅导员可见的沟通判断PRIVATE-MARKER', nextReviewAt: '2026-12-20T00:00:00Z', studentPlan: '请在下次复查前完善简历项目经历。' } };
    expect((await counselor.post('/api/commands', create)).status).toBe(200);
    const snapshot = await (await student.read('/api/read/readScopedSnapshot')).json();
    expect(snapshot.supportTasks).toContainEqual({ id: 'private-support', plan: '请在下次复查前完善简历项目经历。', nextReviewAt: '2026-12-20T00:00:00Z', status: 'open' });
    expect(snapshot.assistance).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE-MARKER|inactive7d/);
    expect((await (await counselor.read('/api/read/readScopedSnapshot')).json()).assistance.find((a: { id: string }) => a.id === 'private-support').note).toContain('PRIVATE-MARKER');
  });
  it("a connected SSE client catches committed changes even when immediate delivery was missed", async () => {
    const f = await fixture(), student = await f.login();
    const abort = new AbortController();
    const response = await f.request('/api/events', { headers: { Cookie: student.cookie }, signal: abort.signal });
    const reader = response.body!.getReader();
    await reader.read();
    const sql = new DatabaseSync(f.options.databasePath);
    sql.prepare('INSERT INTO changes(user_id,created_at) VALUES(?,?)').run('user-student-001', new Date().toISOString());
    const seq = Number(sql.prepare('SELECT MAX(seq) AS n FROM changes').get()!.n); sql.close();
    try {
      let received = '';
      const deadline = setTimeout(() => abort.abort(), 2500);
      try {
        while (!received.includes(`id: ${seq}\n`)) received += new TextDecoder().decode((await reader.read()).value);
        expect(received).toContain('event: change\ndata: {}');
        expect(received).not.toContain('student-001');
      } finally { clearTimeout(deadline); }
    } finally { abort.abort(); await reader.cancel().catch(() => undefined); }
  });
  it("student interview response is scoped, idempotent and reset by employer rescheduling", async () => {
    const f = await fixture();
    await f.app.provision('student040', 'Test-only-Password-001!');
    const student = await f.login('student040'), company = await f.login('company1'), outsider = await f.login();
    const action = (client: typeof student, revision: number, action: string, extra = {}, commandId = crypto.randomUUID()) =>
      client.post('/api/commands', { type: 'APPLICATION_ACTION', commandId, entityId: 'invitation-response', expectedRevision: revision, payload: { action, ...extra } });
    expect((await student.post('/api/commands', { type: 'APPLY', commandId: 'invitation-apply', entityId: 'invitation-response', expectedRevision: 0, payload: { jobId: 'job-001', resumeConsent: true } })).status).toBe(200);
    expect((await action(company, 1, 'SCHEDULE_INTERVIEW', { scheduledAt: '2026-12-10T10:00:00Z', location: '测试会议室' })).status).toBe(200);
    expect((await action(outsider, 2, 'CONFIRM_INTERVIEW')).status).toBe(403);
    expect((await action(company, 2, 'CONFIRM_INTERVIEW')).status).toBe(403);
    expect((await action(student, 2, 'REQUEST_RESCHEDULE', { reason: '' })).status).toBe(422);
    const commandId = crypto.randomUUID();
    expect((await action(student, 2, 'REQUEST_RESCHEDULE', { reason: '与课程考试时间冲突，希望另行安排。' }, commandId)).status).toBe(200);
    expect((await action(student, 2, 'REQUEST_RESCHEDULE', { reason: '与课程考试时间冲突，希望另行安排。' }, commandId)).status).toBe(200);
    let snapshot = await (await company.read('/api/read/readCompanyWorkspace')).json();
    expect(snapshot.interviews.find((i: { applicationId: string }) => i.applicationId === 'invitation-response')).toMatchObject({ studentResponse: 'rescheduleRequested', responseReason: '与课程考试时间冲突，希望另行安排。' });
    expect((await action(company, 3, 'RESCHEDULE', { scheduledAt: '2026-12-11T10:00:00Z', location: '重新安排的会议室' })).status).toBe(200);
    expect((await action(student, 3, 'CONFIRM_INTERVIEW')).status).toBe(409);
    snapshot = await (await student.read('/api/read/readScopedSnapshot')).json();
    expect(snapshot.interviews.find((i: { applicationId: string }) => i.applicationId === 'invitation-response')).toMatchObject({ studentResponse: 'pending', respondedAt: null, responseReason: null, location: '重新安排的会议室' });
    expect((await action(student, 4, 'CONFIRM_INTERVIEW')).status).toBe(200);
    snapshot = await (await student.read('/api/read/readScopedSnapshot')).json();
    const invitation = snapshot.interviews.find((i: { applicationId: string }) => i.applicationId === 'invitation-response');
    expect(invitation.studentResponse).toBe('accepted');
    expect(Date.parse(invitation.respondedAt)).toBeGreaterThan(Date.now() - 10000);
    expect(snapshot.applicationEvents.filter((e: { event: string; applicationId: string }) => e.applicationId === 'invitation-response' && e.event === 'REQUEST_RESCHEDULE')).toHaveLength(1);
  });
  it("declining an invitation keeps history, cancels the schedule and returns to screening", async () => {
    const f = await fixture();
    await f.app.provision('student040', 'Test-only-Password-001!');
    const student = await f.login('student040'), company = await f.login('company1');
    await student.post('/api/commands', { type: 'APPLY', commandId: 'decline-apply', entityId: 'decline-invitation', expectedRevision: 0, payload: { jobId: 'job-001', resumeConsent: true } });
    await company.post('/api/commands', { type: 'APPLICATION_ACTION', commandId: 'decline-schedule', entityId: 'decline-invitation', expectedRevision: 1, payload: { action: 'SCHEDULE_INTERVIEW', scheduledAt: '2026-12-10T10:00:00Z', location: '测试会议室' } });
    const response = await student.post('/api/commands', { type: 'APPLICATION_ACTION', commandId: 'decline-response', entityId: 'decline-invitation', expectedRevision: 2, payload: { action: 'DECLINE_INTERVIEW', reason: '个人安排有变化，暂不参加本次面试。' } });
    expect(response.status).toBe(200);
    const snapshot = await (await company.read('/api/read/readCompanyWorkspace')).json();
    expect(snapshot.applications.find((a: { id: string }) => a.id === 'decline-invitation').status).toBe('screening');
    expect(snapshot.interviews.find((i: { applicationId: string }) => i.applicationId === 'decline-invitation')).toMatchObject({ status: 'cancelled', studentResponse: 'declined' });
  });
  it("denies anonymous access, wrong password and cross-origin mutation", async () => {
    const f = await fixture();
    expect((await f.request("/api/read/readScopedSnapshot")).status).toBe(401);
    expect((await f.request("/api/session", { method: "POST", headers: {
      "Content-Type": "application/json", Origin: "https://attacker.invalid",
    }, body: JSON.stringify({ login: "student001", password: "Test-only-Password-001!" }) })).status).toBe(403);
    const session = await f.login();
    expect((await f.request("/api/commands", { method: "POST", headers: {
      Cookie: session.cookie, "Content-Type": "application/json",
    }, body: "{}" })).status).toBe(403);
    expect((await f.request("/api/session", { method: "POST", headers: {
      "Content-Type": "application/json",
    }, body: JSON.stringify({ login: "student001", password: "wrong" }) })).status).toBe(401);
  });
  it("reports the applied server migration and stamps audit exports with server time", async () => {
    const f = await fixture(), admin = await f.login("admin");
    expect((await (await f.request("/api/health")).json()).schema).toBe(4);
    const started = Date.now();
    const audit = await (await admin.read("/api/read/exportRedactedAudit")).json();
    expect(Date.parse(audit.exportedAt)).toBeGreaterThanOrEqual(started);
    expect(Date.parse(audit.exportedAt)).toBeLessThanOrEqual(Date.now());
    await admin.read('/api/read/readResume?args=["student-001"]');
    const afterRead = await (await admin.read("/api/read/exportRedactedAudit")).json();
    const read = afterRead.records.findLast((record: { action: string }) => record.action === "ADMIN_READ_RESUME");
    expect(Date.parse(read.at)).toBeGreaterThanOrEqual(started);
  });
  it("ignores forged actors and scopes student and company private reads", async () => {
    const f = await fixture(), student = await f.login();
    const data = await (await student.read("/api/read/readScopedSnapshot")).json();
    expect(data.students.map((s: { id: string }) => s.id)).toEqual(["student-001"]);
    expect((await student.read('/api/read/readResume?args=["student-002"]')).status).toBe(403);
    expect((await student.read("/api/read/readAdminConsole")).status).toBe(403);
    const company = await f.login("company1");
    expect((await company.read("/api/read/readScopedSnapshot")).status).toBe(403);
    expect((await company.read('/api/read/readResume?args=["student-001"]')).status).toBe(403);
    expect((await student.post("/api/commands", { type: "SAVE_RESUME", actor: {
      role: "admin", userId: "user-admin-001" }, commandId: "forged", entityId: "resume-002",
      expectedRevision: 1, payload: { sections: data.resumes[0].sections },
    })).status).toBe(422);
  });
  it("commits once, rejects stale revisions and preserves committed data after reopen", async () => {
    const f = await fixture(), student = await f.login();
    const data = await (await student.read("/api/read/readScopedSnapshot")).json();
    const resume = data.resumes[0];
    resume.sections.basic.name = "Persisted student";
    const command = { type: "SAVE_RESUME", commandId: "idempotent-01", entityId: resume.id,
      expectedRevision: resume.revision, payload: { sections: resume.sections } };
    const first = await student.post("/api/commands", command);
    expect(first.status).toBe(200);
    expect(await (await student.post("/api/commands", command)).json()).toEqual(await first.json());
    expect((await student.post("/api/commands", { ...command, commandId: "stale" })).status).toBe(409);
    expect((await student.post("/api/commands", { ...command, payload: { sections: {
      ...resume.sections, basic: { ...resume.sections.basic, name: "collision" },
    } } })).status).toBe(409);
    await f.app.close();
    const { createOnlineApp } = await import("../../server/app");
    const reopened = await createOnlineApp({ ...f.options, seed: false });
    fixtures[fixtures.length - 1]!.close = reopened.close;
    const saved = await reopened.repository.readResume({ userId: "user-student-001", role: "student" }, "student-001");
    expect(saved.sections.basic.name).toBe("Persisted student");
    expect(saved.revision).toBe(resume.revision + 1);
    expect(saved.updatedAt).not.toBe("2026-11-12T02:00:00.000Z");
  });
  it("persists bookmarks per account and revokes a logged-out session", async () => {
    const f = await fixture(), one = await f.login(), two = await f.login("student002", "Test-only-Password-002!");
    expect((await one.post("/api/bookmarks", { jobId: "job-001", saved: true })).status).toBe(200);
    expect(await (await one.read("/api/bookmarks")).json()).toEqual(["job-001"]);
    expect(await (await two.read("/api/bookmarks")).json()).toEqual([]);
    expect((await one.post("/api/logout", {})).status).toBe(200);
    expect((await one.read("/api/read/readScopedSnapshot")).status).toBe(401);
  });
  it("public jobs omit private data and notifications are account scoped", async () => {
    const f = await fixture(), one = await f.login();
    const publicData = await (await f.request("/api/public/jobs")).json();
    expect(publicData.jobs.length).toBeGreaterThan(0);
    expect(JSON.stringify(publicData)).not.toMatch(/resumeSnapshot|studentNo|password|@example/);
    const notices = await (await one.read("/api/notifications")).json();
    expect(notices.every((n: { userId: string }) => n.userId === "user-student-001")).toBe(true);
  });
  it("administrator disable immediately revokes API access and does not collide with later audit sequences", async () => {
    const f = await fixture(), student = await f.login(), admin = await f.login("admin");
    expect((await admin.post('/api/admin/users', { userId: 'user-student-001', active: false })).status).toBe(200);
    expect((await student.read('/api/read/readScopedSnapshot')).status).toBe(401);
    expect((await admin.post('/api/admin/users', { userId: 'user-student-001', active: true })).status).toBe(200);
    const fresh = await f.login();
    const snapshot = await (await fresh.read('/api/read/readScopedSnapshot')).json();
    expect((await fresh.post('/api/commands', { type: 'SAVE_RESUME', commandId: 'after-admin', entityId: snapshot.resumes[0].id, expectedRevision: snapshot.resumes[0].revision, payload: { sections: snapshot.resumes[0].sections } })).status).toBe(200);
  });
  it("private workspace media is decoded, stripped, revision checked and isolated per user", async () => {
    const f = await fixture(), one = await f.login(), two = await f.login("student002", "Test-only-Password-002!");
    const sharp = (await import("sharp")).default;
    const bytes = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#225566' } }).jpeg().withExif({ IFD0: { Copyright: 'private-test-marker' } }).toBuffer();
    const payload = { base64: bytes.toString('base64'), mime: 'image/jpeg', expectedRevision: 0 };
    expect((await one.post('/api/me/media', payload)).status).toBe(200);
    const saved = await (await one.read('/api/me/media')).json();
    expect(saved.revision).toBe(1);
    const clean = await sharp(Buffer.from(saved.base64, 'base64')).metadata();
    expect(clean.width).toBe(512); expect(clean.height).toBe(512); expect(clean.exif).toBeUndefined();
    expect(await (await two.read('/api/me/media')).json()).toMatchObject({ revision: 0, base64: null });
    expect((await one.post('/api/me/media', payload)).status).toBe(409);
    expect((await two.post('/api/me/media', { ...payload, base64: Buffer.from('not an image').toString('base64') })).status).toBe(422);
    expect((await one.post('/api/me/media', { expectedRevision: 1, remove: true })).status).toBe(200);
    expect(await (await one.read('/api/me/media')).json()).toMatchObject({ revision: 2, base64: null });
    expect((await one.post('/api/me/media', { ...payload, userId: 'user-student-002', expectedRevision: 2 })).status).toBe(422);
  });
  it("rejects client supplied destination status and audit fields instead of mass assigning them", async () => {
    const f = await fixture(), student = await f.login("student002", "Test-only-Password-002!");
    const snapshot = await (await student.read('/api/read/readScopedSnapshot')).json();
    const existing = snapshot.destinations[0];
    const response = await student.post('/api/commands', { type: 'SAVE_DESTINATION', commandId: 'injected', entityId: existing.id, expectedRevision: existing.revision, payload: { studentId: 'student-002', type: 'unemployed', source: 'independent', applicationId: null, agreementId: null, organizationName: null, industryId: null, attachmentIds: [], approvedAt: '2099-01-01T00:00:00Z', status: 'draft', revision: 100, id: 'injected-destination' } });
    expect(response.status).toBe(422);
    expect((await (await student.read('/api/read/readScopedSnapshot')).json()).destinations).toEqual(snapshot.destinations);
  });
  it("runs recruiting, agreement, destination review and scoped notifications through real HTTP transactions", async () => {
    const f = await fixture();
    await f.app.provision('student040', 'Test-only-Password-001!');
    await f.app.provision('counselor4', 'Test-only-Password-001!');
    const student = await f.login('student040'), company = await f.login('company1'), counselor = await f.login('counselor4');
    const command = async (client: typeof student, type: string, entityId: string, expectedRevision: number, payload: object) => {
      const response = await client.post('/api/commands', { type, commandId: crypto.randomUUID(), entityId, expectedRevision, payload });
      const result = await response.json(); expect(result, JSON.stringify(result)).not.toHaveProperty('error'); expect(response.status).toBe(200); return result;
    };
    const appId = 'http-workflow';
    await command(student, 'APPLY', appId, 0, { jobId: 'job-001', resumeConsent: true });
    await command(company, 'APPLICATION_ACTION', appId, 1, { action: 'SCHEDULE_INTERVIEW', scheduledAt: '2026-12-10T10:00:00Z', location: '测试会议室' });
    const before = await (await student.read('/api/read/readScopedSnapshot')).json();
    const invalid = await company.post('/api/commands', { type: 'APPLICATION_ACTION', commandId: 'invalid-step', entityId: appId, expectedRevision: 2, payload: { action: 'COMPLETE_INTERVIEW', result: 'pass', feedback: '' } });
    expect(invalid.status).toBe(422);
    expect((await (await student.read('/api/read/readScopedSnapshot')).json()).interviews).toEqual(before.interviews);
    await command(company, 'APPLICATION_ACTION', appId, 2, { action: 'COMPLETE_INTERVIEW', result: 'pass', feedback: '测试反馈，证据充分且满足条件' });
    await command(company, 'APPLICATION_ACTION', appId, 3, { action: 'ISSUE_OFFER_DOCUMENT', offer: { location: '测试办公区', compensation: '税前月薪12000元', startDate: '2027-07-01', responseDeadline: '2026-12-25T00:00:00Z', note: '' } });
    await command(student, 'APPLICATION_ACTION', appId, 4, { action: 'ACCEPT_OFFER' });
    await command(company, 'APPLICATION_ACTION', appId, 5, { action: 'CREATE_AGREEMENT' });
    await command(company, 'APPLICATION_ACTION', appId, 6, { action: 'CONFIRM_AGREEMENT' });
    await command(student, 'APPLICATION_ACTION', appId, 7, { action: 'CONFIRM_AGREEMENT' });
    const signed = await (await student.read('/api/read/readScopedSnapshot')).json();
    const agreement = signed.agreements.find((a: { applicationId: string }) => a.applicationId === appId);
    expect(agreement.status).toBe('signed');
    const destination = signed.destinations[0] ?? { id: 'http-destination', revision: 0 };
    await command(student, 'SAVE_DESTINATION', destination.id, destination.revision, { studentId: 'student-040', type: 'employment', source: 'internal', applicationId: appId, agreementId: agreement.id, organizationName: '测试单位', industryId: 'industry-1', attachmentIds: [] });
    await command(student, 'DESTINATION_ACTION', destination.id, destination.revision + 1, { action: 'SUBMIT' });
    await command(counselor, 'DESTINATION_ACTION', destination.id, destination.revision + 2, { action: 'APPROVE' });
    expect((await (await student.read('/api/read/readScopedSnapshot')).json()).destinations[0].status).toBe('approved');
    const notices = await (await student.read('/api/notifications')).json();
    expect(notices.some((n: { type: string }) => n.type === 'DESTINATION_ACTION')).toBe(true);
    expect(notices.every((n: { userId: string }) => n.userId === 'user-student-040')).toBe(true);
    const notice = notices[0]; await student.post('/api/notifications', { id: notice.id });
    expect((await (await student.read('/api/notifications')).json()).find((n: { id: string }) => n.id === notice.id).readAt).not.toBeNull();
  });
});
