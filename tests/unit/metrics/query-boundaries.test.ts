import { expect, it } from "vitest";
import { calculateMetrics } from "../../../src/domain/metrics/calculate";
import { createSeedPack } from "../../../src/data/seed/seed";
import { FIXED_NOW } from "../../../src/domain/clock";
it.each([
  { to: "invalid" },
  { from: "2027-01-01T00:00:00.000Z" },
  { to: "2026-99-01T00:00:00.000Z" },
  { cohortYear: 2027.5 },
])("MET06 rejects invalid or future metric windows %j", (overrides) => {
  expect(() =>
    calculateMetrics(
      createSeedPack(),
      { cohortYear: 2027, asOf: FIXED_NOW, ...overrides },
      { role: "admin", userId: "admin" },
    ),
  ).toThrow("VALIDATION_ERROR");
});
