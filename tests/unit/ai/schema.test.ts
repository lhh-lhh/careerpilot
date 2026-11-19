import { expect, it } from "vitest";
import {
  validatePayload,
  validateResponse,
} from "../../../src/domain/ai-guard/schema";
const payload = {
  module: "A3",
  operation: "explain",
  jobId: "job-1",
  text: "匹配结果为{{match:total}}，请核对岗位要求。",
  dimensionKeys: ["skill"],
  skillIds: [],
};
it("AI01 accepts only registered module/operation payloads and rejects numeric authority fields", () => {
  expect(validatePayload("A3", "explain", payload)).toBe(true);
  expect(validatePayload("A1", "rewrite", payload)).toBe(false);
  expect(validatePayload("A3", "explain", { ...payload, score: 100 })).toBe(
    false,
  );
  expect(
    validatePayload("A1", "rewrite", {
      module: "A1",
      operation: "rewrite",
      summary: "暂无可改写的描述，请先记录真实经历。",
      suggestions: [],
    }),
  ).toBe(true);
});
it("AI11 response mode/origin/usage combinations cannot pretend RULE is MODEL", () => {
  const response = {
    schemaVersion: "1.0",
    algorithmVersion: "1.0",
    promptVersion: "1.0",
    traceId: "test",
    inputHash: "a".repeat(64),
    domainRevision: "b".repeat(64),
    requestedMode: "REPLAY",
    effectiveMode: "RULE",
    origin: "RULE",
    fallbackReason: "REPLAY_MISS",
    usage: null,
    guard: { passed: true, masked: true, flags: [] },
    data: payload,
  };
  expect(validateResponse(response)).toBe(true);
  expect(validateResponse({ ...response, origin: "MODEL" })).toBe(false);
  expect(
    validateResponse({ ...response, usage: { prompt: 10, completion: 5 } }),
  ).toBe(false);
  expect(
    validateResponse({
      ...response,
      requestedMode: "RULE",
      effectiveMode: "LIVE",
      origin: "MODEL",
    }),
  ).toBe(false);
});
