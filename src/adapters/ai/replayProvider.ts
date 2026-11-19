import type { AiRequest, ReplayRecord } from "./types";
import { guardPayload } from "../../domain/ai-guard/semantic";
import { validateReplay } from "../../domain/ai-guard/schema";
import { renderText, validateChunks } from "./render";
export function findReplay(
  records: ReplayRecord[],
  request: AiRequest,
  inputHash: string,
): ReplayRecord | null {
  for (const record of records) {
    if (
      record.module !== request.module ||
      record.operation !== request.operation ||
      record.promptVersion !== request.promptVersion ||
      record.schemaVersion !== request.schemaVersion ||
      record.algorithmVersion !== request.algorithmVersion ||
      record.domainRevision !== request.domainRevision ||
      record.inputHash !== inputHash
    )
      continue;
    try {
      if (
        !validateReplay(record) ||
        record.payload.operation !== record.operation ||
        record.payload.module !== record.module
      )
        continue;
      const payload = guardPayload(
        request.module,
        request.operation,
        request.variables,
        record.payload,
      );
      if (!validateChunks(record.chunks, renderText(payload))) continue;
      return { ...record, payload };
    } catch {
      /* An invalid asset is never trusted as a successful replay. */
    }
  }
  return null;
}
