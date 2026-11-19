import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { createDatabase } from "../../../src/adapters/repository/db";
import { createRepository } from "../../../src/services/repository";
import { demoActors } from "../../../src/types/identity";
import { fixedClock } from "../../../src/domain/clock";
it("resume history only returns scoped versions in version-number order", async () => {
  const db = createDatabase(`history-${crypto.randomUUID()}`), repo = createRepository(db);
  try {
    await repo.initialize();
    const resume = await repo.readResume(demoActors.student, "student-001");
    resume.sections.projects[0]!.description += "本人核对后的补充。";
    await repo.execute({ type: "SAVE_RESUME", commandId: crypto.randomUUID(), entityId: resume.id, expectedRevision: 1, payload: { sections: resume.sections } }, demoActors.student, fixedClock);
    expect((await repo.readResumeHistory(demoActors.student, "student-001")).map(v => v.number)).toEqual([1, 2]);
    await expect(repo.readResumeHistory(demoActors.student, "student-002")).rejects.toMatchObject({ code: "FORBIDDEN" });
  } finally { await db.delete(); }
});
