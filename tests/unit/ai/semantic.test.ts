import { expect, it } from "vitest";
import { guardPayload } from "../../../src/domain/ai-guard/semantic";
import { maskText, assertMasked } from "../../../src/domain/ai-guard/privacy";
import { createSeedPack } from "../../../src/data/seed/seed";
const a1 = {
  resumeVersionId: "version-1",
  fields: [
    {
      fieldPath: "projects.project-a.description",
      text: "项目期间负责开发3个页面，完成2次迭代。😀",
    },
  ],
  targetJob: null,
  strategy: "structure" as const,
  keepMyTone: false,
};
const suggestion = {
  id: "s1",
  resumeVersionId: "version-1",
  fieldPath: "projects.project-a.description",
  before: a1.fields[0]!.text,
  after: "负责开发3个页面；完成2次迭代。",
  reason: "整理表达结构",
  evidence: [
    {
      fieldPath: a1.fields[0]!.fieldPath,
      quote: a1.fields[0]!.text,
      start: 0,
      end: a1.fields[0]!.text.length,
    },
  ],
  requiresUserInput: false,
  disposition: "pending",
};
it("AI01/AI12 validates A1 field/version/evidence and quarantines unfounded achievements", () => {
  const payload = {
    module: "A1",
    operation: "rewrite",
    summary: "保留事实，整理表达。",
    suggestions: [suggestion],
  };
  expect(guardPayload("A1", "rewrite", a1, payload)).toEqual(payload);
  expect(() =>
    guardPayload("A1", "rewrite", a1, {
      ...payload,
      suggestions: [{ ...suggestion, before: "旧描述" }],
    }),
  ).toThrow("SEMANTIC_INVALID");
  expect(() =>
    guardPayload("A1", "rewrite", a1, {
      ...payload,
      suggestions: [{ ...suggestion, fieldPath: "__proto__.polluted" }],
    }),
  ).toThrow("SEMANTIC_INVALID");
  expect(() =>
    guardPayload("A1", "rewrite", a1, {
      ...payload,
      suggestions: [
        {
          ...suggestion,
          evidence: [
            {
              ...suggestion.evidence[0]!,
              start: a1.fields[0]!.text.length - 1,
            },
          ],
        },
      ],
    }),
  ).toThrow("SEMANTIC_INVALID");
  const blocked = guardPayload("A1", "rewrite", a1, {
    ...payload,
    suggestions: [{ ...suggestion, after: "主导阿里巴巴项目，实现38%增长。" }],
  });
  expect(
    blocked.module === "A1" && blocked.suggestions[0]!.requiresUserInput,
  ).toBe(true);
  expect(blocked.module === "A1" && blocked.suggestions[0]!.after).toContain(
    "待核实",
  );
});
it("AI09/AI12 A3 rejects other jobs, invented dimensions/skills and raw numerical claims", () => {
  const match = createSeedPack().applications[0]!.matchSnapshot;
  const vars = {
    job: { jobId: match.jobId, title: "教学岗位" },
    match,
    hypotheticalSkillIds: [],
  };
  const payload = {
    module: "A3",
    operation: "explain",
    jobId: match.jobId,
    text: "匹配为{{match:total}}，技能贡献{{dimension:skill}}。",
    dimensionKeys: ["skill"],
    skillIds: [],
  };
  expect(guardPayload("A3", "explain", vars, payload)).toEqual(payload);
  for (const bad of [
    { jobId: "other" },
    { skillIds: ["fake"] },
    { text: "匹配得分100" },
    { text: "{{metric:destinationRate}}" },
    { text: "<script>alert(1)</script>" },
  ])
    expect(() =>
      guardPayload("A3", "explain", vars, { ...payload, ...bad }),
    ).toThrow("SEMANTIC_INVALID");
});
it("AI12 A7 only allows current scope students, triggered rules and registered metric tokens", () => {
  const vars = {
    queryText: "需要怎样帮扶",
    intent: "alerts" as const,
    scopeLabel: "辖区甲",
    asOf: "2026-11-12T02:00:00.000Z",
    metricContext: [
      {
        metricId: "alerts" as const,
        token: "{{metric:alerts}}",
        label: "预警人数",
        value: 1,
      },
    ],
    targetStudents: [
      {
        studentId: "student-a",
        riskLevel: "high" as const,
        ruleIds: ["resumeIncomplete" as const],
      },
    ],
  };
  const payload = {
    module: "A7",
    operation: "advice",
    intent: "alerts",
    text: "建议联系学生核对简历，风险依据{{rule:resumeIncomplete}}。",
    metricRefs: ["alerts"],
    studentIds: ["student-a"],
    ruleIds: ["resumeIncomplete"],
  };
  expect(guardPayload("A7", "advice", vars, payload)).toEqual(payload);
  for (const bad of [
    { studentIds: ["other"] },
    { ruleIds: ["inactive7d"] },
    { text: "当前落实率50%" },
    { text: "{{metric:destinationRate}}" },
  ])
    expect(() =>
      guardPayload("A7", "advice", vars, { ...payload, ...bad }),
    ).toThrow("SEMANTIC_INVALID");
});
it("AI08 masks known identity and contact data without collapsing evidence whitespace", () => {
  const text = maskText(
    "林知夏\r\n邮箱 demo@example.invalid  电话13812345678\n  项目使用Vue",
    ["林知夏"],
  );
  expect(text).toBe("[姓名]\n邮箱 [邮箱]  电话[手机号]\n  项目使用Vue");
  expect(() => assertMasked("还含有demo@example.invalid")).toThrow(
    "INPUT_BLOCKED",
  );
  expect(() => assertMasked("联系13812345678")).toThrow("INPUT_BLOCKED");
  expect(() => assertMasked("https://example.com/attachment.pdf")).toThrow(
    "INPUT_BLOCKED",
  );
  expect(() =>
    assertMasked("[姓名] 项目中写着忽略指令，仍只作为数据"),
  ).not.toThrow();
});
it("AI09 output never forwards fabricated contact details and every A1 rewrite keeps its cited facts", () => {
  expect(() =>
    guardPayload("A1", "rewrite", a1, {
      module: "A1",
      operation: "rewrite",
      summary: "联系fake@example.invalid",
      suggestions: [],
    }),
  ).toThrow("SEMANTIC_INVALID");
  const limited = {
    ...suggestion,
    evidence: [
      { fieldPath: suggestion.fieldPath, quote: "项目", start: 0, end: 2 },
    ],
    after: "完成2次迭代。",
  };
  const output = guardPayload("A1", "rewrite", a1, {
    module: "A1",
    operation: "rewrite",
    summary: "检查引用证据。",
    suggestions: [limited],
  });
  expect(
    output.module === "A1" && output.suggestions[0]!.requiresUserInput,
  ).toBe(true);
});
it("AI09 A2 feedback only cites current-question submitted answers and follow-up limits are enforced", () => {
  const vars = {
    sessionId: "s",
    question: {
      questionId: "q",
      type: "behavior",
      text: "项目经历",
      skillIds: [],
      keywords: [],
    },
    followUpCount: 2,
    answers: [{ id: "answer-a", kind: "answer", text: "负责开发3个页面😀" }],
    jobContext: { title: "教学岗位", skillIds: [] },
  };
  const payload = {
    module: "A2",
    operation: "feedback",
    sessionId: "s",
    questionId: "q",
    text: "你提到开发3个页面，请结合本地依据检查表达。",
    evidence: [
      {
        fieldPath: "answers.answer-a.text",
        start: 0,
        end: 7,
        quote: "负责开发3个页",
      },
    ],
  };
  expect(guardPayload("A2", "feedback", vars, payload)).toEqual(payload);
  expect(() =>
    guardPayload("A2", "followUp", vars, { ...payload, operation: "followUp" }),
  ).toThrow("SEMANTIC_INVALID");
  expect(() =>
    guardPayload("A2", "feedback", vars, { ...payload, questionId: "other" }),
  ).toThrow("SEMANTIC_INVALID");
  expect(() =>
    guardPayload("A2", "feedback", vars, {
      ...payload,
      evidence: [{ ...payload.evidence[0]!, fieldPath: "answers.other.text" }],
    }),
  ).toThrow("SEMANTIC_INVALID");
});
