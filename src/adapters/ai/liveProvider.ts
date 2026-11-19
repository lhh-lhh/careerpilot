import {
  AiFailure,
  type FailureCode,
  type AiRequest,
  type AiResponse,
  type AiProvider,
} from "./types";
import { assertRequest } from "./registry";
import { hashInput } from "../../domain/ai-guard/fingerprint";
import { validateResponse } from "../../domain/ai-guard/schema";
import { guardPayload } from "../../domain/ai-guard/semantic";
export interface LiveOptions {
  connection: () => {
    token: string | null;
    tested: boolean;
    enabled: boolean;
    consented: boolean;
  };
  transport?: typeof fetch;
}
const codes = new Set<FailureCode>([
  "PROVIDER_DISABLED",
  "PROVIDER_CONFIG_ERROR",
  "PAIRING_REQUIRED",
  "PAIRING_FAILED",
  "AUTH_FAILED",
  "QUOTA_EXCEEDED",
  "NETWORK_ERROR",
  "UPSTREAM_ERROR",
  "TIMEOUT",
  "RATE_LIMITED",
  "QUEUE_FULL",
  "QUEUE_TIMEOUT",
  "BUDGET_EXCEEDED",
  "SCHEMA_INVALID",
  "SEMANTIC_INVALID",
  "INPUT_BLOCKED",
]);
function errorCode(value: unknown): AiFailure {
  const code = (value as { error?: { code?: FailureCode } } | null)?.error
    ?.code;
  return new AiFailure(code && codes.has(code) ? code : "UPSTREAM_ERROR");
}
function invalid(): never {
  throw new AiFailure("UPSTREAM_ERROR");
}
export async function parseSse(
  body: ReadableStream<Uint8Array>,
  onText: (delta: string) => void,
  signal?: AbortSignal,
): Promise<AiResponse> {
  const reader = body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "",
    event = "",
    id = "",
    data: string[] = [],
    lastId = 0,
    terminal: AiResponse | null = null,
    bytes = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  const dispatch = () => {
    if (!event && !id && !data.length) return;
    if (
      terminal ||
      !/^[1-9]\d*$/.test(id) ||
      Number(id) !== lastId + 1 ||
      !data.length
    )
      invalid();
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.join("\n"));
    } catch {
      invalid();
    }
    if (event === "text_delta") {
      const delta = parsed as { delta?: unknown };
      if (
        !delta ||
        Object.keys(delta).join() !== "delta" ||
        typeof delta.delta !== "string"
      )
        invalid();
      onText(delta.delta);
    } else if (event === "final") {
      if (!validateResponse(parsed)) throw new AiFailure("SCHEMA_INVALID");
      terminal = parsed as AiResponse;
    } else if (event === "error") throw errorCode(parsed);
    else invalid();
    lastId = Number(id);
    event = "";
    id = "";
    data = [];
  };
  const consume = () => {
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/u, "");
      buffer = buffer.slice(newline + 1);
      if (!line) {
        dispatch();
        continue;
      }
      if (line.startsWith(":")) continue;
      const colon = line.indexOf(":"),
        name = colon < 0 ? line : line.slice(0, colon),
        value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /u, "");
      if (name === "event") {
        if (event) invalid();
        event = value;
      } else if (name === "id") {
        if (id) invalid();
        id = value;
      } else if (name === "data") data.push(value);
      else invalid();
    }
  };
  try {
    while (true) {
      if (signal?.aborted) throw new AiFailure("CANCELLED");
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 256 * 1024) invalid();
      buffer += decoder.decode(chunk.value, { stream: true });
      consume();
    }
    if (signal?.aborted) throw new AiFailure("CANCELLED");
    buffer += decoder.decode();
    consume();
    if (buffer || event || id || data.length || !terminal) invalid();
    return terminal;
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof AiFailure) throw error;
    throw new AiFailure("UPSTREAM_ERROR");
  } finally {
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
async function limitedText(response: Response): Promise<string> {
  if (!response.body) invalid();
  const reader = response.body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0,
    text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 256 * 1024) invalid();
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  } finally {
    reader.releaseLock();
  }
}
export function createLiveProvider(options: LiveOptions): AiProvider {
  async function send(
    request: AiRequest,
    onText?: (delta: string) => void,
  ): Promise<AiResponse> {
    assertRequest(request);
    const connection = options.connection();
    if (!connection.token) throw new AiFailure("PAIRING_REQUIRED");
    if (!connection.enabled || !connection.tested)
      throw new AiFailure("PROVIDER_DISABLED");
    if (!connection.consented) throw new AiFailure("INPUT_BLOCKED");
    if (request.signal?.aborted) throw new AiFailure("CANCELLED");
    const controller = new AbortController(),
      abort = () => controller.abort();
    request.signal?.addEventListener("abort", abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 17000);
    try {
      const inputHash = await hashInput({ ...request }),
        traceId = crypto.randomUUID();
      const wire = {
        gatewayVersion: "1.0",
        traceId,
        module: request.module,
        operation: request.operation,
        promptVersion: request.promptVersion,
        schemaVersion: request.schemaVersion,
        algorithmVersion: request.algorithmVersion,
        inputHash,
        domainRevision: request.domainRevision,
        variables: request.variables,
      };
      const encoded = JSON.stringify(wire);
      if (new TextEncoder().encode(encoded).length > 65536)
        throw new AiFailure("INPUT_BLOCKED");
      if (controller.signal.aborted) throw new AiFailure("CANCELLED");
      const result = await (options.transport ?? fetch)(
        `http://127.0.0.1:8787/api/ai/${onText ? "chat" : "structured"}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${connection.token}`,
          },
          body: encoded,
          signal: controller.signal,
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
        },
      );
      if (!result.ok) {
        let value: unknown;
        try {
          value = JSON.parse(await limitedText(result));
        } catch {
          throw new AiFailure("UPSTREAM_ERROR");
        }
        throw errorCode(value);
      }
      const type = result.headers.get("content-type") ?? "";
      let value: unknown;
      if (onText) {
        if (!type.startsWith("text/event-stream") || !result.body) invalid();
        value = await parseSse(result.body, onText, controller.signal);
      } else {
        if (!type.startsWith("application/json")) invalid();
        try {
          value = JSON.parse(await limitedText(result));
        } catch {
          throw new AiFailure("SCHEMA_INVALID");
        }
      }
      if (controller.signal.aborted)
        throw new AiFailure(timedOut ? "TIMEOUT" : "CANCELLED");
      if (!validateResponse(value)) throw new AiFailure("SCHEMA_INVALID");
      const response = value as AiResponse;
      if (
        response.traceId !== traceId ||
        response.inputHash !== inputHash ||
        response.domainRevision !== request.domainRevision ||
        response.effectiveMode !== "LIVE" ||
        response.origin !== "MODEL" ||
        response.requestedMode !== "LIVE"
      )
        throw new AiFailure("SEMANTIC_INVALID");
      return {
        ...response,
        guard: { passed: true, masked: true, flags: [] },
        data: guardPayload(
          request.module,
          request.operation,
          request.variables,
          response.data,
        ),
      };
    } catch (error) {
      if (request.signal?.aborted) throw new AiFailure("CANCELLED");
      if (timedOut) throw new AiFailure("TIMEOUT");
      if (error instanceof AiFailure) throw error;
      throw new AiFailure("NETWORK_ERROR");
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", abort);
    }
  }
  return {
    complete: (request) => send(request),
    stream: (request, onText) => send(request, onText),
  };
}
