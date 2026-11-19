import { expect, it } from "vitest";
import { createSeedPack } from "../../../src/data/seed/seed";
import {
  experienceMonths,
  match,
  prepareOntology,
  weightedScore,
  whatIf,
} from "../../../src/domain/matching/scoring";
import { FIXED_NOW } from "../../../src/domain/clock";
it("salary, academic relation, missing values and duplicates retain explicit six-dimensional semantics", () => {
  const s = createSeedPack(),
    r = s.resumes[0]!,
    j = s.jobs[0]!;
  j.preferredMajorIds = ["major-2"];
  expect(
    match(r, j, undefined, s.skillOntology, s.dictionaries, FIXED_NOW)
      .dimensions[1]!.score,
  ).toBe(0.7);
  j.preferredMajorIds = ["major-3"];
  expect(
    match(r, j, undefined, s.skillOntology, s.dictionaries, FIXED_NOW)
      .dimensions[1]!.score,
  ).toBe(0.3);
  j.preferredMajorIds = ["major-1"];
  j.minDegree = "master";
  j.minExperienceMonths = 4;
  r.sections.intent.cityIds = [];
  r.sections.intent.expectedSalary = { min: 20000, max: 25000 };
  j.salaryRange = { min: 8000, max: 10000 };
  const m = match(r, j, undefined, s.skillOntology, s.dictionaries, FIXED_NOW);
  expect(m.dimensions.map((x) => x.score)).toEqual([1, 1, 0.5, 1, 0.5, 0.5]);
  j.minDegree = "doctor";
  expect(
    match(r, j, undefined, s.skillOntology, s.dictionaries, FIXED_NOW)
      .dimensions[2]!.score,
  ).toBe(0);
  j.minDegree = null;
  r.sections.basic.degree = null;
  j.requiredSkills = [];
  r.sections.intent.expectedSalary = null;
  expect(
    match(r, j, undefined, s.skillOntology, s.dictionaries, FIXED_NOW)
      .dimensions[0]!.score,
  ).toBe(1);
  expect(
    experienceMonths(
      [
        { startDate: "2025-01-01", endDate: "2025-03-01" },
        { startDate: "2025-05-01", endDate: null },
      ],
      "2025-07-01T00:00:00Z",
    ),
  ).toBe(4);
  j.requiredSkills = [
    { skillId: "skill-1", weight: 1 },
    { skillId: "skill-1", weight: 2 },
  ];
  r.sections.skills = [];
  const gaps = match(
    r,
    j,
    undefined,
    s.skillOntology,
    s.dictionaries,
    FIXED_NOW,
  ).missingSkills;
  expect(gaps).toHaveLength(1);
  expect(gaps[0]!.gain).toBe(35);
  expect(() =>
    whatIf(
      r,
      [j],
      ["unregistered"],
      undefined,
      s.skillOntology,
      s.dictionaries,
      FIXED_NOW,
    ),
  ).toThrow();
});
it("rejects ambiguous aliases, missing parents, invalid dates and unsafe numeric inputs", () => {
  const s = createSeedPack();
  s.skillOntology[1]!.aliases = ["js"];
  expect(() => prepareOntology(s.skillOntology)).toThrow();
  s.skillOntology[1]!.aliases = [];
  s.skillOntology[0]!.parentIds = ["missing"];
  expect(() => prepareOntology(s.skillOntology)).toThrow();
  expect(() =>
    experienceMonths([{ startDate: "2025-02-30", endDate: null }], FIXED_NOW),
  ).toThrow();
  expect(() => weightedScore([2, 1, 1, 1, 1, 1])).toThrow();
  const valid = createSeedPack(),
    r = valid.resumes[0]!,
    j = valid.jobs[0]!;
  j.salaryRange = { min: NaN, max: 100 };
  expect(() =>
    match(r, j, undefined, valid.skillOntology, valid.dictionaries, FIXED_NOW),
  ).toThrow();
});
