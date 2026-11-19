import type { Actor } from "../../types/identity";
import type {
  Application,
  ApplicationStatus,
  Destination,
  MockSession,
} from "../../types/entities";
import { requireCondition, DomainError } from "../errors";
export type ApplicationAction =
  | "START_SCREEN"
  | "SCHEDULE_INTERVIEW"
  | "RESCHEDULE"
  | "COMPLETE_INTERVIEW"
  | "CANCEL_INTERVIEW"
  | "CONFIRM_INTERVIEW"
  | "DECLINE_INTERVIEW"
  | "REQUEST_RESCHEDULE"
  | "ISSUE_OFFER"
  | "ISSUE_OFFER_DOCUMENT"
  | "ACCEPT_OFFER"
  | "WITHDRAW_OFFER"
  | "REJECT"
  | "WITHDRAW"
  | "DECLINE_OFFER"
  | "CREATE_AGREEMENT"
  | "CONFIRM_AGREEMENT"
  | "TERMINATE_AGREEMENT";
export interface ApplicationContext {
  now: string;
  studentUserId: string;
  companyUserId: string;
  hasSignedAgreement: boolean;
  hasOpenInterview: boolean;
  hasPassedInterview: boolean;
  hasActiveOffer: boolean;
  interviewScheduledAt?: string;
  interviewResponse?: string;
}
export interface LifecyclePayload {
  offer?: { location: string; compensation: string; startDate: string; responseDeadline: string; note: string };
  reason?: string;
  scheduledAt?: string;
  location?: string;
  result?: "pass" | "fail";
  feedback?: string;
  bothPartiesConsent?: boolean;
}
const legal: Record<ApplicationAction, ApplicationStatus[]> = {
  START_SCREEN: ["applied"],
  SCHEDULE_INTERVIEW: ["applied", "screening"],
  RESCHEDULE: ["interview"],
  COMPLETE_INTERVIEW: ["interview"],
  CANCEL_INTERVIEW: ["interview"],
  CONFIRM_INTERVIEW: ["interview"],
  DECLINE_INTERVIEW: ["interview"],
  REQUEST_RESCHEDULE: ["interview"],
  ISSUE_OFFER: ["interview"],
  ISSUE_OFFER_DOCUMENT: ['interview', 'offered'],
  ACCEPT_OFFER: ['offered'],
  WITHDRAW_OFFER: ['offered'],
  REJECT: ["applied", "screening", "interview"],
  WITHDRAW: ["applied", "screening", "interview", "offered"],
  DECLINE_OFFER: ["offered"],
  CREATE_AGREEMENT: ["offered"],
  CONFIRM_AGREEMENT: ["offered"],
  TERMINATE_AGREEMENT: ["closed"],
};
export function transitionApplication(
  application: Application,
  event: ApplicationAction,
  actor: Actor,
  context: ApplicationContext,
  payload: LifecyclePayload,
): Pick<Application, "status" | "closedReason"> {
  const studentAction = ["WITHDRAW", "ACCEPT_OFFER", "DECLINE_OFFER", "CONFIRM_INTERVIEW", "DECLINE_INTERVIEW", "REQUEST_RESCHEDULE"].includes(event),
    either = event === "CONFIRM_AGREEMENT";
  const company =
      actor.role === "company" && actor.userId === context.companyUserId,
    student =
      actor.role === "student" && actor.userId === context.studentUserId;
  requireCondition(
    either ? student || company : studentAction ? student : company,
    "FORBIDDEN",
  );
  requireCondition(
    legal[event]?.includes(application.status),
    "INVALID_TRANSITION",
  );
  let status = application.status,
    closedReason = application.closedReason;
  switch (event) {
    case "START_SCREEN":
      status = "screening";
      break;
    case "SCHEDULE_INTERVIEW":
      requireCondition(
        !context.hasOpenInterview &&
          !!payload.location?.trim() &&
          !!payload.scheduledAt &&
          !Number.isNaN(Date.parse(payload.scheduledAt)) &&
          payload.scheduledAt > context.now,
      );
      status = "interview";
      break;
    case "COMPLETE_INTERVIEW":
      requireCondition(
        context.hasOpenInterview &&
          (payload.result === "pass" || payload.result === "fail") &&
          !!payload.feedback?.trim(),
      );
      if (payload.result === "fail") status = "rejected";
      break;
    case "RESCHEDULE":
      requireCondition(
        context.hasOpenInterview &&
          !!payload.scheduledAt &&
          !Number.isNaN(Date.parse(payload.scheduledAt)) &&
          Date.parse(payload.scheduledAt) > Date.parse(context.now),
      );
      break;
    case "CONFIRM_INTERVIEW":
    case "DECLINE_INTERVIEW":
    case "REQUEST_RESCHEDULE":
      requireCondition(context.hasOpenInterview && !!context.interviewScheduledAt && Date.parse(context.interviewScheduledAt) > Date.parse(context.now), "INVALID_TRANSITION");
      if (event === "CONFIRM_INTERVIEW") requireCondition((context.interviewResponse ?? "pending") !== "accepted", "INVALID_TRANSITION");
      else requireCondition((payload.reason?.trim().length ?? 0) >= 2 && (payload.reason?.length ?? 0) <= 500);
      if (event === "DECLINE_INTERVIEW") status = "screening";
      break;
    case "CANCEL_INTERVIEW":
      requireCondition(context.hasOpenInterview && !!payload.reason?.trim());
      status = "screening";
      break;
    case "ISSUE_OFFER":
      requireCondition(context.hasPassedInterview && !context.hasActiveOffer);
      status = "offered";
      break;
    case 'ISSUE_OFFER_DOCUMENT':
      requireCondition(context.hasPassedInterview && !context.hasSignedAgreement && !context.hasOpenInterview);
      status = 'offered'; break;
    case 'ACCEPT_OFFER':
    case 'WITHDRAW_OFFER':
      requireCondition(!context.hasSignedAgreement); break;
    case "REJECT":
      requireCondition((payload.reason?.trim().length ?? 0) >= 2);
      status = "rejected";
      break;
    case "WITHDRAW":
      requireCondition(
        !context.hasSignedAgreement &&
          (payload.reason?.trim().length ?? 0) >= 2,
      );
      status = "withdrawn";
      break;
    case "DECLINE_OFFER":
      requireCondition(!context.hasSignedAgreement);
      status = "closed";
      closedReason = "declined";
      break;
    case "CREATE_AGREEMENT":
      requireCondition(!context.hasSignedAgreement);
      break;
    case "CONFIRM_AGREEMENT":
      requireCondition(!context.hasSignedAgreement, "ACTIVE_AGREEMENT_EXISTS");
      break;
    case "TERMINATE_AGREEMENT":
      requireCondition(
        context.hasSignedAgreement &&
          payload.bothPartiesConsent &&
          (payload.reason?.trim().length ?? 0) >= 5,
      );
      break;
  }
  return { status, closedReason };
}
export interface DestinationContext {
  now: string;
  studentUserId: string;
  counselorUserId: string;
  validSignedAgreement: boolean;
  attachmentsValid: boolean;
}
export type DestinationAction =
  "EDIT" | "SUBMIT" | "APPROVE" | "REJECT" | "WITHDRAW" | "REVOKE_APPROVAL";
