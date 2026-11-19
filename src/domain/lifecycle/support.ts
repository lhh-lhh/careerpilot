import type { Actor } from "../../types/identity";
import type { Appointment, Assistance, Job } from "../../types/entities";
import { requireCondition } from "../errors";
export function transitionJob(
  job: Job,
  action: "PUBLISH" | "CLOSE",
  actor: Actor,
  ownerUserId: string,
  now: string,
): Job {
  requireCondition(
    actor.role === "company" && actor.userId === ownerUserId,
    "FORBIDDEN",
  );
  requireCondition(
    action === "PUBLISH"
      ? ["draft", "closed"].includes(job.status)
      : job.status === "published",
    "INVALID_TRANSITION",
  );
  if (action === "PUBLISH")
    requireCondition(
      job.title.trim() &&
        job.cityId &&
        job.industryId &&
        job.jdText.trim() &&
        job.deadline > now &&
        !Number.isNaN(Date.parse(job.deadline)),
    );
  return {
    ...job,
    status: action === "PUBLISH" ? "published" : "closed",
    revision: job.revision + 1,
    updatedAt: now,
  };
}
export function transitionAssistance(
  record: Assistance,
  action: "REVIEW" | "CLOSE" | "REOPEN",
  actor: Actor,
  now: string,
  payload: { reviewNote?: string; confirmed?: boolean; nextReviewAt?: string },
): Assistance {
  requireCondition(
    actor.role === "counselor" && actor.userId === record.counselorId,
    "FORBIDDEN",
  );
  requireCondition(
    action === "REVIEW"
      ? record.status === "open"
      : action === "REOPEN" ? record.status === "closed" : record.status === "reviewed",
    "INVALID_TRANSITION",
  );
  if (action === "REOPEN") requireCondition((payload.reviewNote?.trim().length ?? 0) >= 4 && !!payload.nextReviewAt && !Number.isNaN(Date.parse(payload.nextReviewAt)) && Date.parse(payload.nextReviewAt) > Date.parse(now));
  else if (action === "REVIEW") requireCondition(!!payload.reviewNote?.trim());
  else requireCondition(payload.confirmed === true && record.reviewNote);
  return {
    ...record,
    status: action === "REOPEN" ? "open" : action === "REVIEW" ? "reviewed" : "closed",
    note: action === "REOPEN" ? `${record.note}\n重开：${payload.reviewNote!.trim()}` : record.note,
    nextReviewAt: action === "REOPEN" ? payload.nextReviewAt! : record.nextReviewAt,
    reviewNote:
      action === "REOPEN" ? null : action === "REVIEW" ? payload.reviewNote!.trim() : record.reviewNote,
    closedAt: action === "CLOSE" ? now : null,
    revision: record.revision + 1,
    updatedAt: now,
  };
}
export function transitionAppointment(
  appointment: Appointment,
  action: "CONFIRM" | "COMPLETE" | "CANCEL",
  actor: Actor,
  context: { studentUserId: string; overlaps: boolean; now: string },
  payload: { reason?: string },
): Appointment {
  const counselor =
      actor.role === "counselor" && actor.userId === appointment.counselorId,
    student =
      actor.role === "student" && actor.userId === context.studentUserId;
  requireCondition(
    action === "CANCEL" ? counselor || student : counselor,
    "FORBIDDEN",
  );
  requireCondition(
    action === "CONFIRM"
      ? appointment.status === "pending"
      : action === "COMPLETE"
        ? appointment.status === "confirmed"
        : ["pending", "confirmed"].includes(appointment.status),
    "INVALID_TRANSITION",
  );
  requireCondition(appointment.startsAt < appointment.endsAt);
  if (action === "CONFIRM") requireCondition(!context.overlaps);
  if (action === "CANCEL") requireCondition(!!payload.reason?.trim());
  return {
    ...appointment,
    status:
      action === "CONFIRM"
        ? "confirmed"
        : action === "COMPLETE"
          ? "completed"
          : "cancelled",
    revision: appointment.revision + 1,
    updatedAt: context.now,
  };
}
