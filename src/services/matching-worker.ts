import type {
  Dictionary,
  Job,
  MatchExplanation,
  Resume,
  SkillOntology,
} from "../types/entities";
let worker: Worker | null = null;
let cancelCurrent: (() => void) | null = null;
export interface MatchingInput {
  resume: Resume;
  jobs: Job[];
  weights?: number[];
  skills: SkillOntology[];
  dictionaries: Dictionary[];
  now: string;
}
export function matchInWorker(
  input: MatchingInput,
  signal?: AbortSignal,
): Promise<{
  results: MatchExplanation[];
  preprocessMs: number;
  roundTripMs: number;
}> {
  cancelCurrent?.();
  worker ??= new Worker(
    new URL("../workers/matching.worker.ts", import.meta.url),
    { type: "module" },
  );
  const instance = worker,
    id = crypto.randomUUID(),
    start = performance.now();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      instance.removeEventListener("message", onMessage);
      instance.removeEventListener("error", onError);
      signal?.removeEventListener("abort", cancel);
      if (cancelCurrent === cancel) cancelCurrent = null;
    };
    const cancel = () => {
      instance.postMessage({ id, type: "cancel" });
      cleanup();
      reject(new DOMException("Matching cancelled", "AbortError"));
    };
    const onMessage = (
      event: MessageEvent<{
        id: string;
        error?: string;
        results: MatchExplanation[];
        preprocessMs: number;
      }>,
    ) => {
      if (event.data.id !== id) return;
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve({ ...event.data, roundTripMs: performance.now() - start });
    };
    const onError = () => {
      cleanup();
      reject(new Error("MATCH_WORKER_FAILED"));
    };
    instance.addEventListener("message", onMessage);
    instance.addEventListener("error", onError);
    signal?.addEventListener("abort", cancel, { once: true });
    cancelCurrent = cancel;
    if (signal?.aborted) {
      cancel();
      return;
    }
    instance.postMessage({ ...input, id, type: "match" });
  });
}
export function cancelMatching() {
  cancelCurrent?.();
}
