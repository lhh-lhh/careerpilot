import {
  AiFailure,
  type FailureCode,
  type AiMode,
  type AiRequest,
  type AiResponse,
  type ReplayRecord,
  type RunRecord,
} from "./types";
import { assertRequest } from "./registry";
import { hashInput, normalizeJson } from "../../domain/ai-guard/fingerprint";
import { guardPayload } from "../../domain/ai-guard/semantic";
import { validateResponse } from "../../domain/ai-guard/schema";
import { findReplay } from "./replayProvider";
import { rulePayload } from "./ruleProvider";
import { makeChunks, renderText } from "./render";
export interface OrchestratorOptions {
  records: ReplayRecord[];
  current: () => { actorUserId: string; epoch: number; domainRevision: string };
  audit: (run: RunRecord) => Promise<void>;
  live?: (request: AiRequest) => Promise<AiResponse>;
}
const failures: FailureCode[] = [
  "CANCELLED",
  "PROVIDER_DISABLED",
  "PROVIDER_CONFIG_ERROR",
  "PAIRING_REQUIRED",
  "PAIRING_FAILED",
  "AUTH_FAILED",
  "QUOTA_EXCEEDED",
  "NETWORK_ERROR",
  "UPSTREAM_ERROR",
  "TIMEOUT",
  "RATE_LIMITED",
  "QUEUE_FULL",
  "QUEUE_TIMEOUT",
  "BUDGET_EXCEEDED",
  "SCHEMA_INVALID",
  "SEMANTIC_INVALID",
  "INPUT_BLOCKED",
  "RULE_FAILED",
];
function failure(error: unknown): AiFailure {
  const candidate =
    error instanceof Error
      ? "code" in error
        ? error.code
        : error.message
      : "UPSTREAM_ERROR";
  return new AiFailure(
    failures.includes(candidate as FailureCode)
      ? (candidate as FailureCode)
      : "UPSTREAM_ERROR",
  );
}
async function delay(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) throw new AiFailure("CANCELLED");
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new AiFailure("CANCELLED"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
export function createOrchestrator(options: OrchestratorOptions) {
  async function run(
    request: AiRequest,
    mode: AiMode,
    onText?: (delta: string) => void,
  ): Promise<AiResponse> {
    const started = performance.now(),
      identity = options.current().actorUserId,
      traceId = crypto.randomUUID();
    request = { ...request };
    let inputHash = "",
      response: AiResponse | null = null,
      masked = false;
    const check = () => {
      const current = options.current();
      if (
        request.signal?.aborted ||
        current.actorUserId !== identity ||
        current.epoch !== request.epoch ||
        current.domainRevision !== request.domainRevision
      )
        throw new AiFailure("CANCELLED");
    };
    const audit = async (status: RunRecord["status"], reason: string | null) =>
      options.audit({
        module: request.module,
        operation: request.operation,
        traceId: response?.traceId ?? traceId,
        inputHash,
        domainRevision: request.domainRevision,
        actorUserId: identity,
        requestedMode: mode,
        effectiveMode: response?.effectiveMode ?? null,
        origin: response?.origin ?? null,
        promptVersion: request.promptVersion,
        schemaVersion: request.schemaVersion,
        algorithmVersion: request.algorithmVersion,
        status,
        fallbackReason: reason,
        usage: response?.usage ?? null,
        masked,
        durationMs: Math.max(0, performance.now() - started),
      });
    try {
      check();
      request.variables = normalizeJson(
        request.variables,
      ) as unknown as AiRequest["variables"];
      assertRequest(request);
      const freeze = (value: unknown): void => {
        if (value !== null && typeof value === "object") {
          for (const child of Object.values(value)) freeze(child);
          Object.freeze(value);
        }
      };
      freeze(request.variables);
      masked = true;
      inputHash = await hashInput({ ...request });
      check();
      if (mode === "LIVE") {
        try {
          if (!options.live) throw new AiFailure("PROVIDER_DISABLED");
          const live = await options.live(request);
          check();
          if (
            !validateResponse(live) ||
            live.effectiveMode !== "LIVE" ||
            live.origin !== "MODEL" ||
            live.requestedMode !== "LIVE" ||
            live.promptVersion !== request.promptVersion ||
            live.algorithmVersion !== request.algorithmVersion ||
            live.inputHash !== inputHash ||
            live.domainRevision !== request.domainRevision
          )
            throw new AiFailure("SCHEMA_INVALID");
          response = {
            ...live,
            guard: { passed: true, masked: true, flags: [] },
            data: guardPayload(
              request.module,
              request.operation,
              request.variables,
              live.data,
            ),
          };
        } catch (e) {
          check();
          // LIVE is a contract, not a preference: no curated/rule answer on failure.
          throw failure(e);
        }
      }
      const replay =
        !response && mode !== "RULE"
          ? findReplay(options.records, request, inputHash)
          : null;
      if (!response) {
        const data = replay?.payload ?? rulePayload(request);
        response = {
          schemaVersion: "1.0",
          algorithmVersion: request.algorithmVersion,
          promptVersion: request.promptVersion,
          traceId,
          inputHash,
          domainRevision: request.domainRevision,
          requestedMode: mode,
          effectiveMode: replay ? "REPLAY" : "RULE",
          origin: replay?.origin ?? "RULE",
          fallbackReason: mode === "REPLAY" && !replay ? "REPLAY_MISS" : null,
          usage: null,
          guard: { passed: true, masked: true, flags: [] },
          data,
        };
      }
      if (!validateResponse(response)) throw new AiFailure("SCHEMA_INVALID");
      check();
      if (onText) {
        const chunks = replay?.chunks ?? makeChunks(renderText(response.data));
        let previous = 0;
        for (const chunk of chunks) {
          await delay(chunk.t - previous, request.signal);
          check();
          onText(chunk.text);
          previous = chunk.t;
        }
      }
      check();
      await audit("success", response.fallbackReason);
      check();
      return response;
    } catch (error) {
      const problem = failure(error);
      await audit(
        problem.code === "CANCELLED" ? "cancelled" : "failed",
        problem.code,
      );
      throw problem;
    }
  }
  return {
    complete: (request: AiRequest, mode: AiMode) => run(request, mode),
    stream: (
      request: AiRequest,
      mode: AiMode,
      onText: (delta: string) => void,
    ) => run(request, mode, onText),
  };
}
