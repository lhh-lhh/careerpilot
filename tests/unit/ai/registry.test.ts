import { expect, it } from "vitest";
import {
  prepareRequest,
  assertRequest,
} from "../../../src/adapters/ai/registry";
const variables = {
  resumeVersionId: "version-a",
  fields: [],
  targetJob: null,
  strategy: "structure",
  keepMyTone: false,
};
it("AI08 strict input registry rejects secrets, extra fields, wrong operations, oversized and unmasked text", async () => {
  const req = await prepareRequest(
    "A1",
    "rewrite",
    variables,
    { version: "a" },
    0,
  );
  expect(req.domainRevision).toMatch(/^[a-f0-9]{64}$/);
  expect(() => assertRequest(req)).not.toThrow();
  for (const extra of [
    { apiKey: "not-a-secret" },
    { fields: [{ fieldPath: "basic.email", text: "example@example.invalid" }] },
    { fields: [{ fieldPath: "projects.x.description", text: "13812345678" }] },
    {
      fields: [
        { fieldPath: "projects.x.description", text: "字".repeat(4001) },
      ],
    },
    {
      targetJob: {
        jobId: "a",
        title: "a",
        jdText: "https://example.com/",
        skillIds: [],
      },
    },
  ]) {
    await expect(
      prepareRequest("A1", "rewrite", { ...variables, ...extra }, {}, 0),
    ).rejects.toMatchObject({ code: "INPUT_BLOCKED" });
  }
  await expect(
    prepareRequest("A1", "feedback", variables, {}, 0),
  ).rejects.toMatchObject({ code: "INPUT_BLOCKED" });
});
it("AI03 normalized skill sets do not reorder answer arrays and relevant snapshot controls domain revision", async () => {
  const v = {
    sessionId: "session-a",
    question: {
      questionId: "q-a",
      type: "hr",
      text: "请描述项目经历",
      skillIds: ["b", "a", "a"],
      keywords: [],
    },
    followUpCount: 0,
    answers: [
      { id: "a1", kind: "answer", text: "先完成开发" },
      { id: "a2", kind: "followUp", text: "再交付成果" },
    ],
    jobContext: { title: "教学岗位", skillIds: [] },
  };
  const req = await prepareRequest(
    "A2",
    "feedback",
    v,
    { clock: "fixed", version: 1 },
    0,
  );
  expect(
    "question" in req.variables && req.variables.question.skillIds,
  ).toEqual(["a", "b"]);
  expect(
    "answers" in req.variables && req.variables.answers.map((a) => a.id),
  ).toEqual(["a1", "a2"]);
  const changed = await prepareRequest(
    "A2",
    "feedback",
    v,
    { version: 2, clock: "fixed" },
    0,
  );
  expect(changed.domainRevision).not.toBe(req.domainRevision);
});
