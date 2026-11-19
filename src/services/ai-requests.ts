import type {
  Resume,
  Job,
  MockSession,
  MockQuestion,
  MatchExplanation,
} from "../types/entities";
import type {
  A1Variables,
  A2Variables,
  A3Variables,
  A7Variables,
  AiRequest,
} from "../adapters/ai/types";
import { maskText } from "../domain/ai-guard/privacy";
import { prepareRequest } from "../adapters/ai/registry";
import { FIXED_NOW } from "../domain/clock";
export interface LocalAiMapping {
  fields: Record<string, string>;
  answers: Record<string, string>;
  resumeVersionId: string | null;
  sessionId: string | null;
  questionId: string | null;
  jobId: string | null;
  studentIds: Record<string, string>;
}
const mapping = (): LocalAiMapping => ({
  fields: {},
  answers: {},
  resumeVersionId: null,
  sessionId: null,
  questionId: null,
  jobId: null,
  studentIds: {},
});
export function resumeRequestInput(
  resume: Resume,
  job: Job | null,
  strategy: A1Variables["strategy"],
  keepMyTone: boolean,
) {
  const local = mapping();
  local.resumeVersionId = resume.versionIds.at(-1)!;
  local.jobId = job?.id ?? null;
  const names = [resume.sections.basic.name, resume.sections.basic.email];
  const fields: A1Variables["fields"] = [];
  for (const section of ["experience", "projects"] as const)
    resume.sections[section].forEach((row, index) => {
      const alias = `${section}.item-${index + 1}.description`;
      local.fields[alias] = `${section}.${row.id}.description`;
      fields.push({ fieldPath: alias, text: maskText(row.description, names) });
    });
  const variables: A1Variables = {
    resumeVersionId: "version-current",
    fields,
    targetJob: job
      ? {
          jobId: "job-current",
          title: maskText(job.title, names),
          jdText: maskText(job.jdText, names),
          skillIds: job.requiredSkills.map((s) => s.skillId),
        }
      : null,
    strategy,
    keepMyTone,
  };
  return {
    variables,
    local,
    snapshot: {
      resumeVersionId: local.resumeVersionId,
      resumeRevision: resume.revision,
      variables,
      clock: FIXED_NOW,
    },
  };
}
export function interviewRequestInput(
  session: MockSession,
  question: MockQuestion,
  job: Job,
  names: string[] = [],
) {
  const local = mapping();
  local.sessionId = session.id;
  local.questionId = question.id;
  local.jobId = job.id;
  const variables: A2Variables = {
    sessionId: "session-current",
    question: {
      questionId: "question-current",
      type: question.type,
      text: maskText(question.text, names),
      skillIds: question.skillIds,
      keywords: question.keywords,
    },
    followUpCount: session.followUpCount,
    answers: session.answers
      .filter((a) => a.questionId === question.id)
      .map((a, index) => {
        const alias = `answer-${index + 1}`;
        local.answers[alias] = a.id;
        return { id: alias, kind: a.kind, text: maskText(a.text, names) };
      }),
    jobContext: {
      title: maskText(job.title, names),
      skillIds: job.requiredSkills.map((s) => s.skillId),
    },
  };
  return {
    variables,
    local,
    snapshot: {
      sessionId: session.id,
      revision: session.revision,
      questionId: question.id,
      variables,
      clock: FIXED_NOW,
    },
  };
}
export function matchingRequestInput(
  resume: Resume,
  job: Job,
  match: MatchExplanation,
  hypotheticalSkillIds: string[] = [],
) {
  const local = mapping();
  local.jobId = job.id;
  const variables: A3Variables = {
    job: { jobId: "job-current", title: job.title },
    match: {
      ...structuredClone(match),
      jobId: "job-current",
      inputRevision: "current-snapshot",
    },
    hypotheticalSkillIds,
  };
  return {
    variables,
    local,
    snapshot: {
      resumeVersionId: resume.versionIds.at(-1)!,
      resumeRevision: resume.revision,
      jobRevision: job.revision,
      jobId: job.id,
      variables,
      clock: FIXED_NOW,
    },
  };
}
export function metricsRequestInput(
  variables: A7Variables,
  scope: { userId: string; role: string },
  studentIds: Record<string, string> = {},
) {
  return {
    variables,
    local: { ...mapping(), studentIds },
    snapshot: { scope, variables, clock: FIXED_NOW },
  };
}
export async function requestFromInput(
  module: AiRequest["module"],
  operation: AiRequest["operation"],
  input: { variables: unknown; snapshot: unknown },
  epoch: number,
  signal?: AbortSignal,
) {
  return prepareRequest(
    module,
    operation,
    input.variables,
    input.snapshot,
    epoch,
    signal,
  );
}
