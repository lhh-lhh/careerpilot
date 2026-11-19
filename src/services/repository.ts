import canonicalize from "canonicalize";
import type { RunRecord } from "../adapters/ai/types";
import type { Database } from "../adapters/repository/db";
import type { Actor } from "../types/identity";
import type {
  Application,
  AuditLog,
  CommandReceipt,
  EntityMap,
  Json,
  ResumeSections,
  SeedPack,
  User,
} from "../types/entities";
import type { Clock } from "../domain/clock";
import { FIXED_NOW } from "../domain/clock";
import { createSeedPack, validateSeedPack } from "../data/seed/seed";
import { DomainError, requireCondition } from "../domain/errors";
import {
  executeRecruiting,
  type RecruitingCommand,
} from "./recruiting-command";
import { executeWorkflow, type WorkflowCommand } from "./workflow-command";
import {
  executeSuggestion,
  type SuggestionCommand,
} from "./suggestion-command";
import { executeJob, type JobCommand } from "./job-command";
import { executeCompanyProfile, type CompanyCommand } from './company-command';
import { executeGovernance, type GovernanceCommand } from "./governance-command";
import { executeTicket, type TicketCommand } from './ticket-command';
import {
  executeOperation,
  type OperationCommand,
} from "./operation-command";
import {
  isLocalDate,
  validRange,
  DEGREE_LEVEL,
} from "../domain/matching/scoring";

export type Command =
  | RecruitingCommand
  | WorkflowCommand
  | SuggestionCommand
  | JobCommand
  | CompanyCommand
  | OperationCommand
  | GovernanceCommand
  | TicketCommand
  | {
      type: "SAVE_RESUME";
      commandId: string;
      entityId: string;
      expectedRevision: number;
      payload: { sections: ResumeSections };
    };
