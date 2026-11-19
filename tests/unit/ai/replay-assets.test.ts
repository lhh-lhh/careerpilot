import { expect, it } from "vitest";
import records from "../../../src/data/replay/records.json";
import { replayScenarios } from "../../../src/data/replay/scenarios";
import { prepareRequest } from "../../../src/adapters/ai/registry";
import { hashInput } from "../../../src/domain/ai-guard/fingerprint";
import { findReplay } from "../../../src/adapters/ai/replayProvider";
import type { ReplayRecord } from "../../../src/adapters/ai/types";
import { createSeedPack } from "../../../src/data/seed/seed";
it("AI05 static assets cover two scenarios per module and at least ten A2 operations with computed exact fingerprints", async () => {
  expect(records.length).toBeGreaterThanOrEqual(16);
  for (const module of ["A1", "A2", "A3", "A7"])
    expect(
      records.filter((r) => r.module === module).length,
    ).toBeGreaterThanOrEqual(module === "A2" ? 10 : 2);
  const scenarios = replayScenarios();
  expect(scenarios.length).toBe(records.length);
  for (const scenario of scenarios) {
    const request = await prepareRequest(
      scenario.module,
      scenario.operation,
      scenario.variables,
      scenario.snapshot,
      0,
    );
    const result = findReplay(
      records as ReplayRecord[],
      request,
      await hashInput({ ...request }),
    );
    expect(result?.id).toBe(scenario.id);
    expect(result?.origin).toBe("RULE");
    expect(result?.chunks.map((c) => c.text).join("")).not.toBe("");
  }
});
it("S01 A7 replay advice target belongs to its recorded counselor scope", () => {
  const scenario = replayScenarios().find((s) => s.id === "a7-advice")!;
  const snapshot = scenario.snapshot as { scope: { userId: string } };
  expect(
    createSeedPack().students.find((s) => s.id === "student-031")!.counselorId,
  ).toBe(snapshot.scope.userId);
});
