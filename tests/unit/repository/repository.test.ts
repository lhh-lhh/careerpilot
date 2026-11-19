import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../../../src/adapters/repository/db";
import { createSeedPack, validateSeedPack } from "../../../src/data/seed/seed";
import { createRepository } from "../../../src/services/repository";
import { demoActors } from "../../../src/types/identity";
import { fixedClock } from "../../../src/domain/clock";

let db: ReturnType<typeof createDatabase>;
let repo: ReturnType<typeof createRepository>;
beforeEach(async () => {
  db = createDatabase(`test-${crypto.randomUUID()}`);
  repo = createRepository(db);
  await repo.initialize();
});
afterEach(async () => {
  await db.delete();
});

describe("D01 exact fictional seed and atomic rejection", () => {
  it("has fixed counts, real readable blobs and independently specified statuses", async () => {
    const pack = createSeedPack();
    expect(validateSeedPack(pack)).toEqual([]);
    expect(pack.students).toHaveLength(40);
    expect(pack.users).toHaveLength(53);
    expect(pack.jobs).toHaveLength(100);
    expect(pack.applications).toHaveLength(120);
    expect(pack.interviews).toHaveLength(40);
    expect(pack.agreements.filter((a) => a.status === "signed")).toHaveLength(
      12,
    );
    expect(
      pack.destinations.filter((d) => d.status === "approved"),
    ).toHaveLength(20);
    expect(await pack.attachments[0]!.blob.text()).toContain("教学示例");
    const bad = createSeedPack();
    bad.students[0]!.counselorId = "missing";
    await expect(repo.resetDemo(demoActors.admin, bad)).rejects.toMatchObject({
      code: "INVALID_SEED",
    });
    expect(await db.students.count()).toBe(40);
  });
});

it("S01 injects scope: students own resume, company consent snapshots, counselor own students", async () => {
  const mine = await repo.readResume(demoActors.student, "student-001");
  expect(mine.studentId).toBe("student-001");
  await expect(
    repo.readResume(demoActors.student, "student-002"),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    repo.readResume(demoActors.company, "student-001"),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await repo.listStudents(demoActors.counselor)).toHaveLength(10);
  const companyApps = await repo.listApplications(demoActors.company);
  expect(companyApps.length).toBeGreaterThan(0);
  expect(
    companyApps.every(
      (a) => a.resumeConsent && a.resumeSnapshot.basic.email === "[已脱敏]",
    ),
  ).toBe(true);
  const forbidden = (await db.applications.toArray()).find(
    (a) => !companyApps.some((x) => x.id === a.id),
  )!;
  await expect(
    repo.readApplication(demoActors.company, forbidden.id),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("D03/D04 resume writes are revision-checked, append-only and idempotent", async () => {
  const initial = await repo.readResume(demoActors.student, "student-001");
  const sections = structuredClone(initial.sections);
  sections.basic.name = "演示同学甲";
  const command = {
    type: "SAVE_RESUME" as const,
    commandId: "cmd-one",
    entityId: initial.id,
    expectedRevision: initial.revision,
    payload: { sections },
  };
  const first = await repo.execute(command, demoActors.student, fixedClock);
  expect(await repo.execute(command, demoActors.student, fixedClock)).toEqual(
    first,
  );
  expect(
    await db.resumeVersions.where("resumeId").equals(initial.id).count(),
  ).toBe(2);
  await expect(
    repo.execute(
      { ...command, commandId: "cmd-two" },
      demoActors.student,
      fixedClock,
    ),
  ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  await expect(
    repo.execute(
      { ...command, payload: { sections: initial.sections } },
      demoActors.student,
      fixedClock,
    ),
  ).rejects.toMatchObject({ code: "COMMAND_COLLISION" });
  expect(
    (await repo.readResume(demoActors.student, "student-001")).sections.basic
      .name,
  ).toBe("演示同学甲");
});

it("D05 injected transaction failure rolls back entity, version, audit and receipt", async () => {
  const initial = await repo.readResume(demoActors.student, "student-001");
  const count = await db.auditLogs.count();
  const failing = createRepository(db, {
    afterWrite: () => {
      throw new Error("injected failure");
    },
  });
  await expect(
    failing.execute(
      {
        type: "SAVE_RESUME",
        commandId: "cmd-fail",
        entityId: initial.id,
        expectedRevision: 1,
        payload: { sections: initial.sections },
      },
      demoActors.student,
      fixedClock,
    ),
  ).rejects.toThrow("injected");
  expect((await db.resumes.get(initial.id))!.revision).toBe(1);
  expect(await db.resumeVersions.count()).toBe(40);
  expect(await db.auditLogs.count()).toBe(count);
  expect(await db.commandReceipts.get("cmd-fail")).toBeUndefined();
});

it("S02 personal erase is scoped, cascades dependent stores and anonymizes audit", async () => {
  const before = await db.applications
    .where("studentId")
    .equals("student-002")
    .count();
  await expect(
    repo.clearMyData(demoActors.student, false),
  ).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
  await repo.clearMyData(demoActors.student, true);
  expect(await db.students.count()).toBe(39);
  expect(
    await db.resumes.where("studentId").equals("student-001").count(),
  ).toBe(0);
  expect(
    await db.applications.where("studentId").equals("student-001").count(),
  ).toBe(0);
  expect(
    await db.applications.where("studentId").equals("student-002").count(),
  ).toBe(before);
  expect(JSON.stringify(await db.auditLogs.toArray())).not.toContain(
    '"student-001"',
  );
});
it("S01 admin snapshot audits each disclosed resume while counselor stays scoped", async () => {
  const snapshot = await repo.readScopedSnapshot(demoActors.admin);
  expect(snapshot.resumes).toHaveLength(40);
  const reads = await db.auditLogs
    .filter((r) => r.action === "ADMIN_READ_RESUME")
    .toArray();
  expect(new Set(reads.map((r) => r.entityId)).size).toBe(40);
  expect(
    reads.every(
      (r) =>
        r.actorUserId === demoActors.admin.userId &&
        r.after?.studentId &&
        !JSON.stringify(r).includes("@"),
    ),
  ).toBe(true);
  const scoped = await repo.readScopedSnapshot(demoActors.counselor);
  expect(scoped.resumes).toHaveLength(10);
  expect(
    await db.auditLogs.filter((r) => r.action === "ADMIN_READ_RESUME").count(),
  ).toBe(40);
});
