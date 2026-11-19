// Offline, deterministic authoring utility. It prints generated JSON for review;
// it does not call a model, access credentials, or mutate business data.
import { createServer } from "vite";
const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { replayScenarios } = await server.ssrLoadModule(
    "/src/data/replay/scenarios.ts",
  );
  const { prepareRequest } = await server.ssrLoadModule(
    "/src/adapters/ai/registry.ts",
  );
  const { hashInput } = await server.ssrLoadModule(
    "/src/domain/ai-guard/fingerprint.ts",
  );
  const { rulePayload } = await server.ssrLoadModule(
    "/src/adapters/ai/ruleProvider.ts",
  );
  const { renderText, makeChunks } = await server.ssrLoadModule(
    "/src/adapters/ai/render.ts",
  );
  const records = [];
  for (const scenario of replayScenarios()) {
    const request = await prepareRequest(
      scenario.module,
      scenario.operation,
      scenario.variables,
      scenario.snapshot,
      0,
    );
    const payload = rulePayload(request);
    records.push({
      id: scenario.id,
      module: request.module,
      operation: request.operation,
      promptVersion: "1.0",
      schemaVersion: "1.0",
      algorithmVersion: "1.0",
      inputHash: await hashInput({ ...request }),
      domainRevision: request.domainRevision,
      origin: "RULE",
      reviewedBy: "careerpilot-local-rule-review",
      reviewedAt: "2026-11-12T02:00:00.000Z",
      chunks: makeChunks(renderText(payload)),
      payload,
    });
  }
  console.log(JSON.stringify(records, null, 2));
} finally {
  await server.close();
}
