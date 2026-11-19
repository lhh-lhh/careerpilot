import canonicalize from "canonicalize";
import type { Json } from "../../types/entities";
import { requireCondition } from "../errors";

export function normalizeJson(
  value: unknown,
  key = "",
  seen = new Set<object>(),
): Json {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    requireCondition(Number.isFinite(value), "INPUT_BLOCKED");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "string") {
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(++i);
        requireCondition(next >= 0xdc00 && next <= 0xdfff, "INPUT_BLOCKED");
      } else requireCondition(code < 0xdc00 || code > 0xdfff, "INPUT_BLOCKED");
    }
    return value.replace(/\r\n?/g, "\n").normalize("NFC");
  }
  requireCondition(
    typeof value === "object" && !seen.has(value),
    "INPUT_BLOCKED",
  );
  requireCondition(
    Array.isArray(value) ||
      Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null,
    "INPUT_BLOCKED",
  );
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const array = value.map((item) => normalizeJson(item, "", seen));
      if (key === "skillIds" || key.endsWith("SkillIds")) {
        requireCondition(
          array.every((item) => typeof item === "string"),
          "INPUT_BLOCKED",
        );
        return [...new Set(array as string[])].sort();
      }
      return array;
    }
    const result: Record<string, Json> = {};
    for (const [rawKey, item] of Object.entries(value)) {
      const normalizedKey = normalizeJson(rawKey) as string;
      requireCondition(
        !["__proto__", "constructor", "prototype"].includes(normalizedKey) &&
          !Object.hasOwn(result, normalizedKey),
        "INPUT_BLOCKED",
      );
      result[normalizedKey] = normalizeJson(item, normalizedKey, seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}
export function canonicalJson(value: unknown): string {
  const text = canonicalize(normalizeJson(value));
  requireCondition(typeof text === "string", "INPUT_BLOCKED");
  return text;
}
export async function hashSnapshot(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(value)),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
export async function hashInput(
  value: Record<string, unknown>,
): Promise<string> {
  return hashSnapshot(
    Object.fromEntries(
      [
        "module",
        "operation",
        "promptVersion",
        "schemaVersion",
        "algorithmVersion",
        "domainRevision",
        "variables",
      ].map((key) => [key, value[key]]),
    ),
  );
}
