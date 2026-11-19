import type {
  DateRange,
  Dictionary,
  Job,
  MatchExplanation,
  MatchKey,
  Resume,
  SkillOntology,
} from "../../types/entities";
import { requireCondition } from "../errors";
export const MATCH_KEYS: readonly MatchKey[] = [
  "skill",
  "major",
  "degree",
  "city",
  "salary",
  "experience",
];
export const DEFAULT_WEIGHTS = [0.35, 0.2, 0.1, 0.15, 0.1, 0.1] as const;
export const DEGREE_LEVEL: Record<string, number> = {
  secondary: 1,
  associate: 2,
  bachelor: 3,
  master: 4,
  doctor: 5,
};
export const round1 = (value: number) =>
  Math.round((value + Number.EPSILON) * 10) / 10;
export function normalizeWeights(
  weights: readonly number[] = DEFAULT_WEIGHTS,
): number[] {
  requireCondition(
    weights.length === 6 && weights.every((v) => Number.isFinite(v) && v >= 0),
  );
  const sum = weights.reduce((a, b) => a + b, 0);
  requireCondition(Number.isFinite(sum));
  return sum === 0 ? [...DEFAULT_WEIGHTS] : weights.map((v) => v / sum);
}
export function weightedScore(
  scores: readonly number[],
  weights: readonly number[] = DEFAULT_WEIGHTS,
): number {
  requireCondition(
    scores.length === 6 &&
      scores.every((v) => Number.isFinite(v) && v >= 0 && v <= 1),
  );
  const normalized = normalizeWeights(weights);
  return round1(
    100 * scores.reduce((sum, v, i) => sum + v * normalized[i]!, 0),
  );
}
export interface PreparedOntology {
  byId: Map<string, SkillOntology>;
  aliases: Map<string, string>;
  ancestors: Map<string, Set<string>>;
}
const normalizeName = (v: string) => v.normalize("NFC").trim().toLowerCase();
export function prepareOntology(skills: SkillOntology[]): PreparedOntology {
  requireCondition(
    skills.length <= 256 &&
      skills.reduce((n, s) => n + s.parentIds.length, 0) <= 512,
  );
  const byId = new Map(skills.map((s) => [s.id, s])),
    aliases = new Map<string, string>(),
    ancestors = new Map<string, Set<string>>();
  requireCondition(byId.size === skills.length);
  for (const skill of skills) {
    requireCondition(
      skill.learningCostDays >= 1 && Number.isInteger(skill.learningCostDays),
    );
    for (const alias of [skill.canonical, ...skill.aliases]) {
      const key = normalizeName(alias);
      requireCondition(
        key && (!aliases.has(key) || aliases.get(key) === skill.id),
      );
      aliases.set(key, skill.id);
    }
  }
  function visit(id: string, path: Set<string>): Set<string> {
    requireCondition(!path.has(id), "VALIDATION_ERROR", "技能本体存在环。");
    if (ancestors.has(id)) return ancestors.get(id)!;
    const skill = byId.get(id);
    requireCondition(skill, "VALIDATION_ERROR", "技能本体存在悬空父节点。");
    const next = new Set(path).add(id),
      result = new Set<string>();
    for (const parent of skill.parentIds) {
      result.add(parent);
      for (const ancestor of visit(parent, next)) result.add(ancestor);
    }
    ancestors.set(id, result);
    return result;
  }
  for (const id of byId.keys()) visit(id, new Set());
  return { byId, aliases, ancestors };
}
export function resolveSkill(
  value: string,
  ontology: PreparedOntology,
): string | null {
  return ontology.byId.has(value)
    ? value
    : (ontology.aliases.get(normalizeName(value)) ?? null);
}
export function skillHit(
  owned: string[],
  required: string,
  ontology: PreparedOntology,
): number {
  const id = resolveSkill(required, ontology);
  if (!id) return 0;
  const candidates = owned.map((x) => resolveSkill(x, ontology));
  if (candidates.includes(id)) return 1;
  return candidates.some((x) => x && ontology.ancestors.get(x)?.has(id))
    ? 0.5
    : 0;
}
export function isLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}
export function validRange(range: DateRange): boolean {
  return (
    isLocalDate(range.startDate) &&
    (range.endDate === null ||
      (isLocalDate(range.endDate) && range.startDate <= range.endDate))
  );
}
const monthNumber = (date: string) =>
  Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
