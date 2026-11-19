import type { AiPayload } from "./types";
import { canonicalJson } from "../../domain/ai-guard/fingerprint";
export function renderText(payload: AiPayload): string {
  return payload.module === "A1"
    ? payload.summary +
        (payload.suggestions.length
          ? "\n" + payload.suggestions.map((s) => s.after).join("\n")
          : "")
    : payload.text;
}
export function makeChunks(
  text: string,
  size = 24,
): { t: number; text: string }[] {
  if (!Number.isInteger(size) || size < 1 || !text) return [];
  const characters = [...text],
    parts: string[] = [];
  for (let i = 0; i < characters.length; i += size)
    parts.push(characters.slice(i, i + size).join(""));
  return parts.map((part, i) => ({
    t:
      parts.length === 1
        ? 0
        : Math.floor(
            (i * Math.min(1800, (parts.length - 1) * 45)) / (parts.length - 1),
          ),
    text: part,
  }));
}
export function validateChunks(
  chunks: { t: number; text: string }[],
  text: string,
): boolean {
  if (
    !chunks.length ||
    chunks.length > 200 ||
    chunks[0]!.t !== 0 ||
    chunks.map((c) => c.text).join("") !== text
  )
    return false;
  try {
    let previous = 0;
    for (const chunk of chunks) {
      if (
        !Number.isInteger(chunk.t) ||
        chunk.t < previous ||
        chunk.t > 3000 ||
        !chunk.text ||
        chunk.text.length > 4000
      )
        return false;
      canonicalJson(chunk.text);
      previous = chunk.t;
    }
    return true;
  } catch {
    return false;
  }
}
