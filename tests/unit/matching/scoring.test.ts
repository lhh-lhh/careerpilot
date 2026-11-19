import { describe, expect, it } from "vitest";
import {
  weightedScore,
  match,
  experienceMonths,
  prepareOntology,
  skillHit,
  rankJobs,
  whatIf,
} from "../../../src/domain/matching/scoring";
import { createSeedPack } from "../../../src/data/seed/seed";
import { FIXED_NOW } from "../../../src/domain/clock";
describe("ALG01 fixed six dimensions and honest contribution", () => {
  it.each([
    [1, 1, 1, 1, 1, 1, 100],
    [1, 1, 1, 0, 1, 1, 85],
    [0, 0, 0, 0, 0, 0, 0],
  ])("vector %j", (...vector) =>
    expect(
      weightedScore(vector.slice(0, 6), [0.35, 0.2, 0.1, 0.15, 0.1, 0.1]),
    ).toBe(vector[6]),
  );
  it("zero weights default, negative/nonfinite/dimension errors reject", () => {
    expect(weightedScore([1, 1, 1, 0, 1, 1], [0, 0, 0, 0, 0, 0])).toBe(85);
    for (const value of [-1, NaN, Infinity])
      expect(() =>
        weightedScore([1, 1, 1, 1, 1, 1], [value, 1, 1, 1, 1, 1]),
      ).toThrow();
    expect(() => weightedScore([1], [1])).toThrow();
  });
});
it("ALG02 registered aliases and directed descendant-only partial credit, cycles rejected", () => {
  const seed = createSeedPack(),
    ontology = prepareOntology(seed.skillOntology);
  expect(skillHit(["js"], "skill-1", ontology)).toBe(1);
  expect(skillHit(["skill-pinia"], "skill-2", ontology)).toBe(0.5);
  expect(skillHit(["skill-2"], "skill-pinia", ontology)).toBe(0);
  expect(skillHit(["unknown"], "skill-1", ontology)).toBe(0);
  seed.skillOntology[1]!.parentIds = ["skill-pinia"];
  expect(() => prepareOntology(seed.skillOntology)).toThrow();
});
it("ALG03 experience unions calendar months; missing data is explicit", () => {
  expect(
    experienceMonths(
      [
        { startDate: "2025-01-01", endDate: "2025-04-01" },
        { startDate: "2025-03-01", endDate: "2025-06-01" },
      ],
      FIXED_NOW,
    ),
  ).toBe(5);
  expect(() =>
    experienceMonths(
      [{ startDate: "2025-06-01", endDate: "2025-04-01" }],
      FIXED_NOW,
    ),
  ).toThrow();
  const s = createSeedPack(),
    resume = s.resumes[0]!,
    job = s.jobs[0]!;
  resume.sections.basic.majorId = null;
  job.preferredMajorIds = ["major-2"];
  job.salaryRange = null;
  const result = match(
    resume,
    job,
    [0.333, 0.222, 0.111, 0.111, 0.111, 0.112],
    s.skillOntology,
    s.dictionaries,
    FIXED_NOW,
  );
  expect(result.dimensions.find((d) => d.key === "major")).toMatchObject({
    score: 0.5,
    missingData: true,
  });
  expect(result.dimensions.find((d) => d.key === "salary")).toMatchObject({
    score: 0.5,
    missingData: true,
  });
  expect(
    Math.round(
      result.dimensions.reduce((sum, d) => sum + d.contribution, 0) * 10,
    ) / 10,
  ).toBe(result.total);
});
it("ALG04 stable ties and what-if cannot mutate original resume or history", () => {
  const s = createSeedPack(),
    r = s.resumes[0]!,
    jobs = s.jobs.slice(0, 2),
    before = structuredClone(r);
  r.sections.skills = [];
  const empty = structuredClone(r);
  const result = whatIf(
    r,
    jobs,
    ["skill-1"],
    undefined,
    s.skillOntology,
    s.dictionaries,
    FIXED_NOW,
  );
  expect(result.find((x) => x.jobId === jobs[0]!.id)!.delta).toBe(35);
  expect(r).toEqual(empty);
  expect(before.sections.skills.length).toBe(8);
  expect(
    rankJobs(
      before,
      [jobs[1]!, jobs[0]!],
      undefined,
      s.skillOntology,
      s.dictionaries,
      FIXED_NOW,
    ).map((x) => x.jobId),
  ).toEqual(["job-001", "job-002"]);
});
