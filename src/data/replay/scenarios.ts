import type { AiModule, AiPayload } from "../../adapters/ai/types";
import { createSeedPack } from "../seed/seed";
import {
  resumeRequestInput,
  interviewRequestInput,
  matchingRequestInput,
  metricsRequestInput,
} from "../../services/ai-requests";
import { match } from "../../domain/matching/scoring";
import { FIXED_NOW } from "../../domain/clock";
export interface ReplayScenario {
  id: string;
  module: AiModule;
  operation: AiPayload["operation"];
  variables: unknown;
  snapshot: unknown;
}
export function replayScenarios(): ReplayScenario[] {
  const seed = createSeedPack(),
    resume = seed.resumes[0]!,
    job = seed.jobs[0]!,
    scenarios: ReplayScenario[] = [];
  const add = (
    id: string,
    module: AiModule,
    operation: AiPayload["operation"],
    input: { variables: unknown; snapshot: unknown },
  ) => scenarios.push({ id, module, operation, ...input });
  add(
    "a1-structure",
    "A1",
    "rewrite",
    resumeRequestInput(resume, job, "structure", false),
  );
  add(
    "a1-keep-tone",
    "A1",
    "rewrite",
    resumeRequestInput(resume, job, "structure", true),
  );
  add(
    "a1-evidence-prompt",
    "A1",
    "rewrite",
    resumeRequestInput(resume, null, "evidencePrompt", false),
  );
  const session = structuredClone(seed.mockSessions[0]!);
  session.state = "inProgress";
  let answerIndex = 0;
  for (const [index, questionId] of session.questionIds.entries()) {
    const question = seed.mockQuestions.find((q) => q.id === questionId)!;
    session.questionIndex = index;
    session.followUpCount = 0;
    add(
      `a2-${index + 1}-question`,
      "A2",
      "question",
      interviewRequestInput(session, question, job),
    );
    session.answers.push({
      id: `example-${++answerIndex}`,
      questionId,
      kind: index === 2 ? "skip" : "answer",
      text:
        index === 0
          ? "项目期间负责开发任务，完成3个页面并交付2次迭代。"
          : index === 1
            ? "我参与开发"
            : "",
      submittedAt: FIXED_NOW,
      evidence: [],
    });
    session.revision++;
    add(
      `a2-${index + 1}-feedback`,
      "A2",
      "feedback",
      interviewRequestInput(session, question, job),
    );
    if (index < 2)
      for (let follow = 0; follow < 2; follow++) {
        add(
          `a2-${index + 1}-follow-${follow + 1}`,
          "A2",
          "followUp",
          interviewRequestInput(session, question, job),
        );
        session.answers.push({
          id: `example-${++answerIndex}`,
          questionId,
          kind: "followUp",
          text:
            follow === 0
              ? "我负责页面开发与协作任务。"
              : "最后完成交付并记录结果。",
          submittedAt: FIXED_NOW,
          evidence: [],
        });
        session.followUpCount++;
        session.revision++;
      }
  }
  add(
    "a3-high",
    "A3",
    "explain",
    matchingRequestInput(
      resume,
      job,
      match(
        resume,
        job,
        undefined,
        seed.skillOntology,
        seed.dictionaries,
        FIXED_NOW,
      ),
    ),
  );
  const low = seed.resumes[7]!,
    different = seed.jobs[2]!;
  add(
    "a3-gap",
    "A3",
    "explain",
    matchingRequestInput(
      low,
      different,
      match(
        low,
        different,
        undefined,
        seed.skillOntology,
        seed.dictionaries,
        FIXED_NOW,
      ),
    ),
  );
  const scope = { userId: "user-counselor-001", role: "counselor" };
  add(
    "a7-rate",
    "A7",
    "query",
    metricsRequestInput(
      {
        queryText: "当前落实率是多少",
        intent: "destinationRate",
        scopeLabel: "当前辅导员辖区",
        asOf: FIXED_NOW,
        metricContext: [
          {
            metricId: "destinationRate",
            token: "{{metric:destinationRate}}",
            label: "去向落实率",
            value: 1,
          },
        ],
        targetStudents: [],
      },
      scope,
    ),
  );
  add(
    "a7-advice",
    "A7",
    "advice",
    metricsRequestInput(
      {
        queryText: "如何开展帮扶",
        intent: "alerts",
        scopeLabel: "当前辅导员辖区",
        asOf: FIXED_NOW,
        metricContext: [
          {
            metricId: "alerts",
            token: "{{metric:alerts}}",
            label: "风险人数",
            value: 1,
          },
        ],
        targetStudents: [
          {
            studentId: "student-target",
            riskLevel: "high",
            ruleIds: ["inactive7d", "resumeIncomplete", "deadlineApproaching"],
          },
        ],
      },
      { userId: "user-counselor-004", role: "counselor" },
      { "student-target": "student-031" },
    ),
  );
  return scenarios;
}
