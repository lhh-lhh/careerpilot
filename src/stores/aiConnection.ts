import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { AiFailure, type FailureCode } from "../adapters/ai/types";
import { appAiRuntime } from "../services/ai-runtime";
import { isOnline } from "../services/runtime";
const BASE = "http://127.0.0.1:8787";
const errors = new Set<FailureCode>([
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
  "INPUT_BLOCKED",
]);
export const useAiConnectionStore = defineStore("aiConnection", () => {
  // Pair token and consent never enter Pinia's serializable state or storage.
  let token: string | null = null,
    consentRevision: string | null = null,
    generation = 0;
  const pending = new Set<AbortController>();
  const paired = ref(false),
    tested = ref(false),
    enabled = ref(false),
    configured = ref(false),
    gatewayEnabled = ref(false),
    busy = ref(false),
    model = ref(""),
    expiresAt = ref(""),
    instanceId = ref(""),
    lastError = ref("");
  const mode = computed(() => (enabled.value ? "LIVE" : "REPLAY"));
  const stateLabel = computed(() =>
    busy.value
      ? "连接处理中"
      : enabled.value
        ? "LIVE 已启用"
        : tested.value
          ? "测试通过 · 待启用"
          : paired.value
            ? configured.value && gatewayEnabled.value
              ? "已配对 · 待测试"
              : "网关未启用"
            : "未配对 · 使用本地回放",
  );
  async function request(
    path: string,
    body?: unknown,
    authorization = token,
  ): Promise<Record<string, unknown>> {
    if (isOnline) throw new AiFailure("PROVIDER_DISABLED");
    const controller = new AbortController();
    pending.add(controller);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 17000);
    try {
      const result = await fetch(BASE + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(authorization
            ? { Authorization: `Bearer ${authorization}` }
            : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      });
      if (result.status === 204) return {};
      if (!result.body) throw new AiFailure("UPSTREAM_ERROR");
      const reader = result.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let bytes = 0, text = "";
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 65536) throw new AiFailure("UPSTREAM_ERROR");
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      let data: unknown;
      try { data = JSON.parse(text); } catch { throw new AiFailure("UPSTREAM_ERROR"); }
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw new AiFailure("UPSTREAM_ERROR");
      if (!result.ok) {
        const code = (data as { error?: { code?: FailureCode } }).error?.code;
        throw new AiFailure(code && errors.has(code) ? code : "UPSTREAM_ERROR");
      }
      return data as Record<string, unknown>;
    } catch (error) {
      if (error instanceof AiFailure) throw error;
      throw new AiFailure(
        timedOut ? "TIMEOUT" : controller.signal.aborted ? "CANCELLED" : "NETWORK_ERROR",
      );
    } finally {
      clearTimeout(timer);
      pending.delete(controller);
    }
  }
  function roleChanged() {
    appAiRuntime.cancelAll();
    enabled.value = false;
    consentRevision = null;
    generation++;
    for (const controller of pending) controller.abort();
    busy.value = false;
  }
  function disableLive() {
    roleChanged();
    generation++;
    for (const controller of pending) controller.abort();
    const previous = token;
    token = null;
    paired.value = false;
    tested.value = false;
    configured.value = false;
    gatewayEnabled.value = false;
    model.value = "";
    expiresAt.value = "";
    instanceId.value = "";
    busy.value = false;
    if (previous) void request("/api/unpair", {}, previous).catch(() => {});
  }
  async function pair(code: string) {
    if (!/^\d{8}$/.test(code)) throw new AiFailure("PAIRING_FAILED");
    if (token) disableLive();
    const captured = ++generation;
    busy.value = true;
    lastError.value = "";
    try {
      const value = await request("/api/pair", { code }, null);
      if (captured !== generation) throw new AiFailure("CANCELLED");
      if (
        typeof value.token !== "string" ||
        !value.token ||
        value.token.length > 512 ||
        typeof value.expiresAt !== "string" ||
        !Number.isFinite(Date.parse(value.expiresAt)) ||
        Date.parse(value.expiresAt) <= Date.now() ||
        typeof value.gatewayInstanceId !== "string"
      )
        throw new AiFailure("UPSTREAM_ERROR");
      token = value.token;
      expiresAt.value = value.expiresAt;
      instanceId.value = value.gatewayInstanceId;
      paired.value = true;
      const provider = await request("/api/ai/providers");
      if (captured !== generation) throw new AiFailure("CANCELLED");
      if (
        provider.providerId !== "deepseek" ||
        typeof provider.model !== "string" ||
        typeof provider.configured !== "boolean" ||
        typeof provider.liveEnabled !== "boolean" ||
        provider.gatewayInstanceId !== instanceId.value
      )
        throw new AiFailure("PROVIDER_CONFIG_ERROR");
      model.value = provider.model;
      configured.value = provider.configured;
      gatewayEnabled.value = provider.liveEnabled;
    } catch (error) {
      if (captured === generation) {
        lastError.value = error instanceof AiFailure ? error.code : "UPSTREAM_ERROR";
        disableLive();
      }
      throw error;
    } finally {
      if (captured === generation) busy.value = false;
    }
  }
  async function testConnection(confirmed: boolean) {
    if (!confirmed) throw new AiFailure("INPUT_BLOCKED");
    if (!token) throw new AiFailure("PAIRING_REQUIRED");
    if (!configured.value || !gatewayEnabled.value)
      throw new AiFailure("PROVIDER_DISABLED");
    roleChanged();
    const captured = generation;
    busy.value = true;
    lastError.value = "";
    tested.value = false;
    try {
      const result = await request("/api/ai/test", { confirmPaidCall: true });
      if (captured !== generation) throw new AiFailure("CANCELLED");
      if (
        result.status !== "passed" ||
        result.providerId !== "deepseek" ||
        result.model !== model.value
      )
        throw new AiFailure("UPSTREAM_ERROR");
      tested.value = true;
    } catch (error) {
      if (captured === generation) {
        lastError.value = error instanceof AiFailure ? error.code : "UPSTREAM_ERROR";
        if (lastError.value === "PAIRING_REQUIRED") disableLive();
      }
      throw error;
    } finally {
      if (captured === generation) busy.value = false;
    }
  }
  function enableLive() {
    if (!token || !tested.value || !configured.value || !gatewayEnabled.value)
      throw new AiFailure("PROVIDER_DISABLED");
    if (Date.parse(expiresAt.value) <= Date.now()) {
      disableLive();
      throw new AiFailure("PAIRING_REQUIRED");
    }
    enabled.value = true;
    consentRevision = null;
  }
  function consentOnce(domainRevision: string) {
    if (!enabled.value) throw new AiFailure("PROVIDER_DISABLED");
    consentRevision = domainRevision;
  }
  function clearConsent() {
    consentRevision = null;
  }
  function connection(domainRevision?: string) {
    if (token && Date.parse(expiresAt.value) <= Date.now()) disableLive();
    return {
      token,
      tested: tested.value,
      enabled: enabled.value,
      consented: !!domainRevision && consentRevision === domainRevision,
    };
  }
  function handleFailure(code: string) {
    lastError.value = code;
    if (["AUTH_FAILED", "QUOTA_EXCEEDED", "BUDGET_EXCEEDED"].includes(code))
      roleChanged();
    if (code === "PAIRING_REQUIRED") disableLive();
  }
  return {
    paired,
    tested,
    enabled,
    configured,
    gatewayEnabled,
    busy,
    model,
    expiresAt,
    instanceId,
    lastError,
    mode,
    stateLabel,
    pair,
    testConnection,
    enableLive,
    disableLive,
    unpair: disableLive,
    roleChanged,
    consentOnce,
    clearConsent,
    connection,
    handleFailure,
  };
});
