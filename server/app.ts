import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createSqlDatabase } from "./database";
import { createAuth } from "./auth";
import { createAccounts } from './accounts';
import { officialResources } from './public-resources';
import { createOpportunities } from './opportunities';
import { createPublicOpportunities } from './public-opportunities';
import { normalizeWorkspaceImage } from "./media";
import { createRepository, type Command } from "../src/services/repository";
import type { Actor } from "../src/types/identity";
import type { Json } from "../src/types/entities";
import { DomainError } from "../src/domain/errors";
import { createStaticServer } from "../scripts/start-demo.mjs";
import { createOnlineAi, type OnlineAiOptions } from './ai';
import { createWorkbench } from './workbench';

type Options = { databasePath: string; seed?: boolean; staticRoot?: string; secureCookies?: boolean; ai?: OnlineAiOptions };
const reading = new Set(["listStudents", "readResume", "readResumeHistory", "listApplications", "readApplication", "listJobs", "readCatalog", "readScopedSnapshot", "readCompanyWorkspace", "readAdminConsole", "readGovernance", "readTickets", "exportRedactedAudit", "listAttachments"]);
const commands = new Set(["SAVE_COMPANY_PROFILE", "SAVE_RESUME", "DECIDE_SUGGESTION", "APPLY", "APPLICATION_ACTION", "SAVE_JOB", "JOB_ACTION", "REVIEW_COMPANY", "REVIEW_JOB", "REASSIGN_STUDENT", "CREATE_TICKET", "TICKET_ACTION", "CREATE_ASSISTANCE", "ASSISTANCE_ACTION", "SAVE_DESTINATION", "DESTINATION_ACTION", "MOCK_ACTION", "CREATE_MOCK"]);
const payloadFields: Record<string, string[]> = {
  SAVE_COMPANY_PROFILE: ['name','industryId','cityId','scale','description'],
  CREATE_TICKET: ['body'], TICKET_ACTION: ['action', 'text'],
  REVIEW_COMPANY: ["verified", "reason"], REVIEW_JOB: ["decision", "reason"],
  REASSIGN_STUDENT: ["counselorId", "reason"],
  SAVE_RESUME: ["sections"],
  DECIDE_SUGGESTION: ["traceId", "suggestionId", "sourceResumeVersionId", "disposition", "fieldPath", "before", "after", "requiresUserInput", "evidence"],
  APPLY: ["jobId", "resumeConsent"], APPLICATION_ACTION: ["action", "reason", "scheduledAt", "location", "result", "feedback", "bothPartiesConsent", "offer"],
  SAVE_JOB: ["title", "categoryId", "industryId", "cityId", "salaryRange", "requiredSkills", "preferredMajorIds", "minDegree", "minExperienceMonths", "jdText", "deadline"], JOB_ACTION: ["action"],
  CREATE_ASSISTANCE: ["studentId", "alertRuleIds", "note", "studentPlan", "nextReviewAt"], ASSISTANCE_ACTION: ["action", "reviewNote", "confirmed", "nextReviewAt"],
  SAVE_DESTINATION: ["studentId", "type", "source", "applicationId", "agreementId", "organizationName", "industryId", "attachmentIds"], DESTINATION_ACTION: ["action", "reason"], MOCK_ACTION: ["action", "text"], CREATE_MOCK: ["targetJobId"],
};
const commandClock = { now: () => new Date().toISOString() };
const applicationNotice:Record<string,string>={
  START_SCREEN:'企业已查看简历并开始筛选', SCHEDULE_INTERVIEW:'企业已发送面试邀约，请回应',
  RESCHEDULE:'企业已调整面试安排，请重新确认', CONFIRM_INTERVIEW:'学生已确认面试邀约',
  DECLINE_INTERVIEW:'学生已婉拒本次面试', REQUEST_RESCHEDULE:'学生申请面试改期，请回应',
  COMPLETE_INTERVIEW:'企业已提交面试结果与反馈', CANCEL_INTERVIEW:'企业已取消面试安排',
  REJECT:'企业已反馈本次申请结果', WITHDRAW:'学生已撤回申请',
  ISSUE_OFFER_DOCUMENT:'企业已发送录用意向文书，请核对', ACCEPT_OFFER:'学生已接受录用意向',
  DECLINE_OFFER:'学生已婉拒录用意向', WITHDRAW_OFFER:'企业已撤回录用意向',
  CREATE_AGREEMENT:'企业已创建就业协议', CONFIRM_AGREEMENT:'就业协议确认进度已更新', TERMINATE_AGREEMENT:'就业协议已解除',
};
function noticeTitle(type:string,action?:string) {
  if(type==='APPLY')return '收到新的简历投递';
  if(type==='APPLICATION_ACTION')return applicationNotice[action??'']??'招聘流程有新进展';
  if(['CREATE_TICKET','TICKET_ACTION'].includes(type))return '站内服务工单已更新';
  if(type==='REASSIGN_STUDENT')return '学生支持服务归属已更新';
  if(['CREATE_ASSISTANCE','ASSISTANCE_ACTION'].includes(type))return '辅导员行动计划已更新';
  return type==='DESTINATION_ACTION'?'去向审核状态已更新':'招聘流程有新进展';
}
function failure(code: string): never { throw Error(code); }
async function body(request: IncomingMessage, max = 3 * 1024 * 1024): Promise<Record<string, unknown>> {
  if (!request.headers["content-type"]?.startsWith("application/json")) failure("VALIDATION_ERROR");
  let length = 0; const chunks: Buffer[] = [];
  for await (const chunk of request) { length += chunk.length; if (length > max) failure("PAYLOAD_TOO_LARGE"); chunks.push(chunk); }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) failure("VALIDATION_ERROR");
    return parsed as Record<string, unknown>;
  } catch { failure("VALIDATION_ERROR"); }
}
function checkCommand(value: Record<string, unknown>): Command {
  if (Object.keys(value).some((k) => !["type", "commandId", "entityId", "expectedRevision", "payload"].includes(k)) ||
    !commands.has(String(value.type)) || typeof value.commandId !== "string" || value.commandId.length > 128 ||
    typeof value.entityId !== "string" || value.entityId.length > 128 ||
    !Number.isInteger(value.expectedRevision) || Number(value.expectedRevision) < 0 ||
    !value.payload || typeof value.payload !== "object" || Array.isArray(value.payload)) failure("VALIDATION_ERROR");
  if (Object.keys(value.payload).some(k => !payloadFields[String(value.type)]!.includes(k))) failure("VALIDATION_ERROR");
  // Legacy intent-only events remain readable, but new online offers require terms and a student decision.
  if (value.type === 'APPLICATION_ACTION' && (value.payload as Record<string, unknown>).action === 'ISSUE_OFFER') failure('INVALID_TRANSITION');
  return value as unknown as Command;
}
function status(error: unknown): [number, string] {
  const code = error instanceof DomainError ? error.code : error instanceof Error ? error.message : "INTERNAL_ERROR";
  if (code === 'BAD_REQUEST') return [400, code];
  if (["UNAUTHORIZED", "INVALID_CREDENTIALS"].includes(code)) return [401, code];
  if (["FORBIDDEN", "CSRF_INVALID"].includes(code)) return [403, code];
  if (["REVISION_CONFLICT", "COMMAND_COLLISION", "ALREADY_APPLIED", "ALREADY_EXISTS", "ACTIVE_AGREEMENT_EXISTS"].includes(code) || code.includes("UNIQUE constraint")) return [409, code.includes("constraint") ? "CONFLICT" : code];
  if (["RATE_LIMITED", "BUDGET_EXCEEDED", "QUOTA_EXCEEDED"].includes(code)) return [429, code];
  if (code === 'PROVIDER_DISABLED') return [503, code];
  if (code === 'TIMEOUT') return [504, code];
  if (['UPSTREAM_ERROR', 'AUTH_FAILED', 'SCHEMA_INVALID', 'SEMANTIC_INVALID'].includes(code)) return [502, code];
  if (code === 'CANCELLED') return [408, code];
  if (code === "PAYLOAD_TOO_LARGE") return [413, code];
  if (code === "NOT_FOUND") return [404, code];
  if (["VALIDATION_ERROR", "INPUT_BLOCKED", "INVALID_TRANSITION", "REQUIRES_USER_INPUT", "STALE_SUGGESTION", "ALREADY_DECIDED", "QUESTION_COVERAGE_LIMITED"].includes(code)) return [422, code];
  if (error instanceof TypeError || error instanceof SyntaxError) return [422, "VALIDATION_ERROR"];
  return [500, "INTERNAL_ERROR"];
}

