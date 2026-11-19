import "fake-indexeddb/auto";
import { beforeEach, afterEach, expect, it } from "vitest";
import { createDatabase } from "../../../src/adapters/repository/db";
import { createRepository } from "../../../src/services/repository";
import { demoActors } from "../../../src/types/identity";
import { fixedClock } from "../../../src/domain/clock";
let db: ReturnType<typeof createDatabase>,
  repo: ReturnType<typeof createRepository>;
beforeEach(async () => {
  db = createDatabase(`draft-${crypto.randomUUID()}`);
  repo = createRepository(db);
  await repo.initialize();
});
afterEach(async () => {
  await db.delete();
});
it("D02 trim/NFC, stable reorder and dates/foreign keys guard before writing", async () => {
  const r = await repo.readResume(demoActors.student, "student-001");
  const command = {
    type: "SAVE_RESUME" as const,
    commandId: "save",
    entityId: r.id,
    expectedRevision: 1,
    payload: { sections: structuredClone(r.sections) },
  };
  command.payload.sections.basic.name = "  演示姓名  ";
  command.payload.sections.skills.reverse();
  await repo.execute(command, demoActors.student, fixedClock);
  const saved = await repo.readResume(demoActors.student, "student-001");
  expect(saved.sections.basic.name).toBe("演示姓名");
  expect(saved.sections.skills.map((s) => s.id)).toEqual(
    [...r.sections.skills].reverse().map((s) => s.id),
  );
  const invalid = {
    ...command,
    commandId: "bad-date",
    expectedRevision: 2,
    payload: { sections: structuredClone(saved.sections) },
  };
  invalid.payload.sections.experience[0]!.startDate = "2025-02-30";
  await expect(
    repo.execute(invalid, demoActors.student, fixedClock),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  invalid.payload.sections.experience[0]!.startDate = "2025-07-01";
  invalid.payload.sections.skills[0]!.skillId = "missing";
  await expect(
    repo.execute(
      { ...invalid, commandId: "bad-skill" },
      demoActors.student,
      fixedClock,
    ),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
});
it("quota failure preserves prior state and receipt is not created", async () => {
  const r = await repo.readResume(demoActors.student, "student-001");
  const failing = createRepository(db, {
    afterWrite: () => {
      throw new DOMException("full", "QuotaExceededError");
    },
  });
  await expect(
    failing.execute(
      {
        type: "SAVE_RESUME",
        commandId: "quota",
        entityId: r.id,
        expectedRevision: 1,
        payload: { sections: r.sections },
      },
      demoActors.student,
      fixedClock,
    ),
  ).rejects.toMatchObject({ name: "QuotaExceededError" });
  expect((await db.resumes.get(r.id))!.revision).toBe(1);
  expect(await db.commandReceipts.get("quota")).toBeUndefined();
});
