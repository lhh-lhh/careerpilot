import type { MatchExplanation } from "../../types/entities";
import type { MetricIntent } from "../../domain/metrics/calculate";
import type { AiProvenance } from "../../types/ai-workbench";
export type AiModule = "A1" | "A2" | "A3" | "A7";
export type AiMode = "LIVE" | "REPLAY" | "RULE";
export type AiOrigin = "MODEL" | "RULE" | "CURATED";
export type RuleId =
  | "inactive7d"
  | "applicationsWithoutInterview"
  | "resumeIncomplete"
  | "deadlineApproaching";
export type MetricId = Exclude<MetricIntent, never>;
export interface AiEvidence {
  fieldPath: string;
  quote: string;
  start: number;
  end: number;
}
export interface Suggestion {
  id: string;
  resumeVersionId: string;
  fieldPath: string;
  before: string;
  after: string;
  reason: string;
  evidence: AiEvidence[];
  requiresUserInput: boolean;
  disposition: "pending";
}
export interface A1Payload {
  module: "A1";
  operation: "rewrite";
  suggestions: Suggestion[];
  summary: string;
}
export interface A2Payload {
  module: "A2";
  operation: "question" | "followUp" | "feedback";
  sessionId: string;
  questionId: string;
  text: string;
  evidence: AiEvidence[];
}
export interface A3Payload {
  module: "A3";
  operation: "explain";
  jobId: string;
  text: string;
  dimensionKeys: MatchExplanation["dimensions"][number]["key"][];
  skillIds: string[];
}
export interface A7Payload {
  module: "A7";
  operation: "query" | "advice";
  intent: MetricIntent | "clarify";
  text: string;
  metricRefs: MetricId[];
  studentIds: string[];
  ruleIds: RuleId[];
}
export type AiPayload = A1Payload | A2Payload | A3Payload | A7Payload;
export interface A1Variables {
  resumeVersionId: string;
  fields: { fieldPath: string; text: string }[];
  targetJob: {
    jobId: string;
    title: string;
    jdText: string;
    skillIds: string[];
  } | null;
  strategy: "structure" | "evidencePrompt" | "concise";
  keepMyTone: boolean;
}
export interface A2Variables {
  sessionId: string;
  question: {
    questionId: string;
    type: "behavior" | "technical" | "hr";
    text: string;
    skillIds: string[];
    keywords: string[];
  };
  followUpCount: number;
  answers: { id: string; kind: "answer" | "followUp" | "skip"; text: string }[];
  jobContext: { title: string; skillIds: string[] };
}
export interface A3Variables {
  job: { jobId: string; title: string };
  match: MatchExplanation;
  hypotheticalSkillIds: string[];
}
export interface A7Variables {
  queryText: string;
  intent: MetricIntent | "clarify";
  scopeLabel: string;
  asOf: string;
  metricContext: {
    metricId: MetricId;
    token: string;
    label: string;
    value: number | null;
  }[];
  targetStudents: {
    studentId: string;
    riskLevel: "low" | "medium" | "high";
    ruleIds: RuleId[];
  }[];
}
export type AiVariables = A1Variables | A2Variables | A3Variables | A7Variables;
export interface AiRequest {
  module: AiModule;
  operation: AiPayload["operation"];
  promptVersion: "1.0";
  schemaVersion: "1.0";
  algorithmVersion: "1.0";
  variables: AiVariables;
  domainRevision: string;
  epoch: number;
  signal?: AbortSignal;
}
export interface AiResponse {
  provenance?: AiProvenance;
  schemaVersion: "1.0";
  algorithmVersion: string;
  promptVersion: string;
  traceId: string;
  inputHash: string;
  domainRevision: string;
  requestedMode: AiMode;
  effectiveMode: AiMode;
  origin: AiOrigin;
  fallbackReason: string | null;
  usage: { prompt: number; completion: number } | null;
  guard: { passed: true; masked: true; flags: string[] };
  data: AiPayload;
}
export interface ReplayRecord {
  id: string;
  module: AiModule;
  operation: AiPayload["operation"];
  promptVersion: string;
  schemaVersion: "1.0";
  algorithmVersion: string;
  inputHash: string;
  domainRevision: string;
  origin: AiOrigin;
  reviewedBy: string;
  reviewedAt: string;
  chunks: { t: number; text: string }[];
  payload: AiPayload;
}
export type FailureCode =
  | "CANCELLED"
  | "PROVIDER_DISABLED"
  | "PROVIDER_CONFIG_ERROR"
  | "PAIRING_REQUIRED"
  | "PAIRING_FAILED"
  | "AUTH_FAILED"
  | "QUOTA_EXCEEDED"
  | "NETWORK_ERROR"
  | "UPSTREAM_ERROR"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "QUEUE_FULL"
  | "QUEUE_TIMEOUT"
  | "BUDGET_EXCEEDED"
  | "SCHEMA_INVALID"
  | "SEMANTIC_INVALID"
  | "INPUT_BLOCKED"
  | "RULE_FAILED";
export class AiFailure extends Error {
  constructor(public readonly code: FailureCode) {
    super(code);
    this.name = "AiFailure";
  }
}
export interface AiProvider {
  complete(request: AiRequest): Promise<AiResponse>;
  stream(
    request: AiRequest,
    onText: (delta: string) => void,
  ): Promise<AiResponse>;
}
export interface RunRecord {
  module: AiModule;
  operation: AiPayload["operation"];
  traceId: string;
  inputHash: string;
  domainRevision: string;
  actorUserId: string;
  requestedMode: AiMode;
  effectiveMode: AiMode | null;
  origin: AiOrigin | null;
  promptVersion: string;
  schemaVersion: string;
  algorithmVersion: string;
  status: "success" | "cancelled" | "failed";
  fallbackReason: string | null;
  usage: AiResponse["usage"];
  masked: boolean;
  durationMs: number;
}
