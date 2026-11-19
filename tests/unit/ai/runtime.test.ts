import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { createAiRuntime } from "../../../src/services/ai-runtime";
import { createDatabase } from "../../../src/adapters/repository/db";
import { createRepository } from "../../../src/services/repository";
import { demoActors } from "../../../src/types/identity";
import { prepareRequest } from "../../../src/adapters/ai/registry";
import { deferred } from "../../helpers/deferred";
it("D08 reset cancels an in-flight AI request and no late provider result overwrites the reset epoch", async () => {
  const db = createDatabase(`ai-reset-${crypto.randomUUID()}`);
  const runtime = createAiRuntime();
  const repo = createRepository(db, { invalidate: () => runtime.cancelAll() });
  await repo.initialize();
  const req = await prepareRequest(
    "A1",
    "rewrite",
    {
      resumeVersionId: "v",
      fields: [],
      targetJob: null,
      strategy: "structure",
      keepMyTone: false,
    },
    {},
    0,
  );
  let aborted = false;
  const started = deferred<void>();
  const promise = runtime.run(req, "LIVE", {
    records: [],
    current: () => ({
      actorUserId: demoActors.student.userId,
      epoch: repo.epoch,
      domainRevision: req.domainRevision,
    }),
    audit: async (run) => repo.appendAiRun(demoActors.student, run, req.epoch),
    live: (request) =>
      new Promise((_resolve, reject) => {
        started.resolve();
        request.signal!.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new Error("CANCELLED"));
          },
          { once: true },
        );
      }),
  });
  const outcome = promise.catch((error) => error);
  await Promise.race([started.promise, outcome]);
  await repo.resetDemo(demoActors.admin);
  expect(await outcome).toMatchObject({ code: "CANCELLED" });
  expect(aborted).toBe(true);
  expect(repo.epoch).toBe(1);
  expect(
    (await db.aiRuns.toArray()).every((run) => run.status !== "success"),
  ).toBe(true);
  await db.delete();
});

it("AI06 caller cancellation stops preview and records cancellation without fallback", async () => {
  const runtime = createAiRuntime(),
    controller = new AbortController();
  const req = await prepareRequest(
    "A1",
    "rewrite",
    {
      resumeVersionId: "v",
      fields: [],
      targetJob: null,
      strategy: "structure",
      keepMyTone: false,
    },
    {},
    0,
    controller.signal,
  );
  const runs: import("../../../src/adapters/ai/types").RunRecord[] = [];
  let text = "";
  const outcome = runtime
    .run(
      req,
      "RULE",
      {
        records: [],
        current: () => ({
          actorUserId: "u",
          epoch: 0,
          domainRevision: req.domainRevision,
        }),
        audit: async (run) => {
          runs.push(run);
        },
      },
      (delta) => {
        text += delta;
        controller.abort();
      },
    )
    .catch((error) => error);
  expect(await outcome).toMatchObject({ code: "CANCELLED" });
  expect(text.length).toBeGreaterThan(0);
  expect(runs).toHaveLength(1);
  expect(runs[0]!.status).toBe("cancelled");
});