export function experienceMonths(ranges: DateRange[], now: string): number {
  const current = monthNumber(now);
  const intervals = ranges
    .filter((r) => r.startDate)
    .map((r) => {
      requireCondition(validRange(r));
      return [
        Math.min(monthNumber(r.startDate), current),
        Math.min(monthNumber(r.endDate ?? now), current),
      ] as [number, number];
    })
    .sort((a, b) => a[0] - b[0]);
  let total = 0,
    start: number | null = null,
    end = 0;
  for (const [a, b] of intervals) {
    if (start === null) {
      start = a;
      end = b;
    } else if (a <= end) end = Math.max(end, b);
    else {
      total += end - start;
      start = a;
      end = b;
    }
  }
  return total + (start === null ? 0 : end - start);
}
export function match(
  resume: Resume,
  job: Job,
  weights: readonly number[] | undefined,
  skills: SkillOntology[] | PreparedOntology,
  dictionaries: Dictionary[],
  now: string,
  includeGains = true,
): MatchExplanation {
  const ontology = Array.isArray(skills) ? prepareOntology(skills) : skills,
    normalized = normalizeWeights(weights);
  const section = resume.sections,
    owned = section.skills.map((s) => s.skillId);
  const requirements = new Map<string, number>();
  for (const requirement of job.requiredSkills) {
    requireCondition(
      Number.isFinite(requirement.weight) && requirement.weight > 0,
    );
    requirements.set(
      requirement.skillId,
      Math.max(requirements.get(requirement.skillId) ?? 0, requirement.weight),
    );
  }
  const totalWeight = [...requirements.values()].reduce((a, b) => a + b, 0);
  const skillScore = totalWeight
    ? [...requirements].reduce(
        (n, [id, w]) => n + w * skillHit(owned, id, ontology),
        0,
      ) / totalWeight
    : 1;
  const major = section.basic.majorId,
    preferred = job.preferredMajorIds;
  const parent = dictionaries.find((d) => d.id === major)?.parentId;
  const majorScore = !preferred.length
    ? 1
    : !major
      ? 0.5
      : preferred.includes(major)
        ? 1
        : parent &&
            preferred.some(
              (id) =>
                dictionaries.find((d) => d.id === id)?.parentId === parent,
            )
          ? 0.7
          : 0.3;
  requireCondition(job.minDegree === null || DEGREE_LEVEL[job.minDegree]);
  const level = section.basic.degree
    ? DEGREE_LEVEL[section.basic.degree]
    : null;
  const difference =
    job.minDegree && level ? DEGREE_LEVEL[job.minDegree]! - level : 0;
  const degreeScore = !job.minDegree
    ? 1
    : !level
      ? 0.5
      : difference <= 0
        ? 1
        : difference === 1
          ? 0.5
          : 0;
  const cityScore =
    !section.intent.cityIds.length ||
    section.intent.cityIds.includes(job.cityId)
      ? 1
      : 0;
  const expected = section.intent.expectedSalary,
    salary = job.salaryRange;
  for (const [range, isExpected] of [
    [expected, true],
    [salary, false],
  ] as const)
    if (range)
      requireCondition(
        Number.isFinite(range.min) &&
          Number.isFinite(range.max) &&
          range.min >= (isExpected ? Number.MIN_VALUE : 0) &&
          range.max >= range.min,
      );
  const gap =
    expected && salary
      ? Math.max(0, expected.min - salary.max, salary.min - expected.max)
      : 0;
  const salaryScore =
    expected && salary ? Math.max(0, 1 - gap / expected.min) : 0.5;
  requireCondition(
    Number.isInteger(job.minExperienceMonths) && job.minExperienceMonths >= 0,
  );
  const months = experienceMonths(section.experience, now);
  const scores = [
    skillScore,
    majorScore,
    degreeScore,
    cityScore,
    salaryScore,
    job.minExperienceMonths === 0
      ? 1
      : Math.min(1, months / job.minExperienceMonths),
  ];
  const rawTotal = 100 * scores.reduce((n, v, i) => n + v * normalized[i]!, 0),
    total = round1(rawTotal);
  const dimensions = MATCH_KEYS.map((key, i) => ({
    key,
    score: scores[i]!,
    weight: normalized[i]!,
    contribution: round1(100 * scores[i]! * normalized[i]!),
    hits:
      key === "skill"
        ? [...requirements.keys()].filter(
            (id) => skillHit(owned, id, ontology) > 0,
          )
        : [],
    misses:
      key === "skill"
        ? [...requirements.keys()].filter(
            (id) => skillHit(owned, id, ontology) < 1,
          )
        : [],
    missingData:
      key === "major"
        ? preferred.length > 0 && !major
        : key === "degree"
          ? !!job.minDegree && !level
          : key === "salary"
            ? !expected || !salary
            : key === "experience"
              ? section.experience.some((r) => !r.startDate)
              : false,
  }));
  const maxIndex = dimensions.reduce(
    (best, d, i) =>
      d.contribution > dimensions[best]!.contribution ? i : best,
    0,
  );
  dimensions[maxIndex]!.contribution = round1(
    dimensions[maxIndex]!.contribution +
      total -
      dimensions.reduce((n, d) => n + d.contribution, 0),
  );
  const result: MatchExplanation = {
    jobId: job.id,
    rawTotal,
    total,
    dimensions,
    missingSkills: [],
    algorithmVersion: "1.0",
    inputRevision: `${resume.id}:${resume.revision}`,
  };
  if (includeGains)
    result.missingSkills = [...requirements.keys()]
      .filter(
        (id) => skillHit(owned, id, ontology) < 1 && ontology.byId.has(id),
      )
      .map((skillId) => {
        const hypothetical = structuredClone(resume);
        hypothetical.sections.skills.push({
          id: `hypothesis-${skillId}`,
          skillId,
        });
        return {
          skillId,
          gain: round1(
            match(
              hypothetical,
              job,
              normalized,
              ontology,
              dictionaries,
              now,
              false,
            ).rawTotal - rawTotal,
          ),
          costDays: ontology.byId.get(skillId)!.learningCostDays,
        };
      })
      .sort(
        (a, b) =>
          b.gain / b.costDays - a.gain / a.costDays ||
          a.skillId.localeCompare(b.skillId),
      );
  return result;
}
export function rankJobs(
  resume: Resume,
  jobs: Job[],
  weights: readonly number[] | undefined,
  skills: SkillOntology[],
  dictionaries: Dictionary[],
  now: string,
): MatchExplanation[] {
  const ontology = prepareOntology(skills);
  return jobs
    .map((job) => match(resume, job, weights, ontology, dictionaries, now))
    .sort((a, b) => b.rawTotal - a.rawTotal || a.jobId.localeCompare(b.jobId));
}
export function whatIf(
  resume: Resume,
  jobs: Job[],
  addedSkills: string[],
  weights: readonly number[] | undefined,
  skills: SkillOntology[],
  dictionaries: Dictionary[],
  now: string,
) {
  const copy = structuredClone(resume),
    ontology = prepareOntology(skills);
  for (const skillId of addedSkills) {
    requireCondition(ontology.byId.has(skillId));
    if (!copy.sections.skills.some((s) => s.skillId === skillId))
      copy.sections.skills.push({ id: `hypothesis-${skillId}`, skillId });
  }
  const before = rankJobs(resume, jobs, weights, skills, dictionaries, now),
    after = rankJobs(copy, jobs, weights, skills, dictionaries, now);
  return after.map((result, i) => {
    const index = before.findIndex((x) => x.jobId === result.jobId);
    return {
      jobId: result.jobId,
      before: before[index]!,
      after: result,
      delta: round1(result.rawTotal - before[index]!.rawTotal),
      rankBefore: index + 1,
      rankAfter: i + 1,
    };
  });
}
