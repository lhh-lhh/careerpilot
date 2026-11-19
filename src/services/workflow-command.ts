import type { Database } from "../adapters/repository/db";
import type { Actor } from "../types/identity";
import type {
  AuditLog,
  Destination,
  Json,
  MetricProjection,
  User,
} from "../types/entities";
import {
  transitionDestination,
  transitionMock,
  type DestinationAction,
  type MockAction,
} from "../domain/lifecycle/transition";
import { buildReport, selectQuestions } from "../domain/interview/scoring";
import { requireCondition } from "../domain/errors";
export type DestinationDraft = Pick<
  Destination,
  | "studentId"
  | "type"
  | "source"
  | "applicationId"
  | "agreementId"
  | "organizationName"
  | "industryId"
  | "attachmentIds"
>;
interface CommandBase {
  commandId: string;
  entityId: string;
  expectedRevision: number;
}
export type WorkflowCommand = CommandBase &
  (
    | { type: "SAVE_DESTINATION"; payload: DestinationDraft }
    | {
        type: "DESTINATION_ACTION";
        payload: { action: DestinationAction; reason?: string };
      }
    | { type: "MOCK_ACTION"; payload: { action: MockAction; text?: string } }
    | { type: "CREATE_MOCK"; payload: { targetJobId: string } }
  );
