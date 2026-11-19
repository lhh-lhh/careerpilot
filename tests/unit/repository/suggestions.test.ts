import "fake-indexeddb/auto";
import { beforeEach, afterEach, expect, it } from "vitest";
import { createDatabase } from "../../../src/adapters/repository/db";
import { createRepository } from "../../../src/services/repository";
import { demoActors } from "../../../src/types/identity";
import { fixedClock } from "../../../src/domain/clock";
let db: ReturnType<typeof createDatabase>,
  repo: ReturnType<typeof createRepository>;
beforeEach(async () => {
  db = createDatabase(`suggestions-${crypto.randomUUID()}`);
  repo = createRepository(db);
  await repo.initialize();
});
afterEach(async () => {
  await db.delete();
});
async function command() {
  const resume = await repo.readResume(demoActors.student, "student-001"),
    row = resume.sections.projects[0]!,
    before = row.description;
  return {
    type: "DECIDE_SUGGESTION" as const,
    commandId: "accept-once",
    entityId: resume.id,
    expectedRevision: resume.revision,
    payload: {
      traceId: "trace-a",
      suggestionId: "suggestion-a",
      sourceResumeVersionId: resume.versionIds.at(-1)!,
      disposition: "accepted" as "accepted" | "rejected",
      fieldPath: `projects.${row.id}.description`,
      before,
      after: before.replace(/，/g, "；"),
      requiresUserInput: false,
      evidence: [{ start: 0, end: before.length, quote: before }],
    },
  };
}
it("ALG06 accept is explicit, versioned, idempotent and records disposition without raw text", async () => {
  const cmd = await command();
  await repo.execute(cmd, demoActors.student, fixedClock);
  await repo.execute(cmd, demoActors.student, fixedClock);
  const resume = await repo.readResume(demoActors.student, "student-001");
  expect(resume.versionIds).toHaveLength(2);
  expect((await db.resumeVersions.get(resume.versionIds.at(-1)!))!.reason).toBe(
    "acceptedSuggestion",
  );
  expect(resume.sections.projects[0]!.description).toBe(cmd.payload.after);
  const decisions = await db.suggestionDecisions.toArray();
  expect(decisions).toHaveLength(1);
  expect(decisions[0]).not.toHaveProperty("before");
});
it("ALG06 stale version, changed before, placeholders and invented numbers never overwrite", async () => {
  const cmd = await command();
  for (const override of [
    { sourceResumeVersionId: "stale" },
    { before: "old text" },
    { after: "完成38%增长" },
    { requiresUserInput: true },
    { fieldPath: "__proto__.polluted" },
  ]) {
    await expect(
      repo.execute(
        {
          ...cmd,
          commandId: crypto.randomUUID(),
          payload: { ...cmd.payload, ...override },
        },
        demoActors.student,
        fixedClock,
      ),
    ).rejects.toBeDefined();
  }
  expect((await db.resumes.get(cmd.entityId))!.versionIds).toHaveLength(1);
  expect(await db.suggestionDecisions.count()).toBe(0);
});
it("ALG06 reject writes only a decision, and a second disposition cannot change it", async () => {
  const cmd = await command();
  cmd.payload.disposition = "rejected";
  await repo.execute(cmd, demoActors.student, fixedClock);
  expect((await db.resumes.get(cmd.entityId))!.versionIds).toHaveLength(1);
  expect((await db.suggestionDecisions.toArray())[0]).toMatchObject({
    disposition: "rejected",
    resultingResumeVersionId: null,
  });
  await expect(
    repo.execute(
      {
        ...cmd,
        commandId: "accept-after-reject",
        payload: { ...cmd.payload, disposition: "accepted" },
      },
      demoActors.student,
      fixedClock,
    ),
  ).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
});
