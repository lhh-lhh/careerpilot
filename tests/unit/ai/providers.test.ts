import { expect, it } from "vitest";
import { prepareRequest } from "../../../src/adapters/ai/registry";
import { rulePayload } from "../../../src/adapters/ai/ruleProvider";
import {
  renderText,
  makeChunks,
  validateChunks,
} from "../../../src/adapters/ai/render";
import { createOrchestrator } from "../../../src/adapters/ai/orchestrator";
import type {
  AiRequest,
  AiResponse,
  A1Variables,
  ReplayRecord,
  RunRecord,
} from "../../../src/adapters/ai/types";
import { hashInput } from "../../../src/domain/ai-guard/fingerprint";
import { createSeedPack } from "../../../src/data/seed/seed";
import { deferred } from "../../helpers/deferred";
async function request() {
  return prepareRequest(
    "A1",
    "rewrite",
    {
      resumeVersionId: "version-a",
      fields: [
        {
          fieldPath: "projects.item-a.description",
          text: "项目期间负责开发页面，完成教学任务。",
        },
      ],
      targetJob: null,
      strategy: "structure",
      keepMyTone: false,
    },
    { version: 1 },
    0,
  );
}
async function replay(req: AiRequest): Promise<ReplayRecord> {
  const payload = rulePayload(req);
  return {
    id: "replay-a",
    module: req.module,
    operation: req.operation,
    promptVersion: "1.0",
    schemaVersion: "1.0",
    algorithmVersion: "1.0",
    inputHash: await hashInput({ ...req }),
    domainRevision: req.domainRevision,
    origin: "CURATED",
    reviewedBy: "local-editor",
    reviewedAt: "2026-11-12T02:00:00.000Z",
    payload,
    chunks: makeChunks(renderText(payload)),
  };
}
it("AI05/AI11 exact offline replay retains CURATED origin, new input misses to RULE", async () => {
  const req = await request(),
    runs: RunRecord[] = [];
  const ai = createOrchestrator({
    records: [await replay(req)],
    current: () => ({
      actorUserId: "u",
      epoch: 0,
      domainRevision: req.domainRevision,
    }),
    audit: async (run) => {
      runs.push(run);
    },
  });
  const hit = await ai.complete(req, "REPLAY");
  expect(hit).toMatchObject({
    requestedMode: "REPLAY",
    effectiveMode: "REPLAY",
    origin: "CURATED",
    usage: null,
    fallbackReason: null,
  });
  const changed = { ...req, variables: { ...req.variables, keepMyTone: true } };
  expect(await ai.complete(changed, "REPLAY")).toMatchObject({
    effectiveMode: "RULE",
    origin: "RULE",
    fallbackReason: "REPLAY_MISS",
    usage: null,
  });
  expect(JSON.stringify(runs)).not.toContain("项目期间");
  expect(runs).toHaveLength(2);
});
it("AI04 LIVE failure is attempted once and rejects even when a replay is available", async () => {
  const req = await request();
  let calls = 0;
  const record = await replay(req);
  record.payload = {
    ...record.payload,
    score: 99,
  } as unknown as ReplayRecord["payload"];
  const ai = createOrchestrator({
    records: [record],
    current: () => ({
      actorUserId: "u",
      epoch: 0,
      domainRevision: req.domainRevision,
    }),
    live: async () => {
      calls++;
      throw new Error("RATE_LIMITED");
    },
    audit: async () => {},
  });
  await expect(ai.complete(req, "LIVE")).rejects.toMatchObject({code:'RATE_LIMITED'});
  expect(calls).toBe(1);
});
it.each(['PROVIDER_DISABLED','AUTH_FAILED','QUOTA_EXCEEDED','TIMEOUT','UPSTREAM_ERROR','SCHEMA_INVALID','SEMANTIC_INVALID'])('LIVE %s never emits curated or rule text and audits failure',async code=>{
  const req=await request(),runs:RunRecord[]=[],text:string[]=[];
  const ai=createOrchestrator({records:[await replay(req)],current:()=>({actorUserId:'u',epoch:0,domainRevision:req.domainRevision}),audit:async r=>{runs.push(r);},live:async()=>{throw Error(code);}});
  await expect(ai.stream(req,'LIVE',delta=>text.push(delta))).rejects.toMatchObject({code});
  expect(text).toEqual([]);expect(runs).toHaveLength(1);expect(runs[0]).toMatchObject({status:'failed',effectiveMode:null,origin:null,usage:null,fallbackReason:code});
});
it("AI06 cancellation and changed epoch never fall back or deliver stale text", async () => {
  const req = await request(),
    controller = new AbortController(),
    runs: RunRecord[] = [];
  const ai = createOrchestrator({
    records: [],
    current: () => ({
      actorUserId: "u",
      epoch: 0,
      domainRevision: req.domainRevision,
    }),
    audit: async (run) => {
      runs.push(run);
    },
  });
  controller.abort();
  await expect(
    ai.complete({ ...req, signal: controller.signal }, "REPLAY"),
  ).rejects.toMatchObject({ code: "CANCELLED" });
  const stale = createOrchestrator({
    records: [],
    current: () => ({
      actorUserId: "u",
      epoch: 1,
      domainRevision: req.domainRevision,
    }),
    audit: async (run) => {
      runs.push(run);
    },
  });
  await expect(stale.complete(req, "RULE")).rejects.toMatchObject({
    code: "CANCELLED",
  });
  expect(runs.every((r) => r.status === "cancelled")).toBe(true);
});
it("AI07 stream chunks join renderText without splitting emoji and can be stopped", async () => {
  const req = await request(),
    record = await replay(req);
  const chunks = makeChunks("前进😀，逐步🌱成长", 3);
  expect(chunks.map((c) => c.text).join("")).toBe("前进😀，逐步🌱成长");
  expect(chunks[0]!.t).toBe(0);
  expect(chunks.at(-1)!.t).toBeLessThanOrEqual(3000);
  expect(validateChunks(chunks, "前进😀，逐步🌱成长")).toBe(true);
  expect(
    validateChunks(
      [
        { t: 0, text: "\uD83D" },
        { t: 1, text: "\uDE00" },
      ],
      "😀",
    ),
  ).toBe(false);
  record.chunks = [{ t: 0, text: renderText(record.payload) }];
  const ai = createOrchestrator({
    records: [record],
    current: () => ({
      actorUserId: "u",
      epoch: 0,
      domainRevision: req.domainRevision,
    }),
    audit: async () => {},
  });
  let text = "";
  const result = await ai.stream(req, "REPLAY", (delta) => {
    text += delta;
  });
  expect(text).toBe(renderText(result.data));
  const controller = new AbortController();
  let delivered = 0;
  await expect(
    ai.stream({ ...req, signal: controller.signal }, "RULE", () => {
      delivered++;
      controller.abort();
    }),
  ).rejects.toMatchObject({ code: "CANCELLED" });
  expect(delivered).toBe(1);
});
it("AI01 four RULE modules produce guarded text only and never invent usage or scores", async () => {
  const a1 = await request(),
    match = createSeedPack().applications[0]!.matchSnapshot;
  const requests = [
    a1,
    await prepareRequest(
      "A2",
      "feedback",
      {
        sessionId: "s",
        question: {
          questionId: "q",
          type: "behavior",
          text: "谈谈你的项目",
          skillIds: [],
          keywords: [],
        },
        followUpCount: 0,
        answers: [{ id: "a", kind: "skip", text: "" }],
        jobContext: { title: "教学岗位", skillIds: [] },
      },
      {},
      0,
    ),
    await prepareRequest(
      "A3",
      "explain",
      {
        job: { jobId: match.jobId, title: "教学岗位" },
        match,
        hypotheticalSkillIds: [],
      },
      {},
      0,
    ),
    await prepareRequest(
      "A7",
      "query",
      {
        queryText: "落实率",
        intent: "destinationRate",
        scopeLabel: "范围甲",
        asOf: "2026-11-12T02:00:00.000Z",
        metricContext: [
          {
            metricId: "destinationRate",
            token: "{{metric:destinationRate}}",
            label: "落实率",
            value: 0.5,
          },
        ],
        targetStudents: [],
      },
      {},
      0,
    ),
  ];
  for (const req of requests) {
    const ai = createOrchestrator({
      records: [],
      current: () => ({
        actorUserId: "u",
        epoch: 0,
        domainRevision: req.domainRevision,
      }),
      audit: async () => {},
    });
    const output = await ai.complete(req, "RULE");
    expect(output.effectiveMode).toBe("RULE");
    expect(output.usage).toBeNull();
    expect(renderText(output.data).length).toBeGreaterThan(0);
    expect(output.data).not.toHaveProperty("score");
  }
});

