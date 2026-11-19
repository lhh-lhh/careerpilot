import { randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Database } from '../src/adapters/repository/db';
import type { Actor } from '../src/types/identity';
import type { User } from '../src/types/entities';
import type { createAuth } from './auth';
import { digest, normalizeLogin, reserveAttempt } from './security';

function fail(code: string): never { throw Error(code); }
function fields(input: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(input).some(k => !allowed.includes(k))) fail('BAD_REQUEST');
}
function text(value: unknown, min: number, max: number) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || [...value].some(c => c.charCodeAt(0) < 32)) fail('BAD_REQUEST');
  return value.trim();
}
export function createAccounts(sql: DatabaseSync, db: Database, auth: ReturnType<typeof createAuth>) {
  async function audit(actorId: string, entityId: string, action: string, reason: string | null = null) {
    const counter = await db.configs.where('key').equals('auditSequence').first();
    if (!counter || typeof counter.value !== 'number') fail('DATABASE_INVALID');
    const now = new Date().toISOString(), sequence = counter.value + 1;
    await db.configs.update(counter.id, { value: sequence, revision: counter.revision + 1, updatedAt: now });
    await db.auditLogs.add({ id: randomUUID(), sequence, actorUserId: actorId, entityType: 'User', entityId, action, at: now, reason, commandId: randomUUID(), before: null, after: null });
  }
  async function admin(actor: Actor) {
    const user = await db.users.get(actor.userId);
    if (!user?.active || user.role !== 'admin' || actor.role !== 'admin' || (user.accountStatus ?? 'approved') !== 'approved') fail('FORBIDDEN');
  }
  async function register(input: Record<string, unknown>, ip: string) {
    await db.transaction('rw', db.users, async () => { reserveAttempt(sql, `register:${ip}`, 20, 3600_000); });
    fields(input, ['login','password','displayName','role','studentNo','majorId','cohortYear','companyName','inviteToken']);
    const login = normalizeLogin(text(input.login, 3, 64));
    if (!/^[a-z0-9][a-z0-9._@+-]*$/.test(login)) fail('BAD_REQUEST');
    const password = input.password;
    if (typeof password !== 'string' || password.length < 12 || password.length > 256) fail('BAD_REQUEST');
    const displayName = text(input.displayName, 2, 80), role = input.role;
    if (!['student','company','counselor','admin'].includes(String(role))) fail('BAD_REQUEST');
    const staff = role === 'admin' || role === 'counselor';
    if (staff && !input.inviteToken) fail('BAD_REQUEST');
    return db.transaction('rw', db.users, async () => {
      const now = new Date().toISOString();
      if (staff) {
        if (typeof input.inviteToken !== 'string' || input.inviteToken.length > 128) fail('FORBIDDEN');
        const invite = sql.prepare('SELECT * FROM account_invites WHERE token_hash=?').get(digest(input.inviteToken));
        if (!invite || invite.login !== login || invite.role !== role || invite.used_at !== null || Number(invite.expires_at) <= Date.now()) fail('FORBIDDEN');
      } else if (input.inviteToken !== undefined) fail('BAD_REQUEST');
      if (await db.users.filter(u => normalizeLogin(u.login) === login).first()) fail('ALREADY_EXISTS');
      const request: NonNullable<User['accountRequest']> = {};
      if (role === 'student') {
        request.studentNo = text(input.studentNo, 3, 40);
        request.majorId = text(input.majorId, 1, 128);
        if (!Number.isInteger(input.cohortYear) || Number(input.cohortYear) < 2000 || Number(input.cohortYear) > new Date().getFullYear() + 10) fail('BAD_REQUEST');
        request.cohortYear = Number(input.cohortYear);
        const major = await db.dictionaries.get(request.majorId);
        if (!major?.active || major.kind !== 'major' || !major.parentId) fail('BAD_REQUEST');
      } else if (role === 'company') request.companyName = text(input.companyName, 2, 160);
      const user: User = { id: randomUUID(), revision: 1, createdAt: now, updatedAt: now, login, displayName, role: role as User['role'], active: true, studentId: null, companyId: null, accountStatus: staff ? 'approved' : 'pending', accountRequest: request };
      await db.users.add(user);
      await auth.provision(login, password);
      if (staff) sql.prepare('UPDATE account_invites SET used_at=? WHERE token_hash=?').run(Date.now(), digest(String(input.inviteToken)));
      await audit(user.id, user.id, 'REGISTER_ACCOUNT');
      return { id: user.id, accountStatus: user.accountStatus };
    });
  }
  async function read(userId: string) {
    const user = await db.users.get(userId);
    if (!user?.active) fail('UNAUTHORIZED');
    return { ...user, accountStatus: user.accountStatus ?? 'approved' };
  }
  async function list(actor: Actor) { await admin(actor); return db.users.toArray(); }
  async function invite(actor: Actor, input: Record<string, unknown>) {
    return db.transaction('rw', db.users, async () => {
      await admin(actor); fields(input, ['login','role']);
      const login = normalizeLogin(text(input.login, 3, 64)), role = input.role;
      if (!/^[a-z0-9][a-z0-9._@+-]*$/.test(login) || !['admin','counselor'].includes(String(role))) fail('BAD_REQUEST');
      if (await db.users.filter(u => normalizeLogin(u.login) === login).first()) fail('ALREADY_EXISTS');
      reserveAttempt(sql, `invite:${actor.userId}`, 30, 3600_000);
      const token = randomBytes(32).toString('base64url'), expiresAt = Date.now() + 48 * 3600_000;
      sql.prepare('DELETE FROM account_invites WHERE login=? AND used_at IS NULL').run(login);
      sql.prepare('INSERT INTO account_invites VALUES(?,?,?,?,NULL,?)').run(digest(token), login, String(role), expiresAt, actor.userId);
      await audit(actor.userId, login, 'INVITE_ACCOUNT');
      return { token, login, role, expiresAt: new Date(expiresAt).toISOString() };
    });
  }
  async function review(actor: Actor, input: Record<string, unknown>) {
    return db.transaction('rw', db.users, async () => {
      await admin(actor); fields(input, ['userId','expectedRevision','decision','reason','counselorId']);
      const id = text(input.userId, 1, 128), reason = text(input.reason, 2, 500);
      if (!Number.isInteger(input.expectedRevision) || !['approve','reject'].includes(String(input.decision)) || id === actor.userId) fail('BAD_REQUEST');
      const user = await db.users.get(id); if (!user) fail('NOT_FOUND');
      if (user.revision !== input.expectedRevision || user.accountStatus !== 'pending') fail('REVISION_CONFLICT');
      const now = new Date().toISOString();
      if (input.decision === 'approve') {
        const base = { id: randomUUID(), revision: 1, createdAt: now, updatedAt: now };
        if (user.role === 'student') {
          const request = user.accountRequest!, major = request.majorId && await db.dictionaries.get(request.majorId);
          const counselor = typeof input.counselorId === 'string' && await db.users.get(input.counselorId);
          if (!major || !major.active || major.kind !== 'major' || !major.parentId || !counselor || !counselor.active || counselor.role !== 'counselor' || (counselor.accountStatus ?? 'approved') !== 'approved') fail('BAD_REQUEST');
          await db.students.add({ ...base, userId: id, studentNo: request.studentNo!, majorId: major.id, collegeId: major.parentId, cohortYear: request.cohortYear!, counselorId: counselor.id, enrolledAt: now, active: true });
          const resumeId = randomUUID(), versionId = randomUUID();
          const sections = { basic: { name: user.displayName, email: '', majorId: major.id, degree: null }, education: [], experience: [], projects: [], skills: [], certificates: [], intent: { cityIds: [], expectedSalary: null } };
          await db.resumes.add({ ...base, id: resumeId, studentId: base.id, sections, isPublic: false, versionIds: [versionId] });
          await db.resumeVersions.add({ id: versionId, resumeId, number: 1, snapshot: sections, reason: 'initial', createdAt: now });
          user.studentId = base.id;
        } else if (user.role === 'company') {
          await db.companies.add({ ...base, ownerUserId: id, name: user.accountRequest!.companyName!, industryId: '', cityId: '', scale: '', description: '', verified: false });
          user.companyId = base.id;
        } else fail('BAD_REQUEST');
      }
      await db.users.put({ ...user, accountStatus: input.decision === 'approve' ? 'approved' : 'rejected', accountReviewReason: reason, accountReviewedAt: now, accountReviewedBy: actor.userId, revision: user.revision + 1, updatedAt: now });
      await audit(actor.userId, id, input.decision === 'approve' ? 'APPROVE_ACCOUNT' : 'REJECT_ACCOUNT', reason);
      for (const userId of [id, actor.userId]) sql.prepare('INSERT INTO changes(user_id,created_at) VALUES(?,?)').run(userId, now);
      return read(id);
    });
  }
  return { register, read, list, invite, review };
}