export interface RuntimeHooks {
  requireJobReview?: boolean;
  clock?: Clock;
  afterWrite?: () => void;
  invalidate?: () => void;
  committed?: () => void;
}
export function storageMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "QuotaExceededError")
    return "本机存储空间不足，草稿未丢弃。请导出必要内容、释放空间后重试。";
  if (name === "VersionError" || name === "DatabaseClosedError")
    return "数据库暂时无法打开。请关闭其他旧版标签页后重试，不会自动清空数据。";
  return "本机数据库操作失败，未切换为易丢失的内存存储。请重试并保留当前草稿。";
}
export function createRepository(db: Database, hooks: RuntimeHooks = {}) {
  let epoch = 0;
  const allTables = () => db.tables;
  async function getUser(actor: Actor): Promise<User> {
    const user = await db.users.get(actor.userId);
    requireCondition(
      user?.active && user.role === actor.role,
      "FORBIDDEN",
      "当前演示身份已失效，请重新选择角色。",
    );
    return user;
  }
  async function canReadStudent(
    actor: Actor,
    studentId: string,
  ): Promise<User> {
    const user = await getUser(actor),
      student = await db.students.get(studentId);
    requireCondition(
      student &&
        (actor.role === "admin" ||
          (actor.role === "student" && user.studentId === studentId) ||
          (actor.role === "counselor" && student.counselorId === user.id)),
      "FORBIDDEN",
    );
    return user;
  }
  async function nextAudit(data: Omit<AuditLog, "id" | "sequence">) {
    const config = await db.configs
      .where("key")
      .equals("auditSequence")
      .first();
    requireCondition(
      config && typeof config.value === "number",
      "DATABASE_INVALID",
    );
    const sequence = config.value + 1;
    await db.configs.update(config.id, {
      value: sequence,
      revision: config.revision + 1,
      updatedAt: data.at,
    });
    await db.auditLogs.add({ ...data, sequence, id: crypto.randomUUID() });
  }
  async function initialize() {
    await db.open();
    await db.transaction("rw", allTables(), async () => {
      if (await db.configs.where("key").equals("seedVersion").count()) return;
      requireCondition(
        (await Promise.all(allTables().map((t) => t.count()))).every(
          (n) => n === 0,
        ),
        "DATABASE_INVALID",
        "发现未初始化的已有数据，拒绝覆盖。",
      );
      await importPack(createSeedPack());
    });
  }
  async function importPack(pack: SeedPack) {
    const errors = validateSeedPack(pack);
    requireCondition(errors.length === 0, "INVALID_SEED", errors.join(", "));
    for (const table of allTables())
      await table.bulkAdd(pack[table.name as keyof SeedPack]);
  }
  async function resetDemo(actor: Actor, pack = createSeedPack()) {
    requireCondition(actor.role === "admin", "FORBIDDEN");
    await getUser(actor);
    epoch++;
    hooks.invalidate?.();
    requireCondition(validateSeedPack(pack).length === 0, "INVALID_SEED");
    await db.transaction("rw", allTables(), async () => {
      for (const table of allTables()) await table.clear();
      await importPack(pack);
      hooks.afterWrite?.();
    });
    hooks.committed?.();
  }
  async function listStudents(actor: Actor) {
    const user = await getUser(actor);
    requireCondition(actor.role !== "company", "FORBIDDEN");
    if (actor.role === "student")
      return user.studentId
        ? db.students.where("id").equals(user.studentId).toArray()
        : [];
    if (actor.role === "counselor")
      return db.students.where("counselorId").equals(user.id).toArray();
    return db.students.toArray();
  }
  async function appendAiRun(
    actor: Actor,
    run: RunRecord,
    capturedEpoch: number,
  ) {
    requireCondition(actor.userId === run.actorUserId, "FORBIDDEN");
    await db.transaction("rw", db.users, db.aiRuns, async () => {
      // Reset/clear invalidates old work before its transaction starts. Never
      // recreate an old user's record after their data has been erased.
      if (capturedEpoch !== epoch) return;
      const user = await getUser(actor);
      if (capturedEpoch !== epoch) return;
      const metadata: EntityMap["aiRuns"] = {
        id: crypto.randomUUID(),
        studentId: user.studentId,
        actorUserId: user.id,
        module: run.module,
        operation: run.operation,
        requestedMode: run.requestedMode,
        effectiveMode: run.effectiveMode,
        origin: run.origin,
        traceId: run.traceId,
        inputHash: run.inputHash,
        promptVersion: run.promptVersion,
        schemaVersion: run.schemaVersion,
        algorithmVersion: run.algorithmVersion,
        domainRevision: run.domainRevision,
        masked: run.masked,
        status: run.status,
        fallbackReason: run.fallbackReason,
        usage: run.usage
          ? { prompt: run.usage.prompt, completion: run.usage.completion }
          : null,
        durationMs: run.durationMs,
      };
      await db.aiRuns.add(metadata);
    });
  }
  async function readResume(actor: Actor, studentId: string) {
    await canReadStudent(actor, studentId);
    const resume = await db.resumes
      .where("studentId")
      .equals(studentId)
      .first();
    requireCondition(resume, "NOT_FOUND");
    if (actor.role === "admin")
      await db.transaction("rw", db.configs, db.auditLogs, () =>
        nextAudit({
          actorUserId: actor.userId,
          entityType: "Resume",
          entityId: resume.id,
          action: "ADMIN_READ_RESUME",
          at: hooks.clock?.now() ?? FIXED_NOW,
          reason: "管理员查看简历",
          commandId: crypto.randomUUID(),
          before: null,
          after: { studentId },
        }),
      );
    return resume;
  }
  async function readResumeHistory(actor: Actor, studentId: string) {
    const resume = await readResume(actor, studentId);
    const versions = await db.resumeVersions.bulkGet(resume.versionIds);
    return versions
      .filter(
        (version): version is NonNullable<typeof version> =>
          !!version && version.resumeId === resume.id,
      )
      .sort((a, b) => a.number - b.number);
  }
  async function listApplications(actor: Actor): Promise<Application[]> {
    const user = await getUser(actor);
    if (actor.role === "student")
      return db.applications
        .where("studentId")
        .equals(user.studentId!)
        .toArray();
    if (actor.role === "company") {
      const jobs = await db.jobs
        .where("companyId")
        .equals(user.companyId!)
        .primaryKeys();
      return db.applications
        .where("jobId")
        .anyOf(jobs)
        .filter((a) => a.resumeConsent)
        .toArray();
    }
    const ids = (await listStudents(actor)).map((s) => s.id);
    return db.applications.where("studentId").anyOf(ids).toArray();
  }
  async function readApplication(actor: Actor, id: string) {
    const application = (await listApplications(actor)).find(
      (a) => a.id === id,
    );
    requireCondition(application, "FORBIDDEN");
    return application;
  }
  async function execute(
    command: Command,
    actor: Actor,
    clock: Clock,
  ): Promise<Json> {
    requireCondition(
      command.commandId.length > 0 &&
        command.entityId.length > 0 &&
        Number.isInteger(command.expectedRevision),
      "VALIDATION_ERROR",
    );
    const canonical = canonicalize({
      type: command.type,
      entityId: command.entityId,
      expectedRevision: command.expectedRevision,
      payload: command.payload,
    });
    requireCondition(canonical, "VALIDATION_ERROR");
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonical),
    );
    const payloadHash = Array.from(new Uint8Array(bytes), (x) =>
      x.toString(16).padStart(2, "0"),
    ).join("");
    const result = await db.transaction("rw", allTables(), async () => {
      const user = await getUser(actor);
      const receipt = await db.commandReceipts.get(command.commandId);
      if (receipt) {
        requireCondition(
          receipt.actorUserId === actor.userId &&
            receipt.payloadHash === payloadHash,
          "COMMAND_COLLISION",
        );
        return receipt.result;
      }
      const now = clock.now();
      let result: Json;
      if (command.type === "SAVE_RESUME") {
        const resume = await db.resumes.get(command.entityId);
        requireCondition(
          resume &&
            user.role === "student" &&
            user.studentId === resume.studentId,
          "FORBIDDEN",
        );
        requireCondition(
          resume.revision === command.expectedRevision,
          "REVISION_CONFLICT",
        );
        const sections = normalizeSections(command.payload.sections);
        for(const certificate of sections.certificates)for(const id of certificate.attachmentIds??[]) {
          const attachment=await db.attachments.get(id);
          requireCondition(attachment?.studentId===resume.studentId,'FORBIDDEN','只能引用本人上传的证书文件。');
        }
        const knownSkills = new Set(
          await db.skillOntology.toCollection().primaryKeys(),
        );
        const dictionary = await db.dictionaries.toArray();
        requireCondition(
          sections.skills.every((s) => knownSkills.has(s.skillId)) &&
            [
              sections.basic.majorId,
              ...sections.education.map((e) => e.majorId),
            ].every(
              (id) =>
                id === null ||
                dictionary.some((d) => d.kind === "major" && d.id === id),
            ) &&
            sections.intent.cityIds.every((id) =>
              dictionary.some((d) => d.kind === "city" && d.id === id),
            ),
          "VALIDATION_ERROR",
          "技能、专业或城市已失效，请重新选择。",
        );
        const versionId = crypto.randomUUID(),
          revision = resume.revision + 1;
        await db.resumes.put({
          ...resume,
          revision,
          updatedAt: now,
          sections,
          versionIds: [...resume.versionIds, versionId],
        });
        await db.resumeVersions.add({
          id: versionId,
          resumeId: resume.id,
          number: resume.versionIds.length + 1,
          snapshot: sections,
          reason: "manual",
          createdAt: now,
        });
        await nextAudit({
          actorUserId: user.id,
          entityType: "Resume",
          entityId: resume.id,
          action: "SAVE_RESUME",
          at: now,
          commandId: command.commandId,
          reason: null,
          before: null,
          after: { studentId: resume.studentId },
        });
        result = { entityId: resume.id, revision, versionId };
      } else if (command.type === "DECIDE_SUGGESTION") {
        result = await executeSuggestion(db, command, user, now, nextAudit);
      } else if (
        command.type === "APPLY" ||
        command.type === "APPLICATION_ACTION"
      ) {
        result = await executeRecruiting(
          db,
          command,
          user,
          actor,
          now,
          nextAudit,
          hooks.requireJobReview,
        );
      } else if (command.type === 'SAVE_COMPANY_PROFILE') {
        result = await executeCompanyProfile(db, command, user, now, nextAudit);
      } else if (command.type === "SAVE_JOB" || command.type === "JOB_ACTION") {
        result = await executeJob(db, command, user, actor, now, nextAudit, hooks.requireJobReview);
      } else if (command.type === 'CREATE_TICKET' || command.type === 'TICKET_ACTION') {
        result = await executeTicket(db, command, user, now, nextAudit);
      } else if (command.type === "REVIEW_COMPANY" || command.type === "REVIEW_JOB" || command.type === "REASSIGN_STUDENT") {
        result = await executeGovernance(db, command, user, now, nextAudit);
      } else if (
        command.type === "CREATE_ASSISTANCE" ||
        command.type === "ASSISTANCE_ACTION"
      ) {
        result = await executeOperation(
          db,
          command,
          user,
          actor,
          now,
          nextAudit,
        );
      } else if (
        [
          "SAVE_DESTINATION",
          "DESTINATION_ACTION",
          "MOCK_ACTION",
          "CREATE_MOCK",
        ].includes(command.type)
      ) {
        result = await executeWorkflow(
          db,
          command as WorkflowCommand,
          user,
          actor,
          now,
          nextAudit,
        );
      } else throw new DomainError("INVALID_TRANSITION");
      hooks.afterWrite?.();
      const record: CommandReceipt = {
        id: command.commandId,
        actorUserId: user.id,
        payloadHash,
        result,
        at: now,
      };
      await db.commandReceipts.add(record);
      return result;
    });
    hooks.committed?.();
    return result;
  }
  async function clearMyData(actor: Actor, confirmed: boolean) {
    requireCondition(confirmed, "CONFIRMATION_REQUIRED");
    requireCondition(actor.role === "student", "FORBIDDEN");
    epoch++;
    hooks.invalidate?.();
    await db.transaction("rw", allTables(), async () => {
      const user = await getUser(actor),
        sid = user.studentId!;
      const dependentIds = new Set<string>([sid, user.id]);
      const tables = [
        "resumes",
        "careerProfiles",
        "applications",
        "agreements",
        "destinations",
        "attachments",
        "mockSessions",
        "assistance",
        "appointments",
        "surveyRecords",
        "evaluations",
        "feedback",
        "aiRuns",
        "suggestionDecisions",
      ] as const;
      for (const key of tables) {
        const ids = await db
          .table(key)
          .where("studentId")
          .equals(sid)
          .primaryKeys();
        for (const id of ids) dependentIds.add(String(id));
      }
      for (const resume of await db.resumes
        .where("studentId")
        .equals(sid)
        .toArray())
        await db.resumeVersions.where("resumeId").equals(resume.id).delete();
      for (const a of await db.applications
        .where("studentId")
        .equals(sid)
        .toArray()) {
        await db.applicationEvents.where("applicationId").equals(a.id).delete();
        await db.interviews.where("applicationId").equals(a.id).delete();
      }
      for (const key of tables)
        await db.table(key).where("studentId").equals(sid).delete();
      await db.notifications.where("userId").equals(user.id).delete();
      const audits = await db.auditLogs.toArray();
      for (const log of audits) {
        const related =
          dependentIds.has(log.entityId) ||
          log.before?.studentId === sid ||
          log.after?.studentId === sid;
        if (related) await db.auditLogs.delete(log.id);
        else if (log.actorUserId === user.id)
          await db.auditLogs.update(log.id, {
            actorUserId: "erased",
            entityId: "erased",
            before: null,
            after: null,
            reason: null,
          });
      }
      await db.commandReceipts
        .filter(
          (r) =>
            r.actorUserId === user.id ||
            [...dependentIds].some((id) =>
              JSON.stringify(r.result).includes(id),
            ),
        )
        .delete();
      await db.students.delete(sid);
      await db.users.delete(user.id);
      hooks.afterWrite?.();
    });
    hooks.committed?.();
  }
  async function listJobs(actor: Actor) {
    const user = await getUser(actor);
    if (actor.role === "company") return db.jobs.where("companyId").equals(user.companyId!).toArray();
    const companies = new Set((await db.companies.toArray()).filter(c => c.verified).map(c => c.id));
    return (await db.jobs.where("status").equals("published").toArray()).filter(j => !hooks.requireJobReview || companies.has(j.companyId));
  }
  async function readTickets(actor: Actor) {
    const user = await getUser(actor);
    return (await db.feedback.toArray()).filter(t => user.role === 'admin' || (t.ownerUserId ? t.ownerUserId === user.id : !!user.studentId && t.studentId === user.studentId)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  }
  async function readGovernance(actor: Actor) {
    const user = await getUser(actor); requireCondition(user.role === "admin", "FORBIDDEN");
    return { companies: await db.companies.toArray(), jobs: await db.jobs.toArray(),
      students: await db.students.toArray(), counselors: (await db.users.toArray()).filter(u => u.role === 'counselor' && u.active).map(u => ({ id: u.id, displayName: u.displayName })),
      history: (await db.auditLogs.toArray()).filter(a => ["Company", "Job"].includes(a.entityType)).map(a => ({ id: a.id, entityId: a.entityId, action: a.action, at: a.at, reason: a.reason })) };
  }
  async function addAttachment(
    actor: Actor,
    file: { fileName: string; blob: Blob },
    clock: Clock,
  ) {
    const user = await getUser(actor);
    requireCondition(user.role === "student" && user.studentId, "FORBIDDEN");
    requireCondition(
      file.fileName.trim() &&
        file.blob.size > 0 &&
        file.blob.size <= 2 * 1024 * 1024 &&
        ["application/pdf", "image/png", "image/jpeg"].includes(file.blob.type),
      "VALIDATION_ERROR",
      "仅支持2MiB以内的PDF、PNG或JPEG文件。",
    );
    const now = clock.now();
    const attachment: EntityMap["attachments"] = {
      id: crypto.randomUUID(),
      revision: 1,
      createdAt: now,
      updatedAt: now,
      studentId: user.studentId,
      fileName: file.fileName.trim().normalize("NFC"),
      mime: file.blob.type as EntityMap["attachments"]["mime"],
      size: file.blob.size,
      blob: file.blob,
    };
    await db.attachments.add(attachment);
    hooks.committed?.();
    return attachment;
  }
  async function readAttachment(actor: Actor, id: string) {
    const attachment = await db.attachments.get(id);
    requireCondition(attachment, "FORBIDDEN");
    if(actor.role==='company') {
      const user=await getUser(actor),company=user.companyId&&await db.companies.get(user.companyId);
      requireCondition(company&&company.ownerUserId===user.id,'FORBIDDEN');
      const jobs=new Set((await db.jobs.where('companyId').equals(company.id).toArray()).map(j=>j.id));
      const applications=await db.applications.where('studentId').equals(attachment.studentId).toArray();
      requireCondition(applications.some(a=>a.resumeConsent&&jobs.has(a.jobId)&&a.resumeSnapshot.certificates.some(c=>c.attachmentIds?.includes(id))),'FORBIDDEN');
    } else await canReadStudent(actor, attachment.studentId);
    return attachment;
  }
  async function listAttachments(actor: Actor) {
    const students = await listStudents(actor);
    return db.attachments
      .where("studentId")
      .anyOf(students.map((s) => s.id))
      .toArray();
  }
  async function readCatalog(actor: Actor) {
    await getUser(actor);
    return {
      dictionaries: await db.dictionaries.toArray(),
      skills: await db.skillOntology.toArray(),
      companies: await db.companies.toArray(),
      questions: await db.mockQuestions.toArray(),
      contents: await db.contents.toArray(),
    };
  }
  async function readScopedSnapshot(actor: Actor) {
    const students = await listStudents(actor),
      ids = students.map((s) => s.id);
    const applications = await listApplications(actor),
      appIds = applications.map((a) => a.id);
    const scoped = async <
      K extends
        | "destinations"
        | "agreements"
        | "mockSessions"
        | "assistance"
        | "resumes",
    >(
      key: K,
    ): Promise<EntityMap[K][]> =>
      db.table(key).where("studentId").anyOf(ids).toArray();
    const logs = await db.auditLogs
      .filter((log) =>
        ids.includes(log.before?.studentId ?? log.after?.studentId ?? ""),
      )
      .toArray();
    return {
      students,
      applications,
      interviews: await db.interviews
        .where("applicationId")
        .anyOf(appIds)
        .toArray(),
      destinations: await scoped("destinations"),
      agreements: await scoped("agreements"),
      mockSessions: await scoped("mockSessions"),
      assistance: actor.role === 'student' ? [] : await scoped("assistance"),
      supportTasks: actor.role === 'student' ? (await scoped('assistance')).filter(r => r.studentPlan?.trim()).map(r => ({ id: r.id, plan: r.studentPlan!, nextReviewAt: r.nextReviewAt, status: r.status })) : [],
      resumes: await Promise.all(ids.map((id) => readResume(actor, id))),
      auditLogs: logs,
      applicationEvents: await db.applicationEvents
        .where("applicationId")
        .anyOf(appIds)
        .toArray(),
    };
  }
  async function readCompanyWorkspace(actor: Actor) {
    const user = await getUser(actor);
    requireCondition(user.role === "company" && user.companyId, "FORBIDDEN");
    const company = await db.companies.get(user.companyId);
    requireCondition(company?.ownerUserId === user.id, "FORBIDDEN");
    const jobs = await db.jobs.where("companyId").equals(company.id).toArray();
    const jobIds = jobs.map((job) => job.id);
    const applications = await db.applications
      .where("jobId")
      .anyOf(jobIds)
      .filter((application) => application.resumeConsent)
      .toArray();
    const applicationIds = applications.map((application) => application.id);
    return {
      company,
      jobs,
      applications,
      interviews: await db.interviews
        .where("applicationId")
        .anyOf(applicationIds)
        .toArray(),
      agreements: await db.agreements
        .where("applicationId")
        .anyOf(applicationIds)
        .toArray(),
    };
  }
  async function exportRedactedAudit(actor: Actor) {
    const user = await getUser(actor);
    requireCondition(user.role === "admin", "FORBIDDEN");
    const references = new Map<string, string>();
    const reference = (kind: string, id: string) => {
      const key = `${kind}:${id}`;
      if (!references.has(key))
        references.set(key, `${kind}-${references.size + 1}`);
      return references.get(key)!;
    };
    const redactProjection = (
      value: AuditLog["before"],
    ): Record<string, Json> | null => {
      if (!value) return null;
      const safe: Record<string, Json> = {};
      const scalarKeys = [
        "status",
        "type",
        "source",
        "result",
        "cohortYear",
        "active",
        "createdAt",
        "scheduledAt",
        "submittedAt",
        "approvedAt",
        "signedAt",
        "terminatedAt",
      ] as const;
      for (const key of scalarKeys) {
        const item = value[key];
        if (item !== undefined) safe[key] = item;
      }
      const identifierKeys = [
        "studentId",
        "companyId",
        "jobId",
        "applicationId",
        "agreementId",
        "collegeId",
        "majorId",
        "industryId",
        "counselorId",
      ] as const;
      for (const key of identifierKeys) {
        const item = value[key];
        if (typeof item === "string")
          safe[key.replace(/Id$/, "Ref")] = reference(key, item);
      }
      return safe;
    };
    const records = (await db.auditLogs.orderBy("sequence").toArray()).map(
      (log) => ({
        sequence: log.sequence,
        entityType: log.entityType,
        entityRef: reference(log.entityType, log.entityId),
        action: log.action,
        at: log.at,
        before: redactProjection(log.before),
        after: redactProjection(log.after),
      }),
    );
    return {
      exportedAt: hooks.clock?.now() ?? FIXED_NOW,
      redaction: "ids-to-stable-references; free-text-and-credentials-omitted",
      records,
    };
  }
  async function readAdminConsole(actor: Actor) {
    const user = await getUser(actor);
    requireCondition(user.role === "admin", "FORBIDDEN");
    const configRows = await db.configs.toArray();
    const config = (key: string) =>
      configRows.find((row) => row.key === key)?.value;
    const users = await db.users.toArray();
    const roleCounts = users.reduce(
      (result, row) => {
        result[row.role]++;
        return result;
      },
      { student: 0, company: 0, counselor: 0, admin: 0 },
    );
    const [students, companies, jobs, applications, destinations, auditLogs] =
      await Promise.all([
        db.students.count(),
        db.companies.count(),
        db.jobs.count(),
        db.applications.count(),
        db.destinations.count(),
        db.auditLogs.count(),
      ]);
    const audit = await exportRedactedAudit(actor);
    return {
      counts: {
        users: users.length,
        students,
        companies,
        jobs,
        applications,
        destinations,
        auditLogs,
      },
      roleCounts,
      versions: {
        schema: String(config("schemaVersion") ?? "unknown"),
        seed: String(config("seedVersion") ?? "unknown"),
        algorithm: String(config("algorithmVersion") ?? "unknown"),
      },
      sources: {
        seed: "fixed-fictional",
        storage: "IndexedDB",
        aiMode: String(config("aiMode") ?? "REPLAY"),
      },
      recentAudit: audit.records.slice(-12).reverse(),
    };
  }
  return {
    initialize,
    resetDemo,
    listStudents,
    appendAiRun,
    readResume,
    readResumeHistory,
    listApplications,
    readApplication,
    execute,
    clearMyData,
    listJobs,
    readCatalog,
    readScopedSnapshot,
    readCompanyWorkspace,
    readAdminConsole,
    readGovernance,
    readTickets,
    exportRedactedAudit,
    addAttachment,
    readAttachment,
    listAttachments,
    get epoch() {
      return epoch;
    },
  };
}
function normalizeSections(sections: ResumeSections): ResumeSections {
  const normalize = (value: unknown): unknown =>
    typeof value === "string"
      ? value.trim().normalize("NFC")
      : Array.isArray(value)
        ? value.map(normalize)
        : value !== null && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value).map(([k, v]) => [k, normalize(v)]),
            )
          : value;
  const copy = normalize(sections) as ResumeSections;
  requireCondition(
    copy.basic &&
      [
        copy.education,
        copy.experience,
        copy.projects,
        copy.skills,
        copy.certificates,
      ].every(Array.isArray),
    "VALIDATION_ERROR",
  );
  requireCondition(copy.certificates.length<=30&&copy.certificates.every(c=>
    typeof c.id==='string'&&typeof c.name==='string'&&c.name.length<=160&&typeof c.issuer==='string'&&c.issuer.length<=160&&
    (c.description===undefined||typeof c.description==='string'&&c.description.length<=2000)&&
    (c.attachmentIds===undefined||Array.isArray(c.attachmentIds)&&c.attachmentIds.length<=5&&c.attachmentIds.every(id=>typeof id==='string'&&id.length<=128)&&new Set(c.attachmentIds).size===c.attachmentIds.length)),
    'VALIDATION_ERROR','证书最多30项，每项说明不超过2000字、附件不超过5个。');
  requireCondition(
    new Set(copy.skills.map((s) => s.skillId)).size === copy.skills.length,
    "VALIDATION_ERROR",
    "不能重复添加同一技能。",
  );
  for (const range of [...copy.education, ...copy.experience, ...copy.projects])
    requireCondition(validRange(range), "VALIDATION_ERROR", "请检查起止日期。");
  requireCondition(
    (copy.basic.degree === null || !!DEGREE_LEVEL[copy.basic.degree]) &&
      copy.education.every((e) => DEGREE_LEVEL[e.degree]) &&
      copy.certificates.every((c) => isLocalDate(c.awardedAt)),
    "VALIDATION_ERROR",
  );
  if (copy.intent.expectedSalary)
    requireCondition(
      Number.isFinite(copy.intent.expectedSalary.min) &&
        Number.isFinite(copy.intent.expectedSalary.max) &&
        copy.intent.expectedSalary.min > 0 &&
        copy.intent.expectedSalary.max >= copy.intent.expectedSalary.min,
      "VALIDATION_ERROR",
    );
  return copy;
}
