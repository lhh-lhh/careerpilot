import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createDatabase } from "../../../src/adapters/repository/db";
import { createRepository } from "../../../src/services/repository";
import { demoActors } from "../../../src/types/identity";
import { fixedClock } from "../../../src/domain/clock";
let db: ReturnType<typeof createDatabase>,
  repo: ReturnType<typeof createRepository>;
beforeEach(async () => {
  db = createDatabase(`lifecycle-${crypto.randomUUID()}`);
  repo = createRepository(db);
  await repo.initialize();
});
afterEach(async () => {
  await db.delete();
});
it("D04 application creation has consent, masked snapshot, one event, receipt and uniqueness", async () => {
  const actor = { role: "student" as const, userId: "user-student-040" };
  const command = {
    type: "APPLY" as const,
    commandId: "apply-once",
    entityId: "my-application",
    expectedRevision: 0,
    payload: { jobId: "job-001", resumeConsent: true },
  };
  await repo.execute(command, actor, fixedClock);
  await repo.execute(command, actor, fixedClock);
  expect(
    await db.applicationEvents
      .where("applicationId")
      .equals("my-application")
      .count(),
  ).toBe(1);
  expect(
    (await db.applications.get("my-application"))!.resumeSnapshot.basic.email,
  ).toBe("[已脱敏]");
  await expect(
    repo.execute(
      { ...command, commandId: "duplicate", entityId: "duplicate-app" },
      actor,
      fixedClock,
    ),
  ).rejects.toMatchObject({ code: "ALREADY_APPLIED" });
  await expect(
    repo.execute(
      {
        ...command,
        commandId: "collision",
        entityId: "no-consent",
        payload: { jobId: "job-002", resumeConsent: false },
      },
      actor,
      fixedClock,
    ),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
});
it("L03 signing is serializable across two offered applications; L04 termination revokes approved destination", async () => {
  const student = { role: "student" as const, userId: "user-student-013" };
  const app = await db.applications.get("application-053");
  await db.applications.put({ ...app!, status: "offered" });
  const companyId = (await db.jobs.get("job-013"))!.companyId,
    owner = (await db.companies.get(companyId))!.ownerUserId;
  const company = { role: "company" as const, userId: owner };
  for (const [i, id] of ["application-013", "application-053"].entries()) {
    await repo.execute(
      {
        type: "APPLICATION_ACTION",
        commandId: `draft-${i}`,
        entityId: id,
        expectedRevision: 1,
        payload: { action: "CREATE_AGREEMENT" },
      },
      company,
      fixedClock,
    );
    await repo.execute(
      {
        type: "APPLICATION_ACTION",
        commandId: `company-confirm-${i}`,
        entityId: id,
        expectedRevision: 2,
        payload: { action: "CONFIRM_AGREEMENT" },
      },
      company,
      fixedClock,
    );
  }
  const results = await Promise.allSettled(
    ["application-013", "application-053"].map((id, i) =>
      repo.execute(
        {
          type: "APPLICATION_ACTION",
          commandId: `student-confirm-${i}`,
          entityId: id,
          expectedRevision: 3,
          payload: { action: "CONFIRM_AGREEMENT" },
        },
        student,
        fixedClock,
      ),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find((r) => r.status === "rejected");
  expect(rejected?.status === "rejected" && rejected.reason.code).toBe(
    "ACTIVE_AGREEMENT_EXISTS",
  );
  expect(
    await db.agreements
      .where("studentId")
      .equals("student-013")
      .filter((a) => a.status === "signed")
      .count(),
  ).toBe(1);
  const agreement = await db.agreements.get("agreement-001");
  expect(agreement!.status).toBe("signed");
  await repo.execute(
    {
      type: "APPLICATION_ACTION",
      commandId: "terminate",
      entityId: "application-001",
      expectedRevision: 1,
      payload: {
        action: "TERMINATE_AGREEMENT",
        reason: "教学模拟双方协商终止",
        bothPartiesConsent: true,
      },
    },
    demoActors.company,
    fixedClock,
  );
  expect((await db.agreements.get("agreement-001"))!.status).toBe("terminated");
  expect(await db.destinations.get("destination-001")).toMatchObject({
    status: "draft",
    submittedAt: null,
    approvedAt: null,
  });
  expect((await db.applications.get("application-001"))!.status).toBe("closed");
});
it("D05 signing failure rolls back every side effect", async () => {
  await db.agreements.add({
    ...(await db.agreements.get("agreement-001"))!,
    id: "draft-test",
    studentId: "student-013",
    applicationId: "application-013",
    companyId: (await db.jobs.get("job-013"))!.companyId,
    status: "draft",
    studentConfirmedAt: null,
    signedAt: null,
  });
  const beforeEvents = await db.applicationEvents.count(),
    beforeAudit = await db.auditLogs.count();
  const failing = createRepository(db, {
    afterWrite: () => {
      throw new Error("atomic failure");
    },
  });
  await expect(
    failing.execute(
      {
        type: "APPLICATION_ACTION",
        commandId: "sign-fail",
        entityId: "application-013",
        expectedRevision: 1,
        payload: { action: "CONFIRM_AGREEMENT" },
      },
      { role: "student", userId: "user-student-013" },
      fixedClock,
    ),
  ).rejects.toThrow("atomic failure");
  expect((await db.agreements.get("draft-test"))!.status).toBe("draft");
  expect((await db.applications.get("application-013"))!.status).toBe(
    "offered",
  );
  expect(await db.applicationEvents.count()).toBe(beforeEvents);
  expect(await db.auditLogs.count()).toBe(beforeAudit);
  expect(await db.commandReceipts.get("sign-fail")).toBeUndefined();
});
it("L02 scheduled interviews can be rescheduled idempotently without creating a second interview", async () => {
  const application = await db.applications.get("application-031"),
    job = await db.jobs.get(application!.jobId),
    company = await db.companies.get(job!.companyId),
    actor = { role: "company" as const, userId: company!.ownerUserId };
  const command = {
    type: "APPLICATION_ACTION" as const,
    commandId: "reschedule-once",
    entityId: application!.id,
    expectedRevision: application!.revision,
    payload: {
      action: "RESCHEDULE" as const,
      scheduledAt: "2026-11-16T01:30:00.000Z",
    },
  };
  await repo.execute(command, actor, fixedClock);
  await repo.execute(command, actor, fixedClock);
  const interviews = await db.interviews
    .where("applicationId")
    .equals(application!.id)
    .toArray();
  expect(interviews).toHaveLength(1);
  expect(interviews[0]).toMatchObject({
    scheduledAt: "2026-11-16T01:30:00.000Z",
    status: "scheduled",
    result: "pending",
    revision: 2,
  });
  expect((await db.applications.get(application!.id))!.status).toBe(
    "interview",
  );
  expect(
    await db.applicationEvents
      .where("applicationId")
      .equals(application!.id)
      .filter((e) => e.event === "RESCHEDULE")
      .count(),
  ).toBe(1);
  await expect(
    repo.execute(
      {
        ...command,
        commandId: "reschedule-past",
        expectedRevision: 2,
        payload: {
          ...command.payload,
          scheduledAt: "2026-11-01T00:00:00.000Z",
        },
      },
      actor,
      fixedClock,
    ),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  await expect(
    repo.execute(
      { ...command, commandId: "reschedule-student", expectedRevision: 2 },
      { role: "student", userId: "user-student-031" },
      fixedClock,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await repo.execute(
    {
      ...command,
      commandId: "complete-before-reschedule",
      expectedRevision: 2,
      payload: {
        action: "COMPLETE_INTERVIEW",
        result: "pass",
        feedback: "教学面试已完成",
      },
    },
    actor,
    fixedClock,
  );
  await expect(
    repo.execute(
      { ...command, commandId: "reschedule-completed", expectedRevision: 3 },
      actor,
      fixedClock,
    ),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
});
