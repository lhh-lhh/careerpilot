import { expect, it } from "vitest";
import golden from "../../fixtures/ai-golden.json";
import {
  canonicalJson,
  hashInput,
  hashSnapshot,
} from "../../../src/domain/ai-guard/fingerprint";
it.each(golden)(
  "AI02/GW05 shared browser/Python golden $id",
  async (fixture) => {
    expect(canonicalJson(fixture.input)).toBe(fixture.canonical);
    if (fixture.sha256)
      expect(await hashSnapshot(fixture.input)).toBe(fixture.sha256);
  },
);
it("AI02 uses JCS key order, NFC/LF, finite ECMAScript numbers, and set-only sorting", () => {
  expect(
    canonicalJson({
      z: undefined,
      text: "e\u0301\r\n😀",
      numbers: [-0, 1, 1e30, 0.000001],
      skillIds: ["b", "a", "a"],
      answers: ["b", "a"],
    }),
  ).toBe(
    '{"answers":["b","a"],"numbers":[0,1,1e+30,0.000001],"skillIds":["a","b"],"text":"é\\n😀","z":null}',
  );
  expect(canonicalJson({ "\uE000": 1, "😀": 2, a: 3 })).toBe(
    '{"a":3,"😀":2,"":1}',
  );
});
it("AI02 SHA-256 follows published golden value and ignores trace/epoch but preserves answer order", async () => {
  expect(await hashSnapshot({})).toBe(
    "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
  );
  const input = {
    module: "A2",
    operation: "feedback",
    promptVersion: "1.0",
    schemaVersion: "1.0",
    algorithmVersion: "1.0",
    domainRevision: "a".repeat(64),
    variables: { answers: ["first", "second"] },
  };
  expect(await hashInput({ ...input, traceId: "one", epoch: 1 })).toBe(
    await hashInput({ ...input, epoch: 2, traceId: "two" }),
  );
  expect(await hashInput(input)).not.toBe(
    await hashInput({ ...input, variables: { answers: ["second", "first"] } }),
  );
});
it.each([
  NaN,
  Infinity,
  new Date(),
  new Map(),
  "\uD800",
  { constructor: "forbidden" },
])(
  "AI08 rejects non-JSON, unsafe keys and lone surrogate input %j",
  (value) => {
    expect(() => canonicalJson(value)).toThrow("INPUT_BLOCKED");
  },
);
