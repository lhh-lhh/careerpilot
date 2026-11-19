import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { createDatabase } from "../../../src/adapters/repository/db";
import { createRepository } from "../../../src/services/repository";
import { demoActors } from "../../../src/types/identity";
import type { RunRecord } from "../../../src/adapters/ai/types";
const metadata = (): RunRecord => ({
  module: "A1",
  operation: "rewrite",
  traceId: crypto.randomUUID(),
  inputHash: "a".repeat(64),
  domainRevision: "b".repeat(64),
  actorUserId: demoActors.student.userId,
  requestedMode: "REPLAY",
  effectiveMode: "RULE",
  origin: "RULE",
  promptVersion: "1.0",
  schemaVersion: "1.0",
  algorithmVersion: "1.0",
  status: "success",
  fallbackReason: "REPLAY_MISS",
  usage: null,
  masked: true,
  durationMs: 4,
});
it("AI12 run audit stores only whitelisted metadata and binds the actual actor student", async () => {
  const db = createDatabase(`audit-${crypto.randomUUID()}`),
    repo = createRepository(db);
  await repo.initialize();
  const record = {
    ...metadata(),
    variables: { text: "sensitive resume original" },
  };
  await repo.appendAiRun(demoActors.student, record, 0);
  const stored = await db.aiRuns.toArray();
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({
    studentId: "student-001",
    actorUserId: demoActors.student.userId,
    effectiveMode: "RULE",
    usage: null,
  });
  expect(JSON.stringify(stored)).not.toContain("sensitive");
  await expect(
    repo.appendAiRun(demoActors.counselor, metadata(), 0),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await repo.appendAiRun(
    demoActors.student,
    {
      ...metadata(),
      status: "failed",
      effectiveMode: null,
      origin: null,
      inputHash: "",
      fallbackReason: "INPUT_BLOCKED",
      masked: false,
    },
    0,
  );
  expect(
    (await db.aiRuns.toArray()).find((run) => run.status === "failed"),
  ).toMatchObject({ effectiveMode: null, origin: null, usage: null });
  await repo.resetDemo(demoActors.admin);
  await repo.appendAiRun(demoActors.student, metadata(), 0);
  expect(await db.aiRuns.count()).toBe(0);
  await db.delete();
});
