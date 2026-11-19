import { expect, it } from "vitest";
import { guardPayload } from "../../../src/domain/ai-guard/semantic";
it("AI09 existing question text may retain its original numbers without treating them as answer achievements", () => {
  const variables = {
    sessionId: "s",
    question: {
      questionId: "q",
      type: "behavior",
      text: "请说明3次项目迭代中的个人任务",
      skillIds: [],
      keywords: [],
    },
    followUpCount: 0,
    answers: [],
    jobContext: { title: "教学岗位", skillIds: [] },
  };
  const payload = {
    module: "A2",
    operation: "question",
    sessionId: "s",
    questionId: "q",
    text: variables.question.text,
    evidence: [],
  };
  expect(guardPayload("A2", "question", variables, payload)).toEqual(payload);
  expect(() =>
    guardPayload("A2", "question", variables, {
      ...payload,
      text: "请讲述8次获奖经历",
    }),
  ).toThrow("SEMANTIC_INVALID");
});
