export const FIXED_NOW = "2026-11-12T02:00:00.000Z";
export const DESTINATION_DEADLINE = "2026-11-18T16:00:00.000Z";
export interface Clock {
  now(): string;
}
export const fixedClock: Clock = { now: () => typeof window !== "undefined" && window.__CAREERPILOT_ONLINE__ ? new Date().toISOString() : FIXED_NOW };
export const versions = {
  schema: "1.0",
  seed: "1.0",
  algorithm: "1.0",
} as const;
