import type {
  AiModule,
  AiPayload,
  AiRequest,
  AiVariables,
  A1Variables,
  A2Variables,
  A3Variables,
  A7Variables,
} from "./types";
import {
  canonicalJson,
  hashSnapshot,
  normalizeJson,
} from "../../domain/ai-guard/fingerprint";
import { assertMasked } from "../../domain/ai-guard/privacy";
import { requireCondition } from "../../domain/errors";
import {
  InputA1,
  InputA2,
  InputA3,
  InputA7,
} from "../../contracts/generated/ai-validators.js";
const validators: Record<string, (data: unknown) => boolean> = {
  A1: InputA1,
  A2: InputA2,
  A3: InputA3,
  A7: InputA7,
};
export const operations: Record<AiModule, readonly string[]> = {
  A1: ["rewrite"],
  A2: ["question", "followUp", "feedback"],
  A3: ["explain"],
  A7: ["query", "advice"],
};
export function assertRequest(request: AiRequest): void {
  requireCondition(
    operations[request.module]?.includes(request.operation) &&
      request.promptVersion === "1.0" &&
      request.schemaVersion === "1.0" &&
      request.algorithmVersion === "1.0" &&
      /^[a-f0-9]{64}$/.test(request.domainRevision) &&
      Number.isInteger(request.epoch) &&
      request.epoch >= 0,
    "INPUT_BLOCKED",
  );
  const serialized = canonicalJson(request.variables);
  requireCondition(
    [...serialized].length <= 12000 &&
      validators[request.module]?.(request.variables),
    "INPUT_BLOCKED",
  );
  assertMasked(serialized);
  if (request.module === "A1") {
    const fields = (request.variables as A1Variables).fields;
    requireCondition(
      new Set(fields.map((f) => f.fieldPath)).size === fields.length &&
        fields.every(
          (f) => !/__proto__|constructor|prototype/.test(f.fieldPath),
        ),
      "INPUT_BLOCKED",
    );
  }
  if (request.module === "A2") {
    const input = request.variables as A2Variables;
    requireCondition(
      new Set(input.answers.map((a) => a.id)).size === input.answers.length,
      "INPUT_BLOCKED",
    );
  }
  if (request.module === "A3") {
    const input = request.variables as A3Variables;
    requireCondition(
      input.job.jobId === input.match.jobId &&
        new Set(input.match.dimensions.map((d) => d.key)).size === 6,
      "INPUT_BLOCKED",
    );
  }
  if (request.module === "A7") {
    const input = request.variables as A7Variables;
    requireCondition(
      new Set(input.metricContext.map((m) => m.token)).size ===
        input.metricContext.length &&
        input.metricContext.every((m) =>
          m.token.startsWith(`{{metric:${m.metricId}`),
        ),
      "INPUT_BLOCKED",
    );
    requireCondition(
      request.operation === "query"
        ? input.targetStudents.length === 0
        : input.targetStudents.length === 1,
      "INPUT_BLOCKED",
    );
  }
}
export async function prepareRequest(
  module: AiModule,
  operation: AiPayload["operation"],
  variables: unknown,
  snapshot: unknown,
  epoch: number,
  signal?: AbortSignal,
): Promise<AiRequest> {
  const request: AiRequest = {
    module,
    operation,
    promptVersion: "1.0",
    schemaVersion: "1.0",
    algorithmVersion: "1.0",
    variables: normalizeJson(variables) as unknown as AiVariables,
    domainRevision: await hashSnapshot(snapshot),
    epoch,
    signal,
  };
  assertRequest(request);
  return request;
}
