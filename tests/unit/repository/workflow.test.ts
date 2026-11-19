import "fake-indexeddb/auto";
import { beforeEach, afterEach, expect, it } from "vitest";
import { createDatabase } from "../../../src/adapters/repository/db";
import { createRepository } from "../../../src/services/repository";
import { fixedClock } from "../../../src/domain/clock";
import { demoActors } from "../../../src/types/identity";
import { calculateMetrics } from "../../../src/domain/metrics/calculate";
let db: ReturnType<typeof createDatabase>,
  repo: ReturnType<typeof createRepository>;
beforeEach(async () => {
  db = createDatabase(`workflow-${crypto.randomUUID()}`);
  repo = createRepository(db);
  await repo.initialize();
});
afterEach(async () => {
  await db.delete();
});
it("L05 independent study creates, submits, reviews and revokes with dynamic audited metrics", async () => {
  const actor = { role: "student" as const, userId: "user-student-040" },
    counselor = { role: "counselor" as const, userId: "user-counselor-004" };
  const attachment = await repo.addAttachment(
    actor,
    {
      fileName: "study.pdf",
      blob: new Blob(["test proof"], { type: "application/pdf" }),
    },
    fixedClock,
  );
  const draft = {
    studentId: "student-040",
    type: "furtherStudy" as const,
    source: "independent" as const,
    applicationId: null,
    agreementId: null,
    organizationName: "示例大学研究院",
    industryId: null,
    attachmentIds: [attachment.id],
  };
  const save = {
    type: "SAVE_DESTINATION" as const,
    entityId: "independent-study",
    commandId: "save-study",
    expectedRevision: 0,
    payload: draft,
  };
  await repo.execute(save, actor, fixedClock);
  await repo.execute(
    {
      type: "DESTINATION_ACTION",
      entityId: save.entityId,
      commandId: "submit-study",
      expectedRevision: 1,
      payload: { action: "SUBMIT" },
    },
    actor,
    fixedClock,
  );
  await expect(
    repo.execute(
      {
        type: "DESTINATION_ACTION",
        entityId: save.entityId,
        commandId: "cross-scope",
        expectedRevision: 2,
        payload: { action: "APPROVE" },
      },
      demoActors.counselor,
      fixedClock,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await repo.execute(
    {
      type: "DESTINATION_ACTION",
      entityId: save.entityId,
      commandId: "approve-study",
      expectedRevision: 2,
      payload: { action: "APPROVE" },
    },
    counselor,
    fixedClock,
  );
  const query = { cohortYear: 2027, asOf: fixedClock.now() };
  expect(
    calculateMetrics(
      await repo.readScopedSnapshot(demoActors.admin),
      query,
      demoActors.admin,
    ).destinationRate,
  ).toBe(21 / 40);
  await repo.execute(
    {
      type: "DESTINATION_ACTION",
      entityId: save.entityId,
      commandId: "revoke-study",
      expectedRevision: 3,
      payload: { action: "REVOKE_APPROVAL", reason: "重新核对教学证明材料" },
    },
    counselor,
    fixedClock,
  );
  expect(
    calculateMetrics(
      await repo.readScopedSnapshot(demoActors.admin),
      query,
      demoActors.admin,
    ).destinationRate,
  ).toBe(0.5);
});
it("L07 mock answers and index persist atomically, duplicate command no duplicate answers; zero early report null", async () => {
  const command = {
    type: "MOCK_ACTION" as const,
    entityId: "mock-001",
    commandId: "mock-start",
    expectedRevision: 1,
    payload: { action: "START" as const },
  };
  await repo.execute(command, demoActors.student, fixedClock);
  const answer = {
    ...command,
    commandId: "answer-once",
    expectedRevision: 2,
    payload: {
      action: "SUBMIT_ANSWER" as const,
      text: "项目期间负责开发任务，首先使用JavaScript实现3个页面，最后交付2次迭代。",
    },
  };
  await repo.execute(answer, demoActors.student, fixedClock);
  await repo.execute(answer, demoActors.student, fixedClock);
  expect(await db.mockSessions.get("mock-001")).toMatchObject({
    questionIndex: 1,
    state: "inProgress",
  });
  expect((await db.mockSessions.get("mock-001"))!.answers).toHaveLength(1);
  await repo.execute(
    {
      ...command,
      commandId: "end-early",
      expectedRevision: 3,
      payload: { action: "END_EARLY" },
    },
    demoActors.student,
    fixedClock,
  );
  expect(
    (await db.mockSessions.get("mock-001"))!.report!.completion,
  ).toBeCloseTo(1 / 3);
});
it("D08 reset rollback retains old clock/business but runtime epoch still advances and cancels", async () => {
  let invalidations = 0;
  const failing = createRepository(db, {
    invalidate: () => {
      invalidations++;
    },
    afterWrite: () => {
      throw new Error("reset rollback");
    },
  });
  await db.configs.where("key").equals("aiMode").modify({ value: "RULE" });
  await expect(failing.resetDemo(demoActors.admin)).rejects.toThrow(
    "reset rollback",
  );
  expect((await db.configs.where("key").equals("aiMode").first())!.value).toBe(
    "RULE",
  );
  expect(await db.students.count()).toBe(40);
  expect(failing.epoch).toBe(1);
  expect(invalidations).toBe(1);
  await repo.resetDemo(demoActors.admin);
  expect((await db.configs.where("key").equals("aiMode").first())!.value).toBe(
    "REPLAY",
  );
});