it("AI03 snapshot cannot mutate while hashing or awaiting LIVE; gateway trace remains correlated", async () => {
  const req = await request(),
    entered = deferred<void>(),
    release = deferred<void>();
  const original = structuredClone(req.variables),
    hash = await hashInput({ ...req }),
    runs: RunRecord[] = [];
  let observed: unknown;
  const provider = createOrchestrator({
    records: [],
    current: () => ({
      actorUserId: "u",
      epoch: 0,
      domainRevision: req.domainRevision,
    }),
    audit: async (run) => {
      runs.push(run);
    },
    live: async (input) => {
      entered.resolve();
      await release.promise;
      observed = structuredClone(input.variables);
      return {
        schemaVersion: "1.0",
        algorithmVersion: "1.0",
        promptVersion: "1.0",
        traceId: "gateway-trace",
        inputHash: hash,
        domainRevision: req.domainRevision,
        requestedMode: "LIVE",
        effectiveMode: "LIVE",
        origin: "MODEL",
        fallbackReason: null,
        usage: null,
        guard: { passed: true, masked: true, flags: [] },
        data: rulePayload(input),
      } satisfies AiResponse;
    },
  });
  const pending = provider.complete(req, "LIVE");
  await entered.promise;
  (req.variables as A1Variables).fields[0]!.text = "修改后的内容";
  release.resolve();
  const output = await pending;
  expect(observed).toEqual(original);
  expect(output.traceId).toBe("gateway-trace");
  expect(runs[0]!.traceId).toBe(output.traceId);
});