export async function createOnlineApp(options: Options) {
  const database = createSqlDatabase(options.databasePath), { db, sql, transaction } = database;
  const repository = createRepository(db, { clock: commandClock, requireJobReview: true });
  if (options.seed) await repository.initialize();
  else if (!(await db.users.count())) { await database.close(); throw Error("Database not initialized; run init explicitly"); }
  const auth = createAuth(sql, db);
  const accounts = createAccounts(sql, db, auth);
  const opportunities = createOpportunities(database);
  const publicOpportunities = createPublicOpportunities(database, opportunities);
  const ai = createOnlineAi(db, repository, transaction, options.ai);
  const streams = new Set<{ actor: Actor; tokenHash: string; cookie: string; last: number; response: ServerResponse }>();
  let poller: ReturnType<typeof setInterval> | undefined;
  let publishing: Promise<void> | undefined;
  function stopIdlePoller() { if (!streams.size && poller) { clearInterval(poller); poller = undefined; } }
  const staticServer = options.staticRoot ? createStaticServer(options.staticRoot) : null;
  const cookie = (token: string, expire = false) => `cp_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${expire ? 0 : 28800}${options.secureCookies ? "; Secure" : ""}`;
  const send = (res: ServerResponse, data: unknown, code = 200) => {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    res.end(JSON.stringify(data));
  };
  const workbench = createWorkbench(database, repository, publicOpportunities, options.ai, body, send);
  async function committed(actor: Actor, type: string, entityId: string, action?: string) {
    // Recipients are resolved from trusted relationships, never request-provided IDs.
    const recipients = new Set([actor.userId]);
    const application = await db.applications.get(entityId);
    if (application) {
      const student = await db.students.get(application.studentId), job = await db.jobs.get(application.jobId);
      const company = job && await db.companies.get(job.companyId);
      if (student) recipients.add(student.userId);
      if (company) recipients.add(company.ownerUserId);
    }
    const destination = await db.destinations.get(entityId);
    if (destination) {
      const student = await db.students.get(destination.studentId);
      if (student) { recipients.add(student.userId); recipients.add(student.counselorId); }
    }
    if (type === "REASSIGN_STUDENT") {
      const student = await db.students.get(entityId);
      if (student) { recipients.add(student.userId); recipients.add(student.counselorId); }
      const log = (await db.auditLogs.toArray()).filter(a => a.entityId === entityId && a.action === type).at(-1);
      if (log?.before?.counselorId) recipients.add(log.before.counselorId);
    }
    if (["CREATE_ASSISTANCE", "ASSISTANCE_ACTION"].includes(type)) {
      const assistance = await db.assistance.get(entityId);
      if (assistance) {
        recipients.add(assistance.counselorId);
        const student = await db.students.get(assistance.studentId);
        if (student && assistance.studentPlan?.trim()) recipients.add(student.userId);
      }
    }
    if (["SAVE_COMPANY_PROFILE", "SAVE_JOB", "JOB_ACTION", "REVIEW_JOB", "REVIEW_COMPANY"].includes(type)) for (const user of await db.users.toArray()) if (user.active) recipients.add(user.id);
    if (['CREATE_TICKET','TICKET_ACTION'].includes(type)) {
      const ticket = await db.feedback.get(entityId);
      const owner = ticket?.ownerUserId ?? (ticket?.studentId ? (await db.students.get(ticket.studentId))?.userId : undefined);
      if (owner) recipients.add(owner);
      for (const admin of await db.users.toArray()) if (admin.active && admin.role === 'admin') recipients.add(admin.id);
    }
    for (const userId of recipients) {
      const now = commandClock.now();
      sql.prepare("INSERT INTO changes(user_id,created_at) VALUES(?,?)").run(userId, now);
      if (userId !== actor.userId && !["SAVE_COMPANY_PROFILE", "SAVE_JOB", "JOB_ACTION", "REVIEW_JOB", "REVIEW_COMPANY"].includes(type)) await db.notifications.add({
        id: crypto.randomUUID(), revision: 1, createdAt: now, updatedAt: now,
        userId, type, title:noticeTitle(type,action), entityId, readAt: null,
      });
    }
  }
  async function publish() {
    if (publishing) return publishing;
    publishing = (async () => {
      for (const stream of streams) {
        try {
          const current = await auth.session(stream.cookie);
          if (!current || current.accountStatus !== 'approved' || current.actor.role !== stream.actor.role || stream.response.writableEnded || stream.response.destroyed) {
            stream.response.end(); streams.delete(stream); continue;
          }
          // Do not queue unlimited signals for a slow reader. The next poll sends the latest sequence.
          if (stream.response.writableNeedDrain) continue;
          const last = sql.prepare("SELECT MAX(seq) AS n FROM changes WHERE user_id=?").get(stream.actor.userId);
          const sequence = Number(last?.n ?? 0);
          if (sequence > stream.last) {
            stream.response.write(`id: ${sequence}\nevent: change\ndata: {}\n\n`);
            stream.last = sequence;
          }
        } catch { stream.response.end(); streams.delete(stream); }
      }
    })();
    try { await publishing; } finally { publishing = undefined; stopIdlePoller(); }
  }
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost"), path = url.pathname;
    if (path === "/runtime.js") {
      response.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
      response.end("window.__CAREERPILOT_ONLINE__=true;"); return;
    }
    if (!path.startsWith("/api/")) {
      if (staticServer) { staticServer.emit("request", request, response); return; }
      send(response, { error: "NOT_FOUND" }, 404); return;
    }
    try {
      if (request.headers.origin && request.headers.origin !== `${options.secureCookies ? "https" : "http"}://${request.headers.host}`) failure("FORBIDDEN");
      if (request.headers["sec-fetch-site"] === "cross-site") failure("FORBIDDEN");
      if (path === "/api/health" && request.method === "GET") { send(response, { status: "ok", schema: Number(sql.prepare("SELECT MAX(version) AS n FROM schema_migrations").get()!.n) }); return; }
      if (path === '/api/register' && request.method === 'POST') {
        send(response, await accounts.register(await body(request, 8192), request.socket.remoteAddress ?? 'unknown'), 201); return;
      }
      if (path === '/api/public/catalog' && request.method === 'GET') {
        const colleges = await db.dictionaries.where('kind').equals('college').toArray();
        send(response, { majors: (await db.dictionaries.where('kind').equals('major').toArray()).filter(d => d.active).map(d => ({ id: d.id, label: d.label, collegeLabel: colleges.find(c => c.id === d.parentId)?.label ?? '' })) }); return;
      }
      if (path === '/api/public/resources' && request.method === 'GET') { send(response, { resources: officialResources }); return; }
      if (path === '/api/public/opportunities' && request.method === 'GET') { send(response, await transaction(() => publicOpportunities.list(url.searchParams))); return; }
      if (path.startsWith('/api/public/opportunities/') && request.method === 'GET') { send(response, await transaction(() => publicOpportunities.detail(decodeURIComponent(path.slice('/api/public/opportunities/'.length))))); return; }
      if (path === "/api/session" && request.method === "POST") {
        const payload = await body(request, 4096);
        if (typeof payload.login !== "string" || typeof payload.password !== "string" || payload.login.length > 128 || payload.password.length > 256) failure("VALIDATION_ERROR");
        const result = await auth.login(payload.login.trim(), payload.password, request.socket.remoteAddress ?? "unknown");
        response.setHeader("Set-Cookie", cookie(result.token));
        send(response, { actor: result.actor, csrf: result.csrf, displayName: result.displayName, accountStatus: result.accountStatus }); return;
      }
      if (path === "/api/public/jobs" && request.method === "GET") {
        const verifiedCompanies = new Set((await db.companies.toArray()).filter(c => c.verified).map(c => c.id));
        const result = await transaction(async () => ({
          jobs: (await db.jobs.where("status").equals("published").toArray()).filter((j) => j.deadline > commandClock.now() && verifiedCompanies.has(j.companyId)).map((j) => ({ id: j.id, title: j.title, companyId: j.companyId, cityId: j.cityId, salaryRange: j.salaryRange })),
          companies: (await db.companies.toArray()).filter(c => verifiedCompanies.has(c.id)).filter(c => sql.prepare("SELECT 1 FROM jobs WHERE json_extract(data,'$.companyId')=? AND json_extract(data,'$.status')='published' AND json_extract(data,'$.deadline')>? LIMIT 1").get(c.id, commandClock.now())).map((c) => ({ id: c.id, name: c.name })),
          cities: (await db.dictionaries.where("kind").equals("city").toArray()).map((c) => ({ id: c.id, label: c.label })),
        }));
        send(response, result); return;
      }
      const current = await auth.session(request.headers.cookie);
      if (!current) failure("UNAUTHORIZED");
      const { actor } = current;
      if (!["GET", "HEAD"].includes(request.method ?? "") && request.headers["x-csrf-token"] !== current.csrf) failure("CSRF_INVALID");
      if (path === "/api/session" && request.method === "GET") { send(response, { actor, csrf: current.csrf, displayName: current.displayName, accountStatus: current.accountStatus }); return; }
      if (path === '/api/account' && request.method === 'GET') { send(response, await accounts.read(actor.userId)); return; }
      if (path === '/api/account/password' && request.method === 'POST') {
        const value = await body(request, 4096);
        if (Object.keys(value).some(k => !['currentPassword','newPassword'].includes(k)) || typeof value.currentPassword !== 'string' || typeof value.newPassword !== 'string' || value.currentPassword.length > 256) failure('BAD_REQUEST');
        await auth.changePassword(actor.userId, value.currentPassword, value.newPassword);
        response.setHeader('Set-Cookie', cookie('', true)); send(response, { ok: true }); await publish(); return;
      }
      if (path === "/api/logout" && request.method === "POST") {
        await auth.logout(current.tokenHash); response.setHeader("Set-Cookie", cookie("", true));
        for (const stream of streams) if (stream.tokenHash === current.tokenHash) { stream.response.end(); streams.delete(stream); }
        stopIdlePoller();
        send(response, { ok: true }); return;
      }
      if (current.accountStatus !== 'approved') failure('FORBIDDEN');
      if (path.startsWith('/api/workbench/')) {
        await workbench.handle(request, response, actor, path, async () => {
          const next = await auth.session(request.headers.cookie);
          return !!next && next.accountStatus === 'approved' && next.actor.userId === actor.userId && next.actor.role === actor.role;
        }); return;
      }
      if (path === '/api/admin/opportunities/sync' && request.method === 'POST') {
        const payload = await body(request, 1024); if (Object.keys(payload).length) failure('VALIDATION_ERROR');
        send(response, await opportunities.sync(actor, undefined, async () => {
          const latest = await auth.session(request.headers.cookie); return latest?.accountStatus === 'approved' && latest.actor.role === 'admin';
        })); await publish(); return;
      }
      if (path === '/api/admin/opportunities' || path === '/api/admin/opportunities/review' || path === '/api/opportunity-records') {
        const result = await transaction(async () => {
          if ((await auth.session(request.headers.cookie))?.accountStatus !== 'approved') failure('UNAUTHORIZED');
          if (path === '/api/admin/opportunities' && request.method === 'GET') return opportunities.admin(actor);
          if (path === '/api/admin/opportunities/review' && request.method === 'POST') return opportunities.review(actor, await body(request, 4096));
          if (path === '/api/opportunity-records' && request.method === 'GET') return opportunities.records(actor);
          if (path === '/api/opportunity-records' && request.method === 'POST') return opportunities.saveRecord(actor, await body(request, 8192));
          failure('NOT_FOUND');
        }); send(response, result); if (request.method === 'POST') await publish(); return;
      }
      if (path.startsWith('/api/admin/accounts')) {
        const result = await transaction(async () => {
          const latest = await auth.session(request.headers.cookie);
          if (!latest || latest.accountStatus !== 'approved') failure('UNAUTHORIZED');
          if (path === '/api/admin/accounts' && request.method === 'GET') return accounts.list(actor);
          if (path === '/api/admin/accounts/invite' && request.method === 'POST') return accounts.invite(actor, await body(request, 4096));
          if (path === '/api/admin/accounts/review' && request.method === 'POST') return accounts.review(actor, await body(request, 4096));
          failure('NOT_FOUND');
        });
        send(response, result, path.endsWith('/invite') ? 201 : 200); await publish(); return;
      }
      if (path === "/api/events" && request.method === "GET") {
        response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
        response.write("retry: 3000\n\n");
        const last = sql.prepare("SELECT MAX(seq) AS n FROM changes WHERE user_id=?").get(actor.userId);
        response.write(`id: ${last?.n ?? 0}\nevent: change\ndata: {}\n\n`);
        const stream = { actor, tokenHash: current.tokenHash, cookie: request.headers.cookie ?? "", last: Number(last?.n ?? 0), response };
        streams.add(stream);
        // A single app-level scan, not one all-subscriber scan per connection.
        poller ??= setInterval(() => {
          void publish().then(() => {
            for (const s of streams) if (!s.response.writableEnded && !s.response.writableNeedDrain) s.response.write(": heartbeat\n\n");
          }).catch(() => { for (const s of streams) s.response.end(); streams.clear(); stopIdlePoller(); });
        }, 1_000);
        request.on("close", () => { streams.delete(stream); stopIdlePoller(); }); return;
      }
      if (path === '/api/ai/status' && request.method === 'GET') { send(response, ai.status()); return; }
      if (path === '/api/ai/prepare' && request.method === 'POST') {
        const value = await body(request, 8192);
        send(response, await transaction(async () => {
          if ((await auth.session(request.headers.cookie))?.accountStatus !== 'approved') failure('UNAUTHORIZED');
          return ai.prepare(actor, current.tokenHash, value);
        })); return;
      }
      if (path === '/api/ai/confirm' && request.method === 'POST') {
        const value = await body(request, 4096), controller = new AbortController();
        const closed = () => { if (!response.writableEnded) controller.abort(); };
        response.on('close', closed);
        try { send(response, await ai.confirm(actor, current.tokenHash, value, async () => {
          const next = await auth.session(request.headers.cookie);
          return !!next && next.accountStatus === 'approved' && next.actor.userId === actor.userId && next.actor.role === actor.role;
        }, controller.signal)); } finally { response.off('close', closed); }
        return;
      }
      const result = await transaction(async () => {
        // Re-check after waiting for the transaction lock (account may have been disabled).
        if ((await auth.session(request.headers.cookie))?.accountStatus !== 'approved') failure("UNAUTHORIZED");
        if (path.startsWith("/api/read/") && request.method === "GET") {
          const method = path.slice(10);
          if (!reading.has(method)) failure("NOT_FOUND");
          const args: unknown = JSON.parse(url.searchParams.get("args") ?? "[]");
          if (!Array.isArray(args) || args.length > 1 || args.some((a) => typeof a !== "string" || a.length > 128)) failure("VALIDATION_ERROR");
          const fn = repository[method as keyof typeof repository] as (...args: unknown[]) => Promise<unknown>;
          let value = await fn(actor, ...args);
          if (method === "listAttachments") value = (value as Record<string, unknown>[]).map((file) => { const metadata = { ...file }; delete metadata.blob; return metadata; });
          if (method === "readAdminConsole") value = { ...(value as object), sources: { seed: options.seed ? "legacy-test-fixture" : "service-accounts", storage: "SQLite / server", aiMode: ai.status().enabled ? 'AI / per-request consent' : "RULE" } };
          if (method === "exportRedactedAudit") value = { ...(value as object), exportedAt: commandClock.now() };
          return value;
        }
        if (path === "/api/commands" && request.method === "POST") {
          const command = checkCommand(await body(request));
          const exists = await db.commandReceipts.get(command.commandId);
          const value = await repository.execute(command, actor, commandClock);
          if (!exists) await committed(actor, command.type, command.entityId, 'action' in command.payload ? String(command.payload.action) : undefined);
          return value;
        }
        if (path === "/api/bookmarks") {
          if (actor.role !== "student") failure("FORBIDDEN");
          if (request.method === "POST") {
            const p = await body(request, 4096);
            if (typeof p.jobId !== "string" || typeof p.saved !== "boolean" || !(await db.jobs.get(p.jobId))) failure("VALIDATION_ERROR");
            if (p.saved) sql.prepare("INSERT OR IGNORE INTO bookmarks VALUES(?,?)").run(actor.userId, p.jobId);
            else sql.prepare("DELETE FROM bookmarks WHERE user_id=? AND job_id=?").run(actor.userId, p.jobId);
            sql.prepare("INSERT INTO changes(user_id,created_at) VALUES(?,?)").run(actor.userId, commandClock.now());
          } else if (request.method !== "GET") failure("NOT_FOUND");
          return sql.prepare("SELECT job_id FROM bookmarks WHERE user_id=? ORDER BY job_id").all(actor.userId).map((r) => r.job_id);
        }
        if (path === "/api/me/media") {
          const previous = sql.prepare("SELECT * FROM workspace_media WHERE user_id=?").get(actor.userId);
          if (request.method === "POST") {
            const p = await body(request);
            if (Object.keys(p).some(k => !["base64", "mime", "expectedRevision", "remove"].includes(k)) || !Number.isInteger(p.expectedRevision) || Number(p.expectedRevision) < 0) failure("VALIDATION_ERROR");
            if (p.expectedRevision !== Number(previous?.revision ?? 0)) failure("REVISION_CONFLICT");
            if (p.remove !== undefined && p.remove !== true) failure("VALIDATION_ERROR");
            const content = p.remove === true ? null : await normalizeWorkspaceImage(p.base64, p.mime);
            sql.prepare("INSERT INTO workspace_media VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,base64=excluded.base64,updated_at=excluded.updated_at").run(actor.userId, Number(p.expectedRevision) + 1, content, commandClock.now());
            sql.prepare("INSERT INTO changes(user_id,created_at) VALUES(?,?)").run(actor.userId, commandClock.now());
          } else if (request.method !== "GET") failure("NOT_FOUND");
          const current = sql.prepare("SELECT * FROM workspace_media WHERE user_id=?").get(actor.userId);
          return { revision: Number(current?.revision ?? 0), base64: current?.base64 ?? null, mime: "image/jpeg" };
        }
        if (path === "/api/notifications") {
          if (request.method === "POST") {
            const p = await body(request, 4096);
            if (typeof p.id !== "string") failure("VALIDATION_ERROR");
            const notice = await db.notifications.get(p.id);
            if (!notice || notice.userId !== actor.userId) failure("FORBIDDEN");
            await db.notifications.update(notice.id, { readAt: commandClock.now(), revision: notice.revision + 1 });
            sql.prepare("INSERT INTO changes(user_id,created_at) VALUES(?,?)").run(actor.userId, commandClock.now());
          } else if (request.method !== "GET") failure("NOT_FOUND");
          return (await db.notifications.where("userId").equals(actor.userId).toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        }
        if (path === "/api/admin/users") {
          if (actor.role !== "admin") failure("FORBIDDEN");
          if (request.method === "POST") {
            const p = await body(request, 4096);
            if (typeof p.userId !== "string" || typeof p.active !== "boolean" || p.userId === actor.userId) failure("VALIDATION_ERROR");
            const user = await db.users.get(p.userId); if (!user) failure("NOT_FOUND");
            if ((user.accountStatus ?? 'approved') !== 'approved') failure('FORBIDDEN');
            await db.users.update(user.id, { active: p.active, revision: user.revision + 1, updatedAt: commandClock.now() });
            sql.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
            const counter = await db.configs.where("key").equals("auditSequence").first();
            if (!counter || typeof counter.value !== "number") failure("DATABASE_INVALID");
            const sequence = counter.value + 1;
            await db.configs.update(counter.id, { value: sequence, revision: counter.revision + 1, updatedAt: commandClock.now() });
            await db.auditLogs.add({ id: crypto.randomUUID(), sequence, actorUserId: actor.userId, entityType: "User", entityId: user.id, action: p.active ? "ENABLE_USER" : "DISABLE_USER", at: commandClock.now(), reason: null, commandId: crypto.randomUUID(), before: { active: user.active }, after: { active: p.active } });
          }
          return (await db.users.toArray()).map((u) => ({ id: u.id, login: u.login, displayName: u.displayName, role: u.role, active: u.active, accountStatus: u.accountStatus ?? 'approved' }));
        }
        if (path === "/api/attachments" && request.method === "POST") {
          const p = await body(request);
          if (typeof p.base64 !== "string" || typeof p.fileName !== "string" || typeof p.mime !== "string") failure("VALIDATION_ERROR");
          const bytes = Buffer.from(p.base64, "base64");
          const pdf = p.mime === "application/pdf" && bytes.subarray(0, 5).toString() === "%PDF-";
          const png = p.mime === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
          const jpg = p.mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
          if (!pdf && !png && !jpg) failure("VALIDATION_ERROR");
          const attachment = await repository.addAttachment(actor, { fileName: p.fileName.replace(/[\\/]/g, "_"), blob: new Blob([bytes], { type: p.mime }) }, commandClock);
          const meta: Record<string, unknown> = { ...attachment }; delete meta.blob; return meta;
        }
        if (path.startsWith("/api/attachments/") && request.method === "GET") {
          const file = await repository.readAttachment(actor, path.slice(17));
          return { ...file, blob: undefined, base64: Buffer.from(await file.blob.arrayBuffer()).toString("base64") };
        }
        if (path === "/api/ai-runs" && request.method === "POST") {
          // Client-side RULE/REPLAY telemetry is not trusted upstream-call evidence.
          return { recorded: false };
        }
        failure("NOT_FOUND");
      });
      send(response, result);
      if (request.method === "POST") await publish();
    } catch (error) {
      const [code, reason] = status(error);
      if (!response.headersSent) send(response, { error: reason }, code);
      else response.end();
    }
  });
  server.headersTimeout = 15_000; server.requestTimeout = 30_000;
  let closed = false;
  return {
    server, repository, provision: auth.provision,
    listen: (port: number, host = "127.0.0.1") => new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, host, () => { server.off("error", reject); resolve(); }); }),
    close: async () => {
      if (closed) return; closed = true;
      ai.close();
      for (const s of streams) s.response.end(); streams.clear(); stopIdlePoller();
      await publishing;
      if (server.listening) await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeIdleConnections(); });
      await database.close();
    },
  };
}

export type OnlineResult = Json;
