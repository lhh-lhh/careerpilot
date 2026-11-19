import type { Database } from "../adapters/repository/db";
import type { Actor } from "../types/identity";
import type {
  AuditLog,
  Job,
  Json,
  MetricProjection,
  User,
} from "../types/entities";
import { requireCondition } from "../domain/errors";
import { transitionJob } from "../domain/lifecycle/support";

export type JobDraft = Pick<
  Job,
  | "title"
  | "categoryId"
  | "industryId"
  | "cityId"
  | "salaryRange"
  | "requiredSkills"
  | "preferredMajorIds"
  | "minDegree"
  | "minExperienceMonths"
  | "jdText"
  | "deadline"
>;

interface CommandBase {
  commandId: string;
  entityId: string;
  expectedRevision: number;
}

export type JobCommand =
  | (CommandBase & { type: "SAVE_JOB"; payload: JobDraft })
  | (CommandBase & {
      type: "JOB_ACTION";
      payload: { action: "PUBLISH" | "CLOSE" };
    });

type AuditWriter = (data: Omit<AuditLog, "id" | "sequence">) => Promise<void>;

export async function executeJob(
  db: Database,
  command: JobCommand,
  user: User,
  actor: Actor,
  now: string,
  audit: AuditWriter,
  requireReview = false,
): Promise<Json> {
  requireCondition(user.role === "company" && user.companyId, "FORBIDDEN");
  const company = await db.companies.get(user.companyId);
  requireCondition(
    company?.ownerUserId === user.id && actor.userId === user.id,
    "FORBIDDEN",
  );
  const existing = await db.jobs.get(command.entityId);
  const projection = (job: Job): MetricProjection => ({
    jobId: job.id,
    companyId: job.companyId,
    industryId: job.industryId,
    status: job.status,
    createdAt: job.createdAt,
  });

  if (command.type === "SAVE_JOB") {
    requireCondition(
      existing
        ? existing.companyId === company.id &&
            existing.revision === command.expectedRevision &&
            ["draft", "closed"].includes(existing.status) && existing.reviewStatus !== "pending"
        : command.expectedRevision === 0,
      existing ? "REVISION_CONFLICT" : "ALREADY_EXISTS",
    );
    const draft = command.payload;
    const dictionaries = await db.dictionaries.toArray();
    const knownSkills = new Set(
      await db.skillOntology.toCollection().primaryKeys(),
    );
    const dictionaryHas = (kind: string, id: string) =>
      dictionaries.some(
        (row) => row.kind === kind && row.id === id && row.active,
      );
    requireCondition(
      draft.title.trim().length >= 2 &&
        draft.title.trim().length <= 80 &&
        draft.jdText.trim().length >= 10 &&
        draft.jdText.trim().length <= 4000 &&
        dictionaryHas("jobCategory", draft.categoryId) &&
        dictionaryHas("industry", draft.industryId) &&
        dictionaryHas("city", draft.cityId) &&
        draft.requiredSkills.length >= 1 &&
        draft.requiredSkills.length <= 12 &&
        draft.requiredSkills.every(
          (skill) =>
            knownSkills.has(skill.skillId) &&
            Number.isFinite(skill.weight) &&
            skill.weight > 0,
        ) &&
        new Set(draft.requiredSkills.map((skill) => skill.skillId)).size ===
          draft.requiredSkills.length &&
        draft.preferredMajorIds.every((id) => dictionaryHas("major", id)) &&
        Number.isInteger(draft.minExperienceMonths) &&
        draft.minExperienceMonths >= 0 &&
        (!draft.salaryRange ||
          (Number.isFinite(draft.salaryRange.min) &&
            Number.isFinite(draft.salaryRange.max) &&
            draft.salaryRange.min > 0 &&
            draft.salaryRange.max >= draft.salaryRange.min)) &&
        !Number.isNaN(Date.parse(draft.deadline)),
      "VALIDATION_ERROR",
      "岗位字段不完整或引用的数据已失效。",
    );
    const job: Job = {
      id: command.entityId,
      companyId: company.id,
      title: draft.title.trim().normalize("NFC"),
      categoryId: draft.categoryId,
      industryId: draft.industryId,
      cityId: draft.cityId,
      salaryRange: draft.salaryRange ? { ...draft.salaryRange } : null,
      requiredSkills: draft.requiredSkills.map((skill) => ({ ...skill })),
      preferredMajorIds: [...new Set(draft.preferredMajorIds)],
      minDegree: draft.minDegree,
      minExperienceMonths: draft.minExperienceMonths,
      jdText: draft.jdText.trim().normalize("NFC"),
      deadline: draft.deadline,
      status: existing?.status ?? "draft",
      revision: existing ? existing.revision + 1 : 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(requireReview ? { reviewStatus: "draft" as const, reviewReason: "", reviewedAt: null, reviewedBy: null } : {}),
    };
    await db.jobs.put(job);
    await audit({
      entityType: "Job",
      entityId: job.id,
      action: existing ? "EDIT" : "CREATE",
      actorUserId: user.id,
      at: now,
      commandId: command.commandId,
      reason: null,
      before: existing ? projection(existing) : null,
      after: projection(job),
    });
    return { entityId: job.id, revision: job.revision, status: job.status };
  }

  requireCondition(
    existing?.companyId === company.id &&
      existing.revision === command.expectedRevision,
    "REVISION_CONFLICT",
  );
  const result = transitionJob(
    existing,
    command.payload.action,
    actor,
    company.ownerUserId,
    now,
  );
  if (requireReview && command.payload.action === "PUBLISH") {
    requireCondition(company.verified, "FORBIDDEN", "企业尚未核准，不能提审岗位。");
    requireCondition(existing.reviewStatus !== "pending", "INVALID_TRANSITION");
    result.status = "draft"; result.reviewStatus = "pending"; result.reviewReason = ""; result.reviewedAt = null; result.reviewedBy = null;
  }
  await db.jobs.put(result);
  await audit({
    entityType: "Job",
    entityId: result.id,
    action: command.payload.action,
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
