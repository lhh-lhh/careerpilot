import { expect, it } from "vitest";
import {
  scoreAnswer,
  buildReport,
  selectQuestions,
  nextFollowUp,
} from "../../../src/domain/interview/scoring";
import { createSeedPack } from "../../../src/data/seed/seed";
it("ALG07 blank score is zero; evidence is sliced from answer and skill conflicts explicit", () => {
  const s = createSeedPack(),
    q = s.mockQuestions[0]!;
  expect(scoreAnswer(q, "", s.skillOntology).total).toBe(0);
  const text =
    "项目期间，我负责开发任务。首先使用JavaScript实现3个页面，最后交付2次迭代。";
  const score = scoreAnswer(q, text, s.skillOntology);
  expect(score.total).toBeGreaterThan(80);
  for (const evidence of Object.values(score.evidence).flat())
    expect(text.slice(evidence.start, evidence.end)).toBe(evidence.quote);
  const conflict = scoreAnswer(
    q,
    "JavaScript独立完成但未参与。",
    s.skillOntology,
  );
  expect(conflict.dimensions.consistency).toBe(50);
  expect(
    scoreAnswer(q, "独立完成A项目，未参与B项目。", s.skillOntology).dimensions
      .consistency,
  ).toBe(100);
});
it("report with no answers null; comparative growth only identical rubric/job/question set", () => {
  const s = createSeedPack(),
    m = s.mockSessions[0]!;
  expect(buildReport(m, s.mockQuestions, s.skillOntology, null)).toBeNull();
  m.answers = [
    {
      id: "a",
      questionId: m.questionIds[0]!,
      kind: "skip",
      text: "",
      submittedAt: m.createdAt,
      evidence: [],
    },
  ];
  const report = buildReport(m, s.mockQuestions, s.skillOntology, null)!;
  expect(report.overall).toBe(0);
  expect(report.completion).toBeCloseTo(1 / 3);
  expect(report.growthDelta).toBeNull();
  const previous = { ...m, state: "completed" as const, report };
  expect(
    buildReport(m, s.mockQuestions, s.skillOntology, previous)!.growthDelta,
  ).toBe(0);
  expect(
    buildReport(
      { ...m, targetJobId: "different" },
      s.mockQuestions,
      s.skillOntology,
      previous,
    )!.growthDelta,
  ).toBeNull();
});
it("questions deterministic by uncovered gain, one per type; followups bounded", () => {
  const s = createSeedPack(),
    questions = selectQuestions(s.mockQuestions, ["skill-1"]);
  expect(questions.map((q) => q.type).sort()).toEqual([
    "behavior",
    "hr",
    "technical",
  ]);
  expect(
    selectQuestions(s.mockQuestions, ["skill-1"]).map((q) => q.id),
  ).toEqual(questions.map((q) => q.id));
  expect(nextFollowUp(questions[0]!, "毫无相关信息", 0)).toContain("结合问题");
  expect(nextFollowUp(questions[0]!, "毫无相关信息", 2)).toBeNull();
});
