import type {
  AnswerScore,
  Evidence,
  InterviewKey,
  MockQuestion,
  MockReport,
  MockSession,
  SkillOntology,
} from "../../types/entities";
import { textSignals } from "../resume/diagnose";
import { round1 } from "../matching/scoring";
export const INTERVIEW_WEIGHTS: Record<InterviewKey, number> = {
  relevance: 0.25,
  star: 0.2,
  evidence: 0.15,
  skill: 0.2,
  structure: 0.1,
  consistency: 0.1,
};
const occurrences = (text: string, term: string): Evidence[] => {
  if (!term) return [];
  const result: Evidence[] = [];
  let start = 0,
    index: number;
  while ((index = text.toLowerCase().indexOf(term.toLowerCase(), start)) >= 0) {
    result.push({
      start: index,
      end: index + term.length,
      quote: text.slice(index, index + term.length),
    });
    start = index + term.length;
  }
  return result;
};
export function scoreAnswer(
  question: MockQuestion,
  text: string,
  skills: SkillOntology[],
): AnswerScore {
  const dimensions = {
    relevance: 0,
    star: 0,
    evidence: 0,
    skill: 0,
    structure: 0,
    consistency: 0,
  };
  const evidence: AnswerScore["evidence"] = {},
    conflicts: Evidence[] = [];
  if (!text.trim()) return { total: 0, dimensions, evidence, conflicts };
  const keywordEvidence = question.keywords
    .map((term) => occurrences(text, term))
    .filter((x) => x.length);
  dimensions.relevance =
    Math.min(
      1,
      keywordEvidence.length / Math.max(1, question.keywords.length),
    ) * 100;
  if (keywordEvidence.length) evidence.relevance = keywordEvidence.flat();
  const signals = textSignals(text),
    starEvidence = Object.values(signals.star).filter((x) => x.length);
  dimensions.star = (starEvidence.length / 4) * 100;
  if (starEvidence.length) evidence.star = starEvidence.flat();
  const uniqueNumbers = new Map(
    signals.quantified.map((e) => [e.quote.replace(/\s/g, ""), e]),
  );
  dimensions.evidence =
    uniqueNumbers.size === 0 ? 0 : uniqueNumbers.size === 1 ? 50 : 100;
  if (uniqueNumbers.size) evidence.evidence = [...uniqueNumbers.values()];
  const skillEvidence = question.skillIds
    .map((id) => skills.find((s) => s.id === id))
    .filter((s): s is SkillOntology => !!s)
    .map((s) =>
      [s.canonical, ...s.aliases].flatMap((term) => occurrences(text, term)),
    )
    .filter((x) => x.length);
  dimensions.skill = question.skillIds.length
    ? (skillEvidence.length / question.skillIds.length) * 100
    : dimensions.relevance;
  if (dimensions.skill > 0)
    evidence.skill = question.skillIds.length
      ? skillEvidence.flat()
      : keywordEvidence.flat();
  const sentences = [...text.matchAll(/[^。！？；\n]+[。！？；\n]?/g)].filter(
    (m) => m[0].trim(),
  );
  const structureEvidence: Evidence[] = [];
  if (sentences.length >= 2 && sentences.length <= 8) {
    dimensions.structure += 50;
    for (const m of sentences)
      structureEvidence.push({
        start: m.index,
        end: m.index + m[0].length,
        quote: m[0],
      });
  }
  const transitions = ["首先", "其次", "然后", "最后", "因此"].flatMap((term) =>
    occurrences(text, term),
  );
  if (transitions.length) {
    dimensions.structure += 50;
    structureEvidence.push(...transitions);
  }
  if (structureEvidence.length) evidence.structure = structureEvidence;
  const pairs = [
    ["独立完成", "未参与"],
    ["没有使用", "熟练使用"],
  ];
  const skillNames = question.skillIds.flatMap((id) => {
    const skill = skills.find((s) => s.id === id);
    return skill ? [skill.canonical, ...skill.aliases] : [];
  });
  let conflictCount = 0;
  for (const pair of pairs) {
    const sentence = sentences.find(
      (m) =>
        pair.every((term) => m[0].includes(term)) &&
        skillNames.some((term) =>
          m[0].toLowerCase().includes(term.toLowerCase()),
        ),
    );
    if (sentence) {
      conflictCount++;
      conflicts.push({
        start: sentence.index,
        end: sentence.index + sentence[0].length,
        quote: sentence[0],
      });
    }
  }
  dimensions.consistency =
    conflictCount === 0 ? 100 : conflictCount === 1 ? 50 : 0;
  const total = round1(
    (Object.keys(INTERVIEW_WEIGHTS) as InterviewKey[]).reduce(
      (sum, key) => sum + dimensions[key] * INTERVIEW_WEIGHTS[key],
      0,
    ),
  );
  return { total, dimensions, evidence, conflicts };
}
export function buildReport(
  session: MockSession,
  questions: MockQuestion[],
  skills: SkillOntology[],
  previous: MockSession | null,
): MockReport | null {
  const submitted = session.questionIds.filter((id) =>
    session.answers.some((a) => a.questionId === id && a.kind !== "followUp"),
  );
  if (!submitted.length) return null;
  const questionScores = submitted.map((questionId) => {
    const question = questions.find((q) => q.id === questionId);
    if (!question) throw new Error("QUESTION_NOT_FOUND");
    const answers = session.answers.filter((a) => a.questionId === questionId);
    return {
      questionId,
      score: scoreAnswer(
        question,
        answers.some((a) => a.kind === "skip")
          ? ""
          : answers.map((a) => a.text).join("\n"),
        skills,
      ),
    };
  });
  const keys = Object.keys(INTERVIEW_WEIGHTS) as InterviewKey[];
  const dimensions = Object.fromEntries(
    keys.map((key) => [
      key,
      round1(
        questionScores.reduce((sum, q) => sum + q.score.dimensions[key], 0) /
          submitted.length,
      ),
    ]),
  ) as Record<InterviewKey, number>;
  const overall = round1(
    keys.reduce(
      (sum, key) => sum + dimensions[key] * INTERVIEW_WEIGHTS[key],
      0,
    ),
  );
  const comparable =
    previous?.state === "completed" &&
    previous.report &&
    previous.targetJobId === session.targetJobId &&
    previous.rubricVersion === session.rubricVersion &&
    JSON.stringify(previous.questionIds) ===
      JSON.stringify(session.questionIds);
  return {
    overall,
    dimensions,
    completion: submitted.length / session.questionIds.length,
    growthDelta: comparable ? round1(overall - previous.report!.overall) : null,
    comparisonReason: comparable
      ? "同岗位、同量规、同题本"
      : "仅同岗位、同量规、同题本的已完成练习可比较",
    questionScores,
    algorithmVersion: "1.0",
  };
}
export function selectQuestions(
  questions: MockQuestion[],
  targetSkills: string[],
): MockQuestion[] {
  const coveredSkills = new Set<string>(),
    coveredRubrics = new Set<string>(),
    selected: MockQuestion[] = [];
  for (const type of ["behavior", "technical", "hr"] as const) {
    const gain = (q: MockQuestion) =>
      q.skillIds.filter(
        (id) => targetSkills.includes(id) && !coveredSkills.has(id),
      ).length *
        2 +
      q.rubricKeys.filter((k) => !coveredRubrics.has(k)).length;
    const choice = questions
      .filter((q) => q.type === type)
      .sort((a, b) => gain(b) - gain(a) || a.id.localeCompare(b.id))[0];
    if (choice) {
      selected.push(choice);
      choice.skillIds.forEach((id) => coveredSkills.add(id));
      choice.rubricKeys.forEach((k) => coveredRubrics.add(k));
    }
  }
  return selected;
}
export function nextFollowUp(
  question: MockQuestion,
  text: string,
  count: number,
): string | null {
  if (count >= 2) return null;
  if (!question.keywords.some((k) => text.includes(k)))
    return "请结合问题说明你的具体经历。";
  const signals = textSignals(text);
  if (signals.star.T.length && signals.star.A.length && !signals.star.R.length)
    return "你采取行动后，最终交付了什么结果？";
  if (!signals.quantified.length)
    return "是否有可以核实的成果或数量？没有数据也可以如实说明。";
  return null;
}
