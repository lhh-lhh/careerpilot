import type { Database } from "../adapters/repository/db";
import type { AuditLog, Json, MetricProjection, User } from "../types/entities";
import { requireCondition } from "../domain/errors";

interface BaseCommand { commandId: string; entityId: string; expectedRevision: number }
export type GovernanceCommand =
  | (BaseCommand & { type: "REVIEW_COMPANY"; payload: { verified: boolean; reason: string } })
  | (BaseCommand & { type: "REVIEW_JOB"; payload: { decision: "approve" | "reject" | "takedown"; reason: string } })
  | (BaseCommand & { type: "REASSIGN_STUDENT"; payload: { counselorId: string; reason: string } });
type AuditWriter = (data: Omit<AuditLog, "id" | "sequence">) => Promise<void>;

export async function executeGovernance(db: Database, command: GovernanceCommand, user: User, now: string, audit: AuditWriter): Promise<Json> {
  requireCondition(user.role === "admin", "FORBIDDEN");
  const reason = command.payload.reason;
  requireCondition(typeof reason === "string" && reason.trim().length >= 4 && reason.trim().length <= 500, "VALIDATION_ERROR");
  const writeAudit = (entityType: string, action: string, before: MetricProjection, after: MetricProjection) => audit({
    entityType, entityId: command.entityId, action, before, after, actorUserId: user.id, at: now,
    reason: reason.trim().normalize("NFC"), commandId: command.commandId,
  });
  if (command.type === "REASSIGN_STUDENT") {
    const student = await db.students.get(command.entityId), counselor = await db.users.get(command.payload.counselorId);
    requireCondition(student, "NOT_FOUND");
    requireCondition(student.revision === command.expectedRevision, "REVISION_CONFLICT");
    requireCondition(counselor?.active && counselor.role === "counselor" && counselor.id !== student.counselorId, "VALIDATION_ERROR");
    await db.students.update(student.id, { counselorId: counselor.id, revision: student.revision + 1, updatedAt: now });
    // Historical support follows the authorized student scope, including future reopen permission.
    for (const record of await db.assistance.where("studentId").equals(student.id).toArray()) {
      await db.assistance.update(record.id, { counselorId: counselor.id, revision: record.revision + 1, updatedAt: now });
      await audit({ entityType: "Assistance", entityId: record.id, action: "TRANSFER_ASSISTANCE", before: { studentId: student.id, counselorId: record.counselorId, status: record.status }, after: { studentId: student.id, counselorId: counselor.id, status: record.status }, actorUserId: user.id, at: now, reason: reason.trim(), commandId: command.commandId });
    }
    await writeAudit("Student", "REASSIGN_STUDENT", { studentId: student.id, counselorId: student.counselorId }, { studentId: student.id, counselorId: counselor.id });
    return { entityId: student.id, revision: student.revision + 1, counselorId: counselor.id, previousCounselorId: student.counselorId };
  }
  if (command.type === "REVIEW_COMPANY") {
    const company = await db.companies.get(command.entityId);
    requireCondition(company, "NOT_FOUND");
    requireCondition(company.revision === command.expectedRevision, "REVISION_CONFLICT");
    requireCondition(typeof command.payload.verified === "boolean", "VALIDATION_ERROR");
    const revision = company.revision + 1, verified = command.payload.verified;
    await db.companies.update(company.id, { verified, reviewReason: reason.trim(), reviewedAt: now, reviewedBy: user.id, revision, updatedAt: now });
    if (!verified) for (const job of await db.jobs.where("companyId").equals(company.id).toArray()) {
      if (job.status !== "published" && job.reviewStatus !== "pending") continue;
      await db.jobs.update(job.id, { status: "closed", reviewStatus: "revoked", reviewReason: "企业准入已暂停，请重新核实后提审。", reviewedAt: now, reviewedBy: user.id, revision: job.revision + 1, updatedAt: now });
      await audit({ entityType: "Job", entityId: job.id, action: "SUSPEND_COMPANY_JOB", before: { status: job.status, companyId: company.id }, after: { status: "closed", companyId: company.id }, actorUserId: user.id, at: now, reason: reason.trim(), commandId: command.commandId });
    }
    await writeAudit("Company", verified ? "APPROVE_COMPANY" : "SUSPEND_COMPANY", { companyId: company.id, status: company.verified ? "approved" : "pending" }, { companyId: company.id, status: verified ? "approved" : "suspended" });
    return { entityId: company.id, revision, verified };
  }
  const job = await db.jobs.get(command.entityId);
  requireCondition(job, "NOT_FOUND");
  requireCondition(job.revision === command.expectedRevision, "REVISION_CONFLICT");
  const { decision } = command.payload;
  requireCondition(["approve", "reject", "takedown"].includes(decision), "VALIDATION_ERROR");
  requireCondition(decision === "takedown" ? job.status === "published" : job.reviewStatus === "pending", "INVALID_TRANSITION");
  if (decision === "approve") {
    const company = await db.companies.get(job.companyId);
    requireCondition(company?.verified && Date.parse(job.deadline) > Date.parse(now), "VALIDATION_ERROR");
  }
  const status = decision === "approve" ? "published" : decision === "reject" ? "draft" : "closed";
  const reviewStatus = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "revoked";
  const revision = job.revision + 1;
  await db.jobs.update(job.id, { status, reviewStatus, reviewReason: reason.trim().normalize("NFC"), reviewedAt: now, reviewedBy: user.id, revision, updatedAt: now });
  await writeAudit("Job", `REVIEW_JOB_${decision.toUpperCase()}`, { jobId: job.id, companyId: job.companyId, status: job.status }, { jobId: job.id, companyId: job.companyId, status });
  return { entityId: job.id, revision, status, reviewStatus };
}