type AuditWriter = (data: Omit<AuditLog, "id" | "sequence">) => Promise<void>;
export async function executeWorkflow(
  db: Database,
  command: WorkflowCommand,
  user: User,
  actor: Actor,
  now: string,
  audit: AuditWriter,
): Promise<Json> {
  const writeAudit = async (
    entityType: string,
    entityId: string,
    action: string,
    before: MetricProjection | null,
    after: MetricProjection,
    reason: string | null = null,
  ) =>
    audit({
      entityType,
      entityId,
      action,
      before,
      after,
      reason,
      at: now,
      actorUserId: user.id,
      commandId: command.commandId,
    });
  if (
    command.type === "SAVE_DESTINATION" ||
    command.type === "DESTINATION_ACTION"
  ) {
    const existing = await db.destinations.get(command.entityId),
      sid =
        command.type === "SAVE_DESTINATION"
          ? command.payload.studentId
          : existing?.studentId;
    const student = sid ? await db.students.get(sid) : null;
    requireCondition(student, "FORBIDDEN");
    requireCondition(
      (user.role === "student" && user.studentId === sid) ||
        (user.role === "counselor" && student.counselorId === user.id),
      "FORBIDDEN",
    );
    requireCondition(
      (existing?.revision ?? 0) === command.expectedRevision,
      "REVISION_CONFLICT",
    );
    const draft = command.type === "SAVE_DESTINATION" ? command.payload : null;
    requireCondition(
      command.type !== "SAVE_DESTINATION" ||
        (user.role === "student" && (!existing || existing.studentId === sid)),
      "FORBIDDEN",
    );
    if (!existing)
      requireCondition(
        command.type === "SAVE_DESTINATION" &&
          !(await db.destinations
            .where("studentId")
            .equals(student.id)
            .count()),
        "VALIDATION_ERROR",
      );
    const candidate: Destination = existing
      ? { ...existing, ...draft }
      : {
          ...draft!,
          id: command.entityId,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          status: "draft",
          submittedAt: null,
          approvedAt: null,
          reviewedBy: null,
          reviewReason: null,
        };
    const attachments = await db.attachments.bulkGet(candidate.attachmentIds);
    const agreement = candidate.agreementId
      ? await db.agreements.get(candidate.agreementId)
      : null;
    const application = candidate.applicationId
      ? await db.applications.get(candidate.applicationId)
      : null;
    const job = application ? await db.jobs.get(application.jobId) : null;
    const context = {
      now,
      studentUserId: student.userId,
      counselorUserId: student.counselorId,
      validSignedAgreement:
        !!agreement &&
        agreement.status === "signed" &&
        agreement.studentId === student.id &&
        agreement.applicationId === candidate.applicationId &&
        agreement.companyId === job?.companyId,
      attachmentsValid:
        attachments.every(
          (a) => a && a.studentId === student.id && a.size <= 2 * 1024 * 1024,
        ) &&
        new Set(candidate.attachmentIds).size ===
          candidate.attachmentIds.length,
    };
    const action =
      command.type === "SAVE_DESTINATION" ? "EDIT" : command.payload.action;
    const result = transitionDestination(
      candidate,
      action,
      actor,
      context,
      command.type === "DESTINATION_ACTION" ? command.payload : {},
    );
    if (!existing) result.revision = 1;
    await db.destinations.put(result);
    const project = (d: Destination): MetricProjection => ({
      studentId: student.id,
      type: d.type,
      source: d.source,
      status: d.status,
      ...(d.industryId ? { industryId: d.industryId } : {}),
      createdAt: d.createdAt,
      submittedAt: d.submittedAt,
      approvedAt: d.approvedAt,
    });
    await writeAudit(
      "Destination",
      result.id,
      existing ? action : "CREATE",
      existing ? project(existing) : null,
      project(result),
      command.type === "DESTINATION_ACTION"
        ? (command.payload.reason ?? null)
        : null,
    );
    return {
      entityId: result.id,
      revision: result.revision,
      status: result.status,
    };
  }
  requireCondition(user.role === "student" && user.studentId, "FORBIDDEN");
  if (command.type === "CREATE_MOCK") {
    requireCondition(
      command.expectedRevision === 0 &&
        !(await db.mockSessions.get(command.entityId)),
    );
    const job = await db.jobs.get(command.payload.targetJobId),
      resume = await db.resumes
        .where("studentId")
        .equals(user.studentId)
        .first();
    requireCondition(job && resume);
    const questions = selectQuestions(
      await db.mockQuestions.toArray(),
      job.requiredSkills.map((s) => s.skillId),
    );
    requireCondition(questions.length === 3, "QUESTION_COVERAGE_LIMITED");
    await db.mockSessions.add({
      id: command.entityId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      studentId: user.studentId,
      targetJobId: job.id,
      resumeVersionId: resume.versionIds.at(-1)!,
      state: "ready",
      questionIds: questions.map((q) => q.id),
      questionIndex: 0,
      answers: [],
      followUpCount: 0,
      report: null,
      rubricVersion: "1.0",
    });
    await writeAudit("MockSession", command.entityId, "CREATE_MOCK", null, {
      studentId: user.studentId,
      createdAt: now,
    });
    return { entityId: command.entityId, revision: 1 };
  }
  const session = await db.mockSessions.get(command.entityId);
  requireCondition(session?.studentId === user.studentId, "FORBIDDEN");
  requireCondition(
    session.revision === command.expectedRevision,
    "REVISION_CONFLICT",
  );
  const result = transitionMock(
    session,
    command.payload.action,
    actor,
    { now, studentUserId: user.id },
    command.payload,
  );
  if (result.state === "completed") {
    const previous =
      (
        await db.mockSessions
          .where("studentId")
          .equals(user.studentId)
          .filter((s) => s.id !== session.id && s.state === "completed")
          .toArray()
      ).sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
      )[0] ?? null;
    result.report = buildReport(
      result,
      await db.mockQuestions.toArray(),
      await db.skillOntology.toArray(),
      previous,
    );
  }
  await db.mockSessions.put(result);
  await writeAudit(
    "MockSession",
    result.id,
    ["SUBMIT_ANSWER", "FOLLOW_UP", "SKIP"].includes(command.payload.action)
      ? "SUBMIT_MOCK_ANSWER"
      : command.payload.action,
    null,
    { studentId: user.studentId, createdAt: result.createdAt },
  );
  return {
    entityId: result.id,
    revision: result.revision,
    state: result.state,
  };
}
