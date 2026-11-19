import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createDatabase } from "../../../src/adapters/repository/db";
import { createRepository } from "../../../src/services/repository";
import { fixedClock } from "../../../src/domain/clock";
import { demoActors } from "../../../src/types/identity";

let db: ReturnType<typeof createDatabase>;
let repo: ReturnType<typeof createRepository>;

beforeEach(async () => {
  db = createDatabase(`jobs-${crypto.randomUUID()}`);
  repo = createRepository(db);
  await repo.initialize();
});

afterEach(async () => {
  await db.delete();
});

it("L02 company creates a scoped manual draft, publishes it and cannot spoof ownership", async () => {
  const payload = {
    title: "校园前端开发实习生",
    categoryId: "jobCategory-digital",
    industryId: "industry-1",
    cityId: "city-2",
    salaryRange: { min: 9000, max: 13000 },
    requiredSkills: [{ skillId: "skill-2", weight: 1 }],
    preferredMajorIds: ["major-1"],
    minDegree: "bachelor",
    minExperienceMonths: 0,
    jdText:
      "参与校园数字产品的前端开发，与产品和设计同学协作完成真实功能交付。",
    deadline: "2026-12-20T16:00:00.000Z",
  };
  await repo.execute(
    {
      type: "SAVE_JOB",
      commandId: "create-job",
      entityId: "manual-job",
      expectedRevision: 0,
      payload,
    },
    demoActors.company,
    fixedClock,
  );
  expect(await db.jobs.get("manual-job")).toMatchObject({
    companyId: "company-001",
    status: "draft",
    revision: 1,
  });
  await repo.execute(
    {
      type: "JOB_ACTION",
      commandId: "publish-job",
      entityId: "manual-job",
      expectedRevision: 1,
      payload: { action: "PUBLISH" },
    },
    demoActors.company,
    fixedClock,
  );
  expect(await db.jobs.get("manual-job")).toMatchObject({
    status: "published",
    revision: 2,
  });
  await expect(
    repo.execute(
      {
        type: "SAVE_JOB",
        commandId: "student-spoof",
        entityId: "spoofed-job",
        expectedRevision: 0,
        payload,
      },
      demoActors.student,
      fixedClock,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
