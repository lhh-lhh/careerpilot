import { expect, it } from "vitest";
import {
  scoreAnswer,
  nextFollowUp,
  selectQuestions,
} from "../../../src/domain/interview/scoring";
import { createSeedPack } from "../../../src/data/seed/seed";
it("missing-result and quantification followups do not fabricate evidence", () => {
  const s = createSeedPack(),
    q = s.mockQuestions[0]!;
  expect(nextFollowUp(q, "项目中负责开发任务", 0)).toContain("结果");
  expect(nextFollowUp(q, "项目任务已经完成交付", 0)).toContain("核实");
  expect(nextFollowUp(q, "项目任务完成3个页面", 0)).toBeNull();
  expect(selectQuestions([], [])).toEqual([]);
  const noSkill = { ...q, skillIds: [] };
  const text = "项目任务。首先分析。";
  const score = scoreAnswer(noSkill, text, s.skillOntology);
  expect(score.dimensions.skill).toBe(score.dimensions.relevance);
  expect(
    scoreAnswer(
      q,
      "JavaScript独立完成但未参与，也没有使用但熟练使用。",
      s.skillOntology,
    ).dimensions.consistency,
  ).toBe(0);
});
