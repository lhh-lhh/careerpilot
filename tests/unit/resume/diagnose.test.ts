import { expect, it } from "vitest";
import {
  diagnose,
  assertSuggestion,
  textSignals,
} from "../../../src/domain/resume/diagnose";
import { createSeedPack } from "../../../src/data/seed/seed";
import { FIXED_NOW } from "../../../src/domain/clock";
it("ALG05 independently fixed complete/without experience/empty scores", () => {
  const s = createSeedPack(),
    r = s.resumes[0]!;
  expect(diagnose(r, null, s.skillOntology, FIXED_NOW).total).toBe(100);
  r.sections.experience = [];
  expect(diagnose(r, null, s.skillOntology, FIXED_NOW).total).toBe(75);
  r.sections.basic = { name: "", email: "", majorId: null, degree: null };
  r.sections.education = [];
  r.sections.projects = [];
  r.sections.skills = [];
  r.sections.certificates = [];
  expect(diagnose(r, null, s.skillOntology, FIXED_NOW).total).toBe(0);
});
it("ALG03 exact ATS differs from hierarchy, empty JD is not applicable", () => {
  const s = createSeedPack(),
    r = s.resumes[0]!,
    j = s.jobs[1]!;
  r.sections.skills = [{ id: "one", skillId: "skill-pinia" }];
  expect(diagnose(r, j, s.skillOntology, FIXED_NOW).ats).toBe(0);
  j.requiredSkills = [];
  expect(diagnose(r, j, s.skillOntology, FIXED_NOW).ats).toBeNull();
});
it("ALG06 stale text and invented facts/placeholder cannot be silently accepted", () => {
  const suggestion = {
    resumeVersionId: "v1",
    fieldPath: "projects/p1/description",
    before: "负责页面开发",
    after: "负责页面开发并提升38%",
    evidence: [],
  };
  expect(() => assertSuggestion("v2", "负责页面开发", suggestion)).toThrow(
    "STALE_SUGGESTION",
  );
  expect(() => assertSuggestion("v1", "负责页面开发", suggestion)).toThrow(
    "REQUIRES_USER_INPUT",
  );
  expect(() =>
    assertSuggestion("v1", "负责页面开发", {
      ...suggestion,
      after: "主导页面开发",
    }),
  ).toThrow();
  expect(() =>
    assertSuggestion("v1", "负责页面开发", {
      ...suggestion,
      after: "负责页面开发：[请填写经核实的成果]",
    }),
  ).toThrow();
  expect(() =>
    assertSuggestion("v1", "负责页面开发", {
      ...suggestion,
      after: "负责页面开发。",
    }),
  ).not.toThrow();
});
it("STAR and numbers always return exact original slices, years are not results", () => {
  const text = "2025年，项目期间负责开发任务，实现3个页面，最后交付。";
  const result = textSignals(text);
  expect(result.quantified.map((x) => x.quote)).toEqual(["3个"]);
  for (const evidence of [
    ...Object.values(result.star).flat(),
    ...result.quantified,
  ])
    expect(text.slice(evidence.start, evidence.end)).toBe(evidence.quote);
});
