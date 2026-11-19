import type {
  Dictionary,
  Job,
  MatchExplanation,
  Resume,
  SkillOntology,
} from "../types/entities";
import { match, prepareOntology } from "../domain/matching/scoring";
type Request =
  | {
      id: string;
      type: "match";
      resume: Resume;
      jobs: Job[];
      weights?: number[];
      skills: SkillOntology[];
      dictionaries: Dictionary[];
      now: string;
    }
  | { id: string; type: "cancel" };
let activeId: string | null = null;
self.addEventListener("message", (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request.type === "cancel") {
    if (activeId === request.id) activeId = null;
    return;
  }
  activeId = request.id;
  const start = performance.now();
  try {
    const ontology = prepareOntology(request.skills),
      preprocessMs = performance.now() - start,
      results: MatchExplanation[] = [];
    let offset = 0;
    const batch = () => {
      if (activeId !== request.id) return;
      try {
        for (const job of request.jobs.slice(offset, offset + 20))
          results.push(
            match(
              request.resume,
              job,
              request.weights,
              ontology,
              request.dictionaries,
              request.now,
            ),
          );
        offset += 20;
        if (offset < request.jobs.length) setTimeout(batch, 0);
        else {
          results.sort(
            (a, b) => b.rawTotal - a.rawTotal || a.jobId.localeCompare(b.jobId),
          );
          self.postMessage({ id: request.id, results, preprocessMs });
          activeId = null;
        }
      } catch (error) {
        self.postMessage({
          id: request.id,
          error: error instanceof Error ? error.message : "MATCH_FAILED",
        });
        activeId = null;
      }
    };
    batch();
  } catch (error) {
    self.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : "MATCH_FAILED",
    });
    activeId = null;
  }
});
