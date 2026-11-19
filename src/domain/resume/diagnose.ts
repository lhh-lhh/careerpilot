import type {
  Evidence,
  Job,
  Resume,
  ResumeSections,
  SkillOntology,
} from "../../types/entities";
import {
  DEGREE_LEVEL,
  isLocalDate,
  prepareOntology,
  resolveSkill,
  round1,
  validRange,
} from "../matching/scoring";
import { requireCondition } from "../errors";
export const STAR_TERMS = {
  S: ["项目", "期间", "场景", "背景"],
  T: ["目标", "任务", "负责", "需要"],
  A: ["实现", "开发", "设计", "优化", "组织", "分析", "完成"],
  R: ["提升", "降低", "减少", "增长", "完成", "交付", "结果"],
} as const;
const collect = (text: string, pattern: RegExp): Evidence[] =>
  [...text.matchAll(pattern)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    quote: m[0],
  }));
export function textSignals(text: string) {
  return {
    star: Object.fromEntries(
      Object.entries(STAR_TERMS).map(([key, terms]) => [
        key,
        collect(text, new RegExp(terms.join("|"), "g")),
      ]),
    ) as Record<keyof typeof STAR_TERMS, Evidence[]>,
    quantified: collect(
      text,
      /\d+(?:\.\d+)?\s*(?:%|个|人|次|天|周|月|毫秒|秒|元)/g,
    ),
  };
}
export function diagnose(
  resume: Resume,
  targetJob: Job | null,
  skills: SkillOntology[],
  now: string,
) {
  const s = resume.sections,
    ontology = prepareOntology(skills);
  const populated = <T>(rows: T[], test: (row: T) => boolean) =>
    rows.length > 0 && rows.every(test);
  const resolved = s.skills.map((x) => resolveSkill(x.skillId, ontology));
  const certificateKeys = s.certificates.map(
    (c) =>
      `${c.name.trim().normalize("NFC")}|${c.issuer.trim().normalize("NFC")}|${c.awardedAt}`,
  );
  const checks: Record<Exclude<keyof ResumeSections, "intent">, boolean[]> = {
    basic: [
      !!s.basic.name.trim(),
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.basic.email),
      !!s.basic.majorId,
      !!s.basic.degree && !!DEGREE_LEVEL[s.basic.degree],
    ],
    education: [
      s.education.length > 0,
      populated(s.education, (x) => !!x.school.trim() && !!x.majorId),
      populated(s.education, validRange),
      populated(s.education, (x) => !!DEGREE_LEVEL[x.degree]),
    ],
    experience: [
      s.experience.length > 0,
      populated(s.experience, (x) => !!x.company.trim() && !!x.title.trim()),
      populated(s.experience, validRange),
      populated(s.experience, (x) => x.description.trim().length >= 20),
    ],
    projects: [
      s.projects.length > 0,
      populated(s.projects, (x) => !!x.name.trim() && !!x.role.trim()),
      populated(s.projects, validRange),
      populated(s.projects, (x) => x.description.trim().length >= 20),
    ],
    skills: [
      s.skills.length > 0,
      new Set(resolved.filter(Boolean)).size >= 3,
      populated(s.skills, (x) => !!resolveSkill(x.skillId, ontology)),
      s.skills.length > 0 && new Set(resolved).size === s.skills.length,
    ],
    certificates: [
      s.certificates.length > 0,
      populated(s.certificates, (x) => !!x.name.trim() && !!x.issuer.trim()),
      populated(
        s.certificates,
        (x) => isLocalDate(x.awardedAt) && x.awardedAt <= now.slice(0, 10),
      ),
      s.certificates.length > 0 &&
        new Set(certificateKeys).size === s.certificates.length,
    ],
  };
  const weights = {
    basic: 15,
    education: 15,
    experience: 25,
    projects: 20,
    skills: 15,
    certificates: 10,
  };
  const dimensions = Object.entries(checks).map(([key, values]) => ({
    key,
    checks: values,
    score: values.filter(Boolean).length * 25,
    weight: weights[key as keyof typeof weights],
  }));
  const requirements = [
    ...new Set(targetJob?.requiredSkills.map((x) => x.skillId) ?? []),
  ];
  const ats = requirements.length
    ? requirements.filter((id) => resolved.includes(id)).length /
      requirements.length
    : null;
  const descriptions = [...s.experience, ...s.projects].filter(
    (x) => x.description.trim().length >= 20,
  );
  const duplicates = descriptions
    .filter(
      (x, i) =>
        descriptions.findIndex(
          (y) =>
            y.description.trim().normalize("NFC") ===
            x.description.trim().normalize("NFC"),
        ) < i,
    )
    .map((x) => x.id);
  const intervals = [...s.education, ...s.experience]
    .filter(validRange)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const gaps: { from: string; to: string; months: number }[] = [];
  let end: string | null = null;
  for (const interval of intervals) {
    const nextEnd = interval.endDate ?? now.slice(0, 10);
    if (end) {
      const months =
        (Number(interval.startDate.slice(0, 4)) - Number(end.slice(0, 4))) *
          12 +
        Number(interval.startDate.slice(5, 7)) -
        Number(end.slice(5, 7));
      if (months > 6) gaps.push({ from: end, to: interval.startDate, months });
    }
    end = [end ?? nextEnd, nextEnd].sort().at(-1)!;
  }
  return {
    total: round1(
      dimensions.reduce((n, d) => n + (d.score * d.weight) / 100, 0),
    ),
    dimensions,
    ats,
    duplicates,
    gaps,
    textSignals: descriptions.map((x) => ({
      id: x.id,
      ...textSignals(x.description),
    })),
    algorithmVersion: "1.0",
    inputRevision: `${resume.id}:${resume.revision}`,
  };
}
export interface ResumeSuggestion {
  resumeVersionId: string;
  fieldPath: string;
  before: string;
  after: string;
  evidence: Evidence[];
}
export function assertSuggestion(
  currentVersionId: string,
  currentText: string,
  suggestion: ResumeSuggestion,
): void {
  requireCondition(
    currentVersionId === suggestion.resumeVersionId &&
      currentText === suggestion.before,
    "STALE_SUGGESTION",
  );
  requireCondition(
    !/[[【].*(?:请|待|填写).*?[\]】]/.test(suggestion.after),
    "REQUIRES_USER_INPUT",
  );
  requireCondition(
    !(suggestion.after.includes("主导") && !suggestion.before.includes("主导")),
    "REQUIRES_USER_INPUT",
  );
  const originalNumbers = new Set(
    suggestion.before.match(/\d+(?:\.\d+)?/g) ?? [],
  );
  requireCondition(
    (suggestion.after.match(/\d+(?:\.\d+)?/g) ?? []).every((n) =>
      originalNumbers.has(n),
    ),
    "REQUIRES_USER_INPUT",
  );
  for (const evidence of suggestion.evidence)
    requireCondition(
      evidence.start >= 0 &&
        evidence.end <= currentText.length &&
        currentText.slice(evidence.start, evidence.end) === evidence.quote,
      "SEMANTIC_INVALID",
    );
}
