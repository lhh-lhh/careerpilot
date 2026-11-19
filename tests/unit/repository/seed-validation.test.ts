import { expect, it } from "vitest";
import { createSeedPack, validateSeedPack } from "../../../src/data/seed/seed";
it.each([
  [
    "resume foreign key",
    (s: ReturnType<typeof createSeedPack>) => {
      s.resumeVersions[0]!.resumeId = "missing";
    },
  ],
  [
    "event replay",
    (s: ReturnType<typeof createSeedPack>) => {
      s.applicationEvents[0]!.to = "offered";
    },
  ],
  [
    "audit replay",
    (s: ReturnType<typeof createSeedPack>) => {
      s.auditLogs.find(
        (a) => a.entityType === "Destination" && a.action === "APPROVE",
      )!.after!.status = "submitted";
    },
  ],
  [
    "future update",
    (s: ReturnType<typeof createSeedPack>) => {
      s.students[0]!.updatedAt = "2027-01-01T00:00:00Z";
    },
  ],
  [
    "snapshot mismatch",
    (s: ReturnType<typeof createSeedPack>) => {
      s.applications[0]!.matchSnapshot.total = 42;
    },
  ],
  [
    "question foreign key",
    (s: ReturnType<typeof createSeedPack>) => {
      s.mockSessions[0]!.questionIds = ["missing"];
    },
  ],
  [
    "ontology cycle",
    (s: ReturnType<typeof createSeedPack>) => {
      s.skillOntology[0]!.parentIds = [s.skillOntology[0]!.id];
    },
  ],
  [
    "duplicate username",
    (s: ReturnType<typeof createSeedPack>) => {
      s.users[0]!.login = s.users[1]!.login;
    },
  ],
  [
    "company user binding",
    (s: ReturnType<typeof createSeedPack>) => {
      s.users.find((u) => u.role === "company")!.companyId = "missing";
    },
  ],
  [
    "dictionary kind",
    (s: ReturnType<typeof createSeedPack>) => {
      s.jobs[0]!.cityId = "major-1";
    },
  ],
  [
    "version ownership",
    (s: ReturnType<typeof createSeedPack>) => {
      s.applications[0]!.resumeVersionId = s.resumes[1]!.versionIds[0]!;
    },
  ],
  [
    "destination application binding",
    (s: ReturnType<typeof createSeedPack>) => {
      s.destinations[0]!.applicationId = s.applications[1]!.id;
    },
  ],
  [
    "attachment ownership",
    (s: ReturnType<typeof createSeedPack>) => {
      s.attachments[0]!.studentId = "student-002";
    },
  ],
  [
    "event actor",
    (s: ReturnType<typeof createSeedPack>) => {
      s.applicationEvents[0]!.actorUserId = "user-company-001";
    },
  ],
  [
    "event chronology",
    (s: ReturnType<typeof createSeedPack>) => {
      s.applicationEvents[0]!.at = "2026-10-20T02:00:00.000Z";
    },
  ],
  [
    "event name legality",
    (s: ReturnType<typeof createSeedPack>) => {
      s.applicationEvents[1]!.event = "ISSUE_OFFER";
    },
  ],
])("D01 rejects %s before database import", (_label, mutate) => {
  const s = createSeedPack();
  mutate(s);
  expect(validateSeedPack(s).length).toBeGreaterThan(0);
});
