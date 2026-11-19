import type { Database } from "../adapters/repository/db";
import type { Actor } from "../types/identity";
import type {
  Application,
  AuditLog,
  Base,
  Json,
  MetricProjection,
  User,
} from "../types/entities";
import { requireCondition } from "../domain/errors";
import { match, isLocalDate } from "../domain/matching/scoring";
import {
  transitionApplication,
  type ApplicationAction,
  type LifecyclePayload,
} from "../domain/lifecycle/transition";
export type RecruitingCommand =
  | {
      type: "APPLY";
      commandId: string;
      entityId: string;
      expectedRevision: number;
      payload: { jobId: string; resumeConsent: boolean };
    }
  | {
      type: "APPLICATION_ACTION";
      commandId: string;
      entityId: string;
      expectedRevision: number;
      payload: LifecyclePayload & { action: ApplicationAction };
    };
type AuditWriter = (data: Omit<AuditLog, "id" | "sequence">) => Promise<void>;
export async function executeRecruiting(
  db: Database,
  command: RecruitingCommand,
  user: User,
  actor: Actor,
  now: string,
  writeAudit: AuditWriter,
  enforceScheduleConflicts = false,
): Promise<Json> {
  const base = (id: string = crypto.randomUUID()): Base => ({
    id,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  });
  const audit = async (
    type: string,
    id: string,
    action: string,
    before: MetricProjection | null,
    after: MetricProjection,
  ) =>
    writeAudit({
      entityType: type,
      entityId: id,
      action,
      before,
      after,
      actorUserId: user.id,
      at: now,
      reason:
        "reason" in command.payload ? (command.payload.reason ?? null) : null,
      commandId: command.commandId,
    });
  const event = async (
    application: Application,
    name: string,
    from: string,
    to: string,
  ) =>
    db.applicationEvents.add({
      id: crypto.randomUUID(),
      applicationId: application.id,
      actorUserId: user.id,
      event: name,
      from,
      to,
      at: now,
      commandId: command.commandId,
      reason:
        "reason" in command.payload ? (command.payload.reason ?? null) : null,
    });
  if (command.type === "APPLY") {
    requireCondition(user.role === "student" && user.studentId, "FORBIDDEN");
    requireCondition(
      command.expectedRevision === 0 && command.payload.resumeConsent === true,
    );
    requireCondition(
      !(await db.applications.get(command.entityId)),
      "ALREADY_EXISTS",
    );
    const job = await db.jobs.get(command.payload.jobId);
    requireCondition(
      job?.status === "published" && job.deadline > now,
      "VALIDATION_ERROR",
      "岗位已关闭或过期。",
    );
    requireCondition((await db.companies.get(job.companyId))?.verified, "VALIDATION_ERROR", "企业准入已暂停。");
    requireCondition(
      !(await db.applications
        .where("[studentId+jobId]")
        .equals([user.studentId, job.id])
        .count()),
      "ALREADY_APPLIED",
    );
    const resume = await db.resumes
      .where("studentId")
      .equals(user.studentId)
      .first();
    requireCondition(resume, "VALIDATION_ERROR", "请先创建简历。");
    requireCondition(
      resume?.sections.basic.name.trim() &&
        resume.sections.education.length > 0,
      "VALIDATION_ERROR",
      "请先填写姓名与至少一条教育经历。",
    );
    const snapshot = structuredClone(resume.sections);
    snapshot.basic.email = "[已脱敏]";
    const application: Application = {
      ...base(command.entityId),
      studentId: user.studentId,
      jobId: job.id,
      status: "applied",
      resumeSnapshot: snapshot,
      resumeVersionId: resume.versionIds.at(-1)!,
      resumeConsent: true,
      closedReason: null,
      matchSnapshot: match(
        resume,
        job,
        undefined,
        await db.skillOntology.toArray(),
        await db.dictionaries.toArray(),
        now,
      ),
    };
    await db.applications.add(application);
    await event(application, "APPLY", "none", "applied");
    await audit("Application", application.id, "APPLY", null, {
      studentId: user.studentId,
      companyId: job.companyId,
      applicationId: application.id,
      jobId: job.id,
      status: "applied",
      createdAt: now,
    });
    return { entityId: application.id, revision: 1 };
  }
  const application = await db.applications.get(command.entityId);
  requireCondition(application, "FORBIDDEN");
  const job = await db.jobs.get(application.jobId),
    student = await db.students.get(application.studentId);
  requireCondition(job && student, "DATABASE_INVALID");
  const company = await db.companies.get(job.companyId);
  requireCondition(company, "DATABASE_INVALID");
  requireCondition(
    (user.role === "student" && user.id === student.userId) ||
      (user.role === "company" && user.id === company.ownerUserId),
    "FORBIDDEN",
  );
  requireCondition(
    application.revision === command.expectedRevision,
    "REVISION_CONFLICT",
  );
  const interviews = await db.interviews
    .where("applicationId")
    .equals(application.id)
    .toArray();
  const open = interviews.find((i) => i.status === "scheduled");
  const passed = interviews.some(
    (i) => i.status === "completed" && i.result === "pass",
  );
  const agreements = await db.agreements
      .where("applicationId")
      .equals(application.id)
      .toArray(),
    agreement = agreements.find((a) => a.status !== "terminated");
  const signed = await db.agreements
    .where("studentId")
    .equals(student.id)
    .filter((a) => a.status === "signed")
    .toArray();
  const payload = command.payload,
    action = payload.action;
  const patch = transitionApplication(
    application,
    action,
    actor,
    {
      now,
      studentUserId: student.userId,
      companyUserId: company.ownerUserId,
      hasSignedAgreement: signed.length > 0,
      hasOpenInterview: !!open,
      hasPassedInterview: passed,
      hasActiveOffer: application.status === "offered",
      interviewScheduledAt: open?.scheduledAt,
      interviewResponse: open?.studentResponse,
    },
    payload,
  );
  const offerDocuments = structuredClone(application.offerDocuments ?? []), currentOffer = offerDocuments.at(-1);
  if (enforceScheduleConflicts && ['SCHEDULE_INTERVIEW', 'RESCHEDULE'].includes(action)) {
    const start = Date.parse(payload.scheduledAt!);
    const windowMs = 60 * 60 * 1000;
    for (const interview of await db.interviews.toArray()) {
      if (interview.status !== 'scheduled' || interview.id === open?.id || Math.abs(Date.parse(interview.scheduledAt) - start) >= windowMs) continue;
      const otherApplication = await db.applications.get(interview.applicationId);
      const otherJob = otherApplication && await db.jobs.get(otherApplication.jobId);
      requireCondition(otherApplication?.studentId !== student.id && otherJob?.companyId !== company.id, 'INVALID_TRANSITION');
    }
  }
  if (action === 'ISSUE_OFFER_DOCUMENT') {
    requireCondition(!currentOffer || currentOffer.status === 'withdrawn', 'INVALID_TRANSITION');
    requireCondition(!agreement, 'INVALID_TRANSITION');
    const terms = payload.offer;
    requireCondition(terms && typeof terms === 'object' && !Array.isArray(terms) && Object.keys(terms).every(k => ['location','compensation','startDate','responseDeadline','note'].includes(k)));
    requireCondition(typeof terms.location === 'string' && terms.location.trim().length >= 2 && terms.location.length <= 200 &&
      typeof terms.compensation === 'string' && terms.compensation.trim().length >= 4 && terms.compensation.length <= 1000 &&
      typeof terms.note === 'string' && terms.note.length <= 2000 && typeof terms.startDate === 'string' && isLocalDate(terms.startDate) && terms.startDate >= now.slice(0,10) &&
      typeof terms.responseDeadline === 'string' && Number.isFinite(Date.parse(terms.responseDeadline)) && Date.parse(terms.responseDeadline) > Date.parse(now) && Date.parse(terms.responseDeadline) < Date.parse(terms.startDate+'T23:59:59Z'));
    offerDocuments.push({ id: crypto.randomUUID(), version: offerDocuments.length + 1, companyName: company.name, jobTitle: job.title,
      location: terms.location.trim().normalize('NFC'), compensation: terms.compensation.trim().normalize('NFC'), startDate: terms.startDate,
      responseDeadline: new Date(terms.responseDeadline).toISOString(), note: terms.note.trim().normalize('NFC'), issuedAt: now, status: 'pending', respondedAt: null, responseReason: null, withdrawnAt: null, withdrawalReason: null });
  }
  if (action === 'ACCEPT_OFFER' || (action === 'DECLINE_OFFER' && currentOffer)) {
    requireCondition(currentOffer?.status === 'pending' && Date.parse(currentOffer.responseDeadline) > Date.parse(now), 'INVALID_TRANSITION');
    if (action === 'DECLINE_OFFER') requireCondition((payload.reason?.trim().length ?? 0) >= 2 && (payload.reason?.length ?? 0) <= 500);
    currentOffer.status = action === 'ACCEPT_OFFER' ? 'accepted' : 'declined'; currentOffer.respondedAt = now; currentOffer.responseReason = payload.reason?.trim() ?? null;
  }
  if (action === 'WITHDRAW_OFFER') {
    requireCondition(currentOffer && ['pending','accepted'].includes(currentOffer.status) && !agreement, 'INVALID_TRANSITION');
    requireCondition((payload.reason?.trim().length ?? 0) >= 4 && (payload.reason?.length ?? 0) <= 500);
    currentOffer.status = 'withdrawn'; currentOffer.withdrawnAt = now; currentOffer.withdrawalReason = payload.reason!.trim();
  }
  if (['CREATE_AGREEMENT','CONFIRM_AGREEMENT'].includes(action) && currentOffer) requireCondition(currentOffer.status === 'accepted' && (action !== 'CREATE_AGREEMENT' || Date.parse(currentOffer.responseDeadline) > Date.parse(now)), 'INVALID_TRANSITION');
  if (action === 'WITHDRAW' && currentOffer && ['pending','accepted'].includes(currentOffer.status)) { currentOffer.status = 'withdrawn'; currentOffer.withdrawnAt = now; currentOffer.withdrawalReason = payload.reason?.trim() ?? '学生撤回投递'; }
  const projection = (status: string): MetricProjection => ({
    applicationId: application.id,
    studentId: student.id,
    companyId: company.id,
    jobId: job.id,
    status,
    createdAt: application.createdAt,
  });
  if (action === "SCHEDULE_INTERVIEW") {
    requireCondition(!interviews.some((i) => i.status !== "cancelled"));
    const interview = {
      ...base(),
      applicationId: application.id,
      scheduledAt: payload.scheduledAt!,
      location: payload.location!.trim(),
      status: "scheduled" as const,
      result: "pending" as const,
      feedback: "",
      studentResponse: "pending" as const,
      respondedAt: null,
      responseReason: null,
    };
    await db.interviews.add(interview);
    await audit("Interview", interview.id, action, null, {
      applicationId: application.id,
      studentId: student.id,
      status: "scheduled",
      result: "pending",
      scheduledAt: interview.scheduledAt,
      createdAt: now,
    });
  }
  if (action === "RESCHEDULE") {
    requireCondition(open);
    await db.interviews.update(open.id, {
      scheduledAt: payload.scheduledAt!,
      location: payload.location?.trim() || open.location,
      studentResponse: "pending",
      respondedAt: null,
      responseReason: null,
      revision: open.revision + 1,
      updatedAt: now,
    });
    await audit(
      "Interview",
      open.id,
      action,
      {
        applicationId: application.id,
        studentId: student.id,
        status: open.status,
        result: open.result,
        scheduledAt: open.scheduledAt,
      },
      {
        applicationId: application.id,
        studentId: student.id,
        status: open.status,
        result: open.result,
        scheduledAt: payload.scheduledAt!,
        createdAt: open.createdAt,
      },
    );
  }
  if (["CONFIRM_INTERVIEW", "DECLINE_INTERVIEW", "REQUEST_RESCHEDULE"].includes(action)) {
    requireCondition(open);
    const studentResponse = action === "CONFIRM_INTERVIEW" ? "accepted" : action === "DECLINE_INTERVIEW" ? "declined" : "rescheduleRequested";
    await db.interviews.update(open.id, {
      studentResponse,
      respondedAt: now,
      responseReason: payload.reason?.trim().normalize("NFC") ?? null,
      status: action === "DECLINE_INTERVIEW" ? "cancelled" : "scheduled",
      revision: open.revision + 1,
      updatedAt: now,
    });
    await audit("Interview", open.id, action,
      { applicationId: application.id, studentId: student.id, status: open.status },
      { applicationId: application.id, studentId: student.id, status: action === "DECLINE_INTERVIEW" ? "cancelled" : "scheduled", studentResponse, scheduledAt: open.scheduledAt });
  }
  if (action === "COMPLETE_INTERVIEW") {
    requireCondition(open);
    await db.interviews.update(open.id, {
      status: "completed",
      result: payload.result!,
      feedback: payload.feedback!.trim(),
      revision: open.revision + 1,
      updatedAt: now,
    });
    await audit(
      "Interview",
      open.id,
      action,
      {
        applicationId: application.id,
        studentId: student.id,
        status: open.status,
        result: open.result,
      },
      {
        applicationId: application.id,
        studentId: student.id,
        status: "completed",
        result: payload.result!,
        scheduledAt: open.scheduledAt,
        createdAt: open.createdAt,
      },
    );
  }
  if (["CANCEL_INTERVIEW", "REJECT", "WITHDRAW"].includes(action) && open) {
    await db.interviews.update(open.id, {
      status: "cancelled",
      result: "pending",
      revision: open.revision + 1,
      updatedAt: now,
    });
    await audit(
      "Interview",
      open.id,
      action,
      {
        applicationId: application.id,
        studentId: student.id,
        status: open.status,
        result: open.result,
      },
      {
        applicationId: application.id,
        studentId: student.id,
        status: "cancelled",
        result: "pending",
        scheduledAt: open.scheduledAt,
        createdAt: open.createdAt,
      },
    );
  }
  if (action === "CREATE_AGREEMENT") {
    requireCondition(!agreement, "VALIDATION_ERROR", "已有未终止的协议。");
    const draft = {
      ...base(),
      applicationId: application.id,
      studentId: student.id,
      companyId: company.id,
      status: "draft" as const,
      studentConfirmedAt: null,
      companyConfirmedAt: null,
      signedAt: null,
      terminatedAt: null,
      terminationReason: null,
    };
    await db.agreements.add(draft);
    await audit("Agreement", draft.id, action, null, {
      applicationId: application.id,
      studentId: student.id,
      companyId: company.id,
      status: "draft",
      signedAt: null,
      createdAt: now,
    });
  }
  if (action === "CONFIRM_AGREEMENT") {
    requireCondition(agreement?.status === "draft");
    const updated = {
      ...agreement,
      revision: agreement.revision + 1,
      updatedAt: now,
      studentConfirmedAt:
        user.role === "student" ? now : agreement.studentConfirmedAt,
      companyConfirmedAt:
        user.role === "company" ? now : agreement.companyConfirmedAt,
    };
    if (updated.studentConfirmedAt && updated.companyConfirmedAt) {
      updated.status = "signed";
      updated.signedAt = now;
      patch.status = "closed";
      patch.closedReason = "accepted";
    }
    await db.agreements.put(updated);
    await audit(
      "Agreement",
      agreement.id,
      action,
      {
        applicationId: application.id,
        studentId: student.id,
        status: agreement.status,
      },
      {
        applicationId: application.id,
        studentId: student.id,
        companyId: company.id,
        status: updated.status,
        signedAt: updated.signedAt,
        createdAt: agreement.createdAt,
      },
    );
  }
  if (
    ["WITHDRAW", "DECLINE_OFFER", "TERMINATE_AGREEMENT"].includes(action) &&
    agreement
  ) {
    requireCondition(
      action !== "TERMINATE_AGREEMENT" || agreement.status === "signed",
    );
    const reason =
      payload.reason?.trim() ??
      (action === "DECLINE_OFFER" ? "学生拒绝录用" : "学生撤回投递");
    await db.agreements.update(agreement.id, {
      status: "terminated",
      terminatedAt: now,
      terminationReason: reason,
      revision: agreement.revision + 1,
      updatedAt: now,
    });
    await audit(
      "Agreement",
      agreement.id,
      action,
      {
        applicationId: application.id,
        studentId: student.id,
        status: agreement.status,
        signedAt: agreement.signedAt,
      },
      {
        applicationId: application.id,
        studentId: student.id,
        companyId: company.id,
        status: "terminated",
        signedAt: agreement.signedAt,
        terminatedAt: now,
        createdAt: agreement.createdAt,
      },
    );
    if (action === "TERMINATE_AGREEMENT")
      for (const destination of await db.destinations
        .where("studentId")
        .equals(student.id)
        .filter(
          (d) =>
            d.agreementId === agreement.id &&
            ["submitted", "approved"].includes(d.status),
        )
        .toArray()) {
        await db.destinations.update(destination.id, {
          status: "draft",
          submittedAt: null,
          approvedAt: null,
          reviewedBy: null,
          reviewReason: "关联协议已终止，请重新核实",
          revision: destination.revision + 1,
          updatedAt: now,
        });
        await audit(
          "Destination",
          destination.id,
          "REVOKE_AGREEMENT",
          {
            studentId: student.id,
            status: destination.status,
            type: destination.type,
            approvedAt: destination.approvedAt,
          },
          {
            studentId: student.id,
            status: "draft",
            type: destination.type,
            source: destination.source,
            approvedAt: null,
            submittedAt: null,
            createdAt: destination.createdAt,
          },
        );
      }
  }
  await db.applications.put({
    ...application,
    ...patch,
    ...(offerDocuments.length ? { offerDocuments } : {}),
    revision: application.revision + 1,
    updatedAt: now,
  });
  await event(application, action, application.status, patch.status);
  await audit(
    "Application",
    application.id,
    action,
    projection(application.status),
    projection(patch.status),
  );
  return {
    entityId: application.id,
    revision: application.revision + 1,
    status: patch.status,
  };
}
