import type { AiRequest, AiMode, AiResponse } from "../adapters/ai/types";
import {
  createOrchestrator,
  type OrchestratorOptions,
} from "../adapters/ai/orchestrator";

/** Owns active request lifetimes only; no business writes or hidden LIVE queue. */
export function createAiRuntime() {
  const active = new Set<AbortController>();
  return {
    cancelAll() {
      for (const controller of active) controller.abort();
    },
    async run(
      request: AiRequest,
      mode: AiMode,
      options: OrchestratorOptions,
      onText?: (delta: string) => void,
    ): Promise<AiResponse> {
      const controller = new AbortController();
      const abort = () => controller.abort();
      request.signal?.addEventListener("abort", abort, { once: true });
      if (request.signal?.aborted) controller.abort();
      active.add(controller);
      try {
        const scopedRequest = { ...request, signal: controller.signal };
        const provider = createOrchestrator(options);
        return await (onText
          ? provider.stream(scopedRequest, mode, onText)
          : provider.complete(scopedRequest, mode));
      } finally {
        active.delete(controller);
        request.signal?.removeEventListener("abort", abort);
      }
    },
  };
}
export const appAiRuntime = createAiRuntime();
