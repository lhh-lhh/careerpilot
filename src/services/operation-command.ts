import type { Database } from "../adapters/repository/db";
import { requireCondition } from "../domain/errors";
import { transitionAssistance } from "../domain/lifecycle/support";
import type { Actor } from "../types/identity";
import type {
  Assistance,
  AuditLog,
  Json,
  MetricProjection,
  User,
} from "../types/entities";

const ASSISTANCE_RULES = new Set([
  "manual",
  "inactive7d",
  "applicationsWithoutInterview",
  "resumeIncomplete",
  "deadlineApproaching",
]);

interface CommandBase {
  commandId: string;
  entityId: string;
  expectedRevision: number;
}

export type OperationCommand =
  | (CommandBase & {
      type: "CREATE_ASSISTANCE";
      payload: {
        studentId: string;
        alertRuleIds: string[];
        note: string;
        studentPlan?: string;
        nextReviewAt: string;
      };
    })
  | (CommandBase & {
      type: "ASSISTANCE_ACTION";
      payload:
        | { action: "REVIEW"; reviewNote: string }
        | { action: "CLOSE"; confirmed: boolean }
        | { action: "REOPEN"; reviewNote: string; nextReviewAt: string };
    });

type AuditWriter = (data: Omit<AuditLog, "id" | "sequence">) => Promise<void>;

const projection = (record: Assistance): MetricProjection => ({
  studentId: record.studentId,
  status: record.status,
  createdAt: record.createdAt,
});

export async function executeOperation(
  db: Database,
  command: OperationCommand,
  user: User,
  actor: Actor,
  now: string,
  audit: AuditWriter,
): Promise<Json> {
  requireCondition(
    user.role === "counselor" && actor.userId === user.id,
    "FORBIDDEN",
  );

  if (command.type === "CREATE_ASSISTANCE") {
    const { studentId, alertRuleIds, note, nextReviewAt } = command.payload;
    const studentPlan = command.payload.studentPlan ?? '';
    requireCondition(typeof studentPlan === 'string' && studentPlan.length <= 500, 'VALIDATION_ERROR');
    const student = await db.students.get(studentId);
    const uniqueRules = [...new Set(alertRuleIds)];
    requireCondition(student?.counselorId === user.id, "FORBIDDEN");
    requireCondition(
      command.expectedRevision === 0 &&
        !(await db.assistance.get(command.entityId)),
      "ALREADY_EXISTS",
    );
    requireCondition(
      uniqueRules.length > 0 &&
        uniqueRules.length === alertRuleIds.length &&
        uniqueRules.every((ruleId) => ASSISTANCE_RULES.has(ruleId)) &&
        note.trim().length >= 4 &&
        note.trim().length <= 500 &&
        !Number.isNaN(Date.parse(nextReviewAt)) &&
        nextReviewAt > now,
      "VALIDATION_ERROR",
      "帮扶规则、记录或复查时间无效。",
    );
    requireCondition(
      !(await db.assistance
        .where("studentId")
        .equals(student.id)
        .filter((record) => record.status !== "closed")
        .count()),
      "VALIDATION_ERROR",
      "该学生已有进行中的帮扶记录。",
    );
    const record: Assistance = {
      id: command.entityId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      studentId: student.id,
      counselorId: user.id,
      alertRuleIds: uniqueRules,
      note: note.trim().normalize("NFC"),
      studentPlan: studentPlan.trim().normalize('NFC'),
      nextReviewAt,
      status: "open",
      reviewNote: null,
      closedAt: null,
    };
    await db.assistance.add(record);
    await audit({
      entityType: "Assistance",
      entityId: record.id,
      action: "CREATE_ASSISTANCE",
      actorUserId: user.id,
      at: now,
      commandId: command.commandId,
      reason: null,
      before: null,
      after: projection(record),
    });
    return { entityId: record.id, revision: 1, status: record.status };
  }

  const existing = await db.assistance.get(command.entityId);
  requireCondition(existing?.counselorId === user.id, "FORBIDDEN");
  requireCondition(
    existing.revision === command.expectedRevision,
    "REVISION_CONFLICT",
  );
  const student = await db.students.get(existing.studentId);
  requireCondition(student?.counselorId === user.id, "FORBIDDEN");
  if (command.payload.action === "REOPEN") requireCondition(
    !(await db.assistance.where("studentId").equals(existing.studentId).filter(r => r.id !== existing.id && r.status !== "closed").count()),
    "VALIDATION_ERROR", "该学生已有进行中的帮扶记录。",
  );
  const result = transitionAssistance(
    existing,
    command.payload.action,
    actor,
    now,
    command.payload,
  );
  await db.assistance.put(result);
  await audit({
    entityType: "Assistance",
    entityId: result.id,
    action:
      command.payload.action === "REVIEW"
        ? "REVIEW_ASSISTANCE"
        : command.payload.action === "REOPEN" ? "REOPEN_ASSISTANCE" : "CLOSE_ASSISTANCE",
    actorUserId: user.id,
    at: now,
    commandId: command.commandId,
    reason: null,
    before: projection(existing),
    after: projection(result),
  });
  return {
    entityId: result.id,
    revision: result.revision,
    status: result.status,
  };
}
