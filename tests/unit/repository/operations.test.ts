import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createDatabase } from "../../../src/adapters/repository/db";
import { createRepository } from "../../../src/services/repository";
import { fixedClock } from "../../../src/domain/clock";
import { demoActors } from "../../../src/types/identity";

let db: ReturnType<typeof createDatabase>;
let repo: ReturnType<typeof createRepository>;

beforeEach(async () => {
  db = createDatabase(`operations-${crypto.randomUUID()}`);
  repo = createRepository(db);
  await repo.initialize();
});

afterEach(async () => {
  await db.delete();
});

it("L06 assistance is counselor-scoped, reviewed before close and keeps original rule facts", async () => {
  await repo.execute(
    {
      type: "CREATE_ASSISTANCE",
      commandId: "create-assistance",
      entityId: "assistance-test",
      expectedRevision: 0,
      payload: {
        studentId: "student-001",
        alertRuleIds: ["inactive7d", "deadlineApproaching"],
        note: "联系学生核对近期选择与证明材料准备情况。",
        nextReviewAt: "2026-11-16T02:00:00.000Z",
      },
    },
    demoActors.counselor,
    fixedClock,
  );
  await repo.execute(
    {
      type: "ASSISTANCE_ACTION",
      commandId: "review-assistance",
      entityId: "assistance-test",
      expectedRevision: 1,
      payload: { action: "REVIEW", reviewNote: "已联系学生并核对材料清单。" },
    },
    demoActors.counselor,
    fixedClock,
  );
  await repo.execute(
    {
      type: "ASSISTANCE_ACTION",
      commandId: "close-assistance",
      entityId: "assistance-test",
      expectedRevision: 2,
      payload: { action: "CLOSE", confirmed: true },
    },
    demoActors.counselor,
    fixedClock,
  );
  expect(await db.assistance.get("assistance-test")).toMatchObject({
    status: "closed",
    alertRuleIds: ["inactive7d", "deadlineApproaching"],
    reviewNote: "已联系学生并核对材料清单。",
  });
  await expect(
    repo.execute(
      {
        type: "CREATE_ASSISTANCE",
        commandId: "cross-assistance",
        entityId: "cross-assistance",
        expectedRevision: 0,
        payload: {
          studentId: "student-011",
          alertRuleIds: ["inactive7d"],
          note: "越权帮扶不应写入。",
          nextReviewAt: "2026-11-16T02:00:00.000Z",
        },
      },
      demoActors.counselor,
      fixedClock,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("S02 admin console and export are admin-only and expose redacted projections", async () => {
  const consoleData = await repo.readAdminConsole(demoActors.admin);
  expect(consoleData.counts).toMatchObject({ students: 40, jobs: 100 });
  expect(consoleData.versions).toEqual({ schema: "1.0", seed: "1.0", algorithm: "1.0" });
  const exported = await repo.exportRedactedAudit(demoActors.admin);
  const text = JSON.stringify(exported);
  expect(text).not.toContain("student001@example.invalid");
  expect(text).not.toContain("校园便民服务平台");
  expect(text).not.toContain("commandId");
  expect(text).not.toContain("actorUserId");
  expect(exported.records.length).toBeGreaterThan(100);
  await expect(repo.readAdminConsole(demoActors.counselor)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
