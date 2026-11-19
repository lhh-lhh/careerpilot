import { expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOnlineApp } from "../../server/app";
const exec = promisify(execFile);

it("real backup/restore CLI recovers the recruiting and pending review chain without resurrecting sessions", async () => {
  const root = await mkdtemp(join(tmpdir(), 'careerpilot-recovery-workflow-'));
  const sourcePath = join(root, 'source.sqlite'), backupDir = join(root, 'snapshot'), restoreDir = join(root, 'restore');
  const app = await createOnlineApp({ databasePath: sourcePath, seed: true });
  let restored: Awaited<ReturnType<typeof createOnlineApp>> | null = null;
  async function client(server: typeof app, name: string) {
    const address = server.server.address(); if (!address || typeof address === 'string') throw Error('no port');
    const base = `http://127.0.0.1:${address.port}`;
    const response = await fetch(base + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: name, password: 'Recovery-test-Password-01!' }) });
    expect(response.status).toBe(200);
    const { csrf } = await response.json(), cookie = response.headers.get('set-cookie')!.split(';')[0]!;
    return { base, cookie,
      read: (path: string) => fetch(base + path, { headers: { Cookie: cookie } }),
      post: (path: string, body: object) => fetch(base + path, { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    };
  }
  try {
    for (const name of ['student040', 'company1', 'counselor4']) await app.provision(name, 'Recovery-test-Password-01!');
    await app.listen(0);
    const student = await client(app, 'student040'), company = await client(app, 'company1');
    const command = async (who: typeof student, type: string, entityId: string, expectedRevision: number, payload: object, commandId = crypto.randomUUID()) => {
      const response = await who.post('/api/commands', { type, entityId, expectedRevision, payload, commandId });
      expect(await response.json()).not.toHaveProperty('error'); expect(response.status).toBe(200);
    };
    const appId = 'restore-workflow';
    await command(student, 'APPLY', appId, 0, { jobId: 'job-001', resumeConsent: true });
    await command(company, 'APPLICATION_ACTION', appId, 1, { action: 'SCHEDULE_INTERVIEW', scheduledAt: '2026-12-10T10:00:00Z', location: '恢复演练会议室' });
    await command(student, 'APPLICATION_ACTION', appId, 2, { action: 'CONFIRM_INTERVIEW' });
    await command(company, 'APPLICATION_ACTION', appId, 3, { action: 'COMPLETE_INTERVIEW', result: 'pass', feedback: '恢复演练：已核实项目事实与岗位要求。' });
    await command(company, 'APPLICATION_ACTION', appId, 4, { action: 'ISSUE_OFFER_DOCUMENT', offer: { location: '恢复演练办公区', compensation: '税前月薪12000元', startDate: '2027-07-01', responseDeadline: '2026-12-25T00:00:00Z', note: '' } });
    await command(student, 'APPLICATION_ACTION', appId, 5, { action: 'ACCEPT_OFFER' });
    await command(company, 'APPLICATION_ACTION', appId, 6, { action: 'CREATE_AGREEMENT' });
    await command(company, 'APPLICATION_ACTION', appId, 7, { action: 'CONFIRM_AGREEMENT' });
    await command(student, 'APPLICATION_ACTION', appId, 8, { action: 'CONFIRM_AGREEMENT' });
    const snapshot = await (await student.read('/api/read/readScopedSnapshot')).json();
    const agreement = snapshot.agreements.find((a: { applicationId: string }) => a.applicationId === appId);
    const destination = snapshot.destinations[0] ?? { id: 'restored-destination', revision: 0 };
    const fileResponse = await student.post('/api/attachments', { fileName: '恢复演练证明.pdf', mime: 'application/pdf', base64: Buffer.from('%PDF-recovery-test').toString('base64') });
    expect(fileResponse.status).toBe(200); const file = await fileResponse.json();
    await command(student, 'SAVE_DESTINATION', destination.id, destination.revision, { studentId: 'student-040', type: 'employment', source: 'internal', applicationId: appId, agreementId: agreement.id, organizationName: '恢复演练虚构单位', industryId: 'industry-1', attachmentIds: [file.id] });
    const submitId = crypto.randomUUID();
    await command(student, 'DESTINATION_ACTION', destination.id, destination.revision + 1, { action: 'SUBMIT' }, submitId);
    expect((await student.post('/api/bookmarks', { jobId: 'job-001', saved: true })).status).toBe(200);
    const backedUp = await exec(process.execPath, ['--import', 'tsx', 'server/cli.ts', 'backup', sourcePath, backupDir]);
    expect(backedUp.stdout).toContain('一致性备份');
    const recovered = await exec(process.execPath, ['--import', 'tsx', 'server/cli.ts', 'restore', backupDir, restoreDir]);
    expect(recovered.stdout).toContain('旧会话已撤销');
    restored = await createOnlineApp({ databasePath: join(restoreDir, 'careerpilot.sqlite') }); await restored.listen(0);
    const fresh = await client(restored, 'student040'), reviewer = await client(restored, 'counselor4');
    expect((await fetch(fresh.base + '/api/read/readScopedSnapshot', { headers: { Cookie: student.cookie } })).status).toBe(401);
    const before = await (await fresh.read('/api/read/readScopedSnapshot')).json();
    expect(before.agreements.find((a: { id: string }) => a.id === agreement.id).status).toBe('signed');
    expect(before.applications.find((a: { id: string }) => a.id === appId).offerDocuments[0]).toMatchObject({ status: 'accepted', location: '恢复演练办公区', version: 1 });
    expect(before.destinations[0]).toMatchObject({ status: 'submitted', attachmentIds: [file.id] });
    expect(await (await fresh.read('/api/bookmarks')).json()).toEqual(['job-001']);
    expect((await (await fresh.read(`/api/attachments/${file.id}`)).json()).base64).toBe(Buffer.from('%PDF-recovery-test').toString('base64'));
    // Persisted receipts survive a restore and prevent a replay from re-submitting the same mutation.
    await command(fresh, 'DESTINATION_ACTION', destination.id, destination.revision + 1, { action: 'SUBMIT' }, submitId);
    expect((await (await fresh.read('/api/read/readScopedSnapshot')).json()).auditLogs).toHaveLength(before.auditLogs.length);
    await command(reviewer, 'DESTINATION_ACTION', destination.id, destination.revision + 2, { action: 'APPROVE' });
    expect((await (await fresh.read('/api/read/readScopedSnapshot')).json()).destinations[0].status).toBe('approved');
    expect((await (await student.read('/api/read/readScopedSnapshot')).json()).destinations[0].status).toBe('submitted');
  } finally { await restored?.close(); await app.close(); await rm(root, { recursive: true, force: true }); }
}, 20000);