export function validateDestination(
  destination: Destination,
  context: DestinationContext,
) {
  const d = destination;
  requireCondition(d.attachmentIds.length <= 5 && context.attachmentsValid);
  if (d.type === "employment") {
    requireCondition(!!d.organizationName?.trim() && !!d.industryId);
    if (d.source === "internal")
      requireCondition(
        !!d.applicationId && !!d.agreementId && context.validSignedAgreement,
      );
    else
      requireCondition(
        d.source === "external" &&
          !d.applicationId &&
          !d.agreementId &&
          d.attachmentIds.length > 0,
      );
  } else {
    requireCondition(
      d.source === "independent" && !d.applicationId && !d.agreementId,
    );
    if (d.type !== "unemployed")
      requireCondition(
        !!d.organizationName?.trim() && d.attachmentIds.length > 0,
      );
    if (d.type === "furtherStudy") requireCondition(d.industryId === null);
  }
}
export function transitionDestination(
  destination: Destination,
  event: DestinationAction,
  actor: Actor,
  context: DestinationContext,
  payload: { reason?: string },
): Destination {
  const review = ["APPROVE", "REJECT", "REVOKE_APPROVAL"].includes(event);
  requireCondition(
    review
      ? actor.role === "counselor" && actor.userId === context.counselorUserId
      : actor.role === "student" && actor.userId === context.studentUserId,
    "FORBIDDEN",
  );
  const allowed: Record<DestinationAction, string[]> = {
    EDIT: ["draft", "rejected"],
    SUBMIT: ["draft", "rejected"],
    APPROVE: ["submitted"],
    REJECT: ["submitted"],
    WITHDRAW: ["submitted"],
    REVOKE_APPROVAL: ["approved"],
  };
  requireCondition(
    allowed[event]?.includes(destination.status),
    "INVALID_TRANSITION",
  );
  const copy = {
    ...destination,
    revision: destination.revision + 1,
    updatedAt: context.now,
  };
  if (event === "SUBMIT" || event === "APPROVE")
    validateDestination(copy, context);
  if (event === "REJECT" || event === "REVOKE_APPROVAL")
    requireCondition((payload.reason?.trim().length ?? 0) >= 5);
  if (event === "SUBMIT") {
    copy.status = "submitted";
    copy.submittedAt = context.now;
    copy.approvedAt = null;
    copy.reviewedBy = null;
    copy.reviewReason = null;
  }
  if (event === "APPROVE") {
    copy.status = "approved";
    copy.approvedAt = context.now;
    copy.reviewedBy = actor.userId;
    copy.reviewReason = null;
  }
  if (event === "REJECT") {
    copy.status = "rejected";
    copy.approvedAt = null;
    copy.reviewedBy = actor.userId;
    copy.reviewReason = payload.reason!.trim();
  }
  if (event === "WITHDRAW" || event === "REVOKE_APPROVAL" || event === "EDIT") {
    copy.status = "draft";
    copy.submittedAt = null;
    copy.approvedAt = null;
    copy.reviewedBy = null;
    copy.reviewReason = payload.reason?.trim() ?? null;
  }
  return copy;
}
export type MockAction =
  | "START"
  | "PAUSE"
  | "RESUME"
  | "SUBMIT_ANSWER"
  | "SKIP"
  | "FOLLOW_UP"
  | "END_EARLY"
  | "ABANDON";
