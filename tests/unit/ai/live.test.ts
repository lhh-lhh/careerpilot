import { expect, it } from "vitest";
import {
  createLiveProvider,
  parseSse,
} from "../../../src/adapters/ai/liveProvider";
import { prepareRequest } from "../../../src/adapters/ai/registry";
import { hashInput } from "../../../src/domain/ai-guard/fingerprint";
import { rulePayload } from "../../../src/adapters/ai/ruleProvider";
import type { AiResponse } from "../../../src/adapters/ai/types";
async function setup() {
  const req = await prepareRequest(
    "A1",
    "rewrite",
    {
      resumeVersionId: "v",
      fields: [],
      targetJob: null,
      strategy: "structure",
      keepMyTone: false,
    },
    { version: 1 },
    0,
  );
  const response: AiResponse = {
    schemaVersion: "1.0",
    algorithmVersion: "1.0",
    promptVersion: "1.0",
    traceId: "wire-test",
    inputHash: await hashInput({ ...req }),
    domainRevision: req.domainRevision,
    requestedMode: "LIVE",
    effectiveMode: "LIVE",
    origin: "MODEL",
    fallbackReason: null,
    usage: { prompt: 5, completion: 8 },
    guard: { passed: true, masked: true, flags: [] },
    data: rulePayload(req),
  };
  return { req, response };
}
function body(text: string, size = 1) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size)
        controller.enqueue(bytes.slice(i, i + size));
      controller.close();
    },
  });
}
it("AI04/GW05 LIVE is inert until paired, tested, enabled and explicitly consented", async () => {
  const { req } = await setup();
  let calls = 0;
  const provider = createLiveProvider({
    connection: () => ({
      token: null,
      tested: false,
      enabled: false,
      consented: false,
    }),
    transport: async () => {
      calls++;
      return new Response();
    },
  });
  await expect(provider.complete(req)).rejects.toMatchObject({
    code: "PAIRING_REQUIRED",
  });
  expect(calls).toBe(0);
});
it("GW05 one structured POST uses fixed local URL, strict wire and memory token only", async () => {
  const { req, response } = await setup();
  let calls = 0;
  const provider = createLiveProvider({
    connection: () => ({
      token: "fake-pair-token",
      tested: true,
      enabled: true,
      consented: true,
    }),
    transport: async (url, init) => {
      calls++;
      expect(url).toBe("http://127.0.0.1:8787/api/ai/structured");
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer fake-pair-token",
      );
      const wire = JSON.parse(String(init?.body));
      expect(wire).toHaveProperty("gatewayVersion", "1.0");
      expect(wire).not.toHaveProperty("epoch");
      expect(wire).not.toHaveProperty("apiKey");
      response.traceId = wire.traceId;
      return Response.json(response);
    },
  });
  expect((await provider.complete(req)).origin).toBe("MODEL");
  expect(calls).toBe(1);
});
it("GW06 POST SSE handles split UTF8, CRLF and multiline data, waits for terminal EOF", async () => {
  const { response } = await setup();
  let preview = "";
  const serialized = JSON.stringify(response);
  const sse =
    'id: 1\r\nevent: text_delta\r\ndata: {"delta":"😀"}\r\n\r\nid: 2\r\nevent: final\r\ndata: ' +
    serialized.slice(0, serialized.indexOf('"guard"')) +
    "\r\ndata: " +
    serialized.slice(serialized.indexOf('"guard"')) +
    "\r\n\r\n";
  const output = await parseSse(body(sse), (delta) => {
    preview += delta;
  });
  expect(output).toEqual(response);
  expect(preview).toBe("😀");
  await expect(
    parseSse(
      body('id: 1\nevent: text_delta\ndata: {"delta":"incomplete"}\n\n'),
      () => {},
    ),
  ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  await expect(
    parseSse(
      body(sse + 'id: 3\nevent: text_delta\ndata: {"delta":"late"}\n\n'),
      () => {},
    ),
  ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  await expect(
    parseSse(
      body(
        'id: 1\nevent: error\ndata: {"error":{"code":"RATE_LIMITED","traceId":"test","retryable":true}}\n\n',
      ),
      () => {},
    ),
  ).rejects.toMatchObject({ code: "RATE_LIMITED" });
});
it("GW04 malformed response and 429 are failures without automatic retries", async () => {
  const { req } = await setup();
  let calls = 0;
  const options = {
    connection: () => ({
      token: "fake",
      tested: true,
      enabled: true,
      consented: true,
    }),
    transport: async () => {
      calls++;
      return Response.json(
        { error: { code: "RATE_LIMITED", traceId: "test", retryable: true } },
        { status: 429 },
      );
    },
  };
  await expect(createLiveProvider(options).complete(req)).rejects.toMatchObject(
    { code: "RATE_LIMITED" },
  );
  expect(calls).toBe(1);
});