export function transitionMock(
  session: MockSession,
  event: MockAction,
  actor: Actor,
  context: { now: string; studentUserId: string },
  payload: { text?: string },
): MockSession {
  requireCondition(
    actor.role === "student" && actor.userId === context.studentUserId,
    "FORBIDDEN",
  );
  const copy = structuredClone(session);
  const now = context.now;
  const allowed: Record<MockAction, MockSession["state"][]> = {
    START: ["ready"],
    PAUSE: ["inProgress"],
    RESUME: ["paused"],
    SUBMIT_ANSWER: ["inProgress"],
    SKIP: ["inProgress"],
    FOLLOW_UP: ["inProgress"],
    END_EARLY: ["inProgress"],
    ABANDON: ["ready", "inProgress", "paused"],
  };
  requireCondition(allowed[event]?.includes(copy.state), "INVALID_TRANSITION");
  if (event === "START" || event === "RESUME") copy.state = "inProgress";
  if (event === "PAUSE") copy.state = "paused";
  if (event === "ABANDON") copy.state = "abandoned";
  if (event === "END_EARLY") copy.state = "completed";
  if (["SUBMIT_ANSWER", "SKIP", "FOLLOW_UP"].includes(event)) {
    const text = (payload.text ?? "").trim().normalize("NFC"),
      follow = event === "FOLLOW_UP";
    requireCondition(
      event === "SKIP" || (text.length >= 1 && text.length <= 4000),
    );
    requireCondition(
      !follow || (copy.questionIndex > 0 && copy.followUpCount < 2),
    );
    const questionId =
      copy.questionIds[follow ? copy.questionIndex - 1 : copy.questionIndex];
    requireCondition(questionId);
    if (!follow)
      requireCondition(
        !copy.answers.some(
          (a) => a.questionId === questionId && a.kind !== "followUp",
        ),
      );
    copy.answers.push({
      id: `answer-${copy.id}-${copy.answers.length + 1}`,
      questionId,
      kind: follow ? "followUp" : event === "SKIP" ? "skip" : "answer",
      text: event === "SKIP" ? "" : text,
      submittedAt: now,
      evidence: [],
    });
    if (follow) copy.followUpCount++;
    else {
      copy.questionIndex++;
      copy.followUpCount = 0;
      if (copy.questionIndex === copy.questionIds.length)
        copy.state = "completed";
    }
  }
  copy.revision++;
  copy.updatedAt = now;
  return copy;
}
export function invalidTransition(): never {
  throw new DomainError("INVALID_TRANSITION");
}
