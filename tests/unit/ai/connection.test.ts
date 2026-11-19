import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAiConnectionStore } from "../../../src/stores/aiConnection";
import { deferred } from "../../helpers/deferred";
beforeEach(() => setActivePinia(createPinia()));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
it("online mode refuses local gateway pairing before any outbound request", async () => {
  vi.resetModules();
  vi.stubGlobal("window", { __CAREERPILOT_ONLINE__: true });
  const outbound = vi.fn();
  vi.stubGlobal("fetch", outbound);
  const { useAiConnectionStore: onlineStore } = await import("../../../src/stores/aiConnection");
  await expect(onlineStore().pair("12345678")).rejects.toMatchObject({ code: "PROVIDER_DISABLED" });
  expect(outbound).not.toHaveBeenCalled();
  vi.resetModules();
});
it("GW12 pair/test/enable require separate explicit actions and token never persists", async () => {
  let calls = 0;
  const storage = vi.fn();
  vi.stubGlobal("localStorage", { setItem: storage });
  vi.stubGlobal("sessionStorage", { setItem: storage });
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls++;
    if (url.endsWith("/pair")) {
      expect(JSON.parse(String(init?.body))).toEqual({ code: "12345678" });
      return Response.json({
        token: "fake-pair-token",
        expiresAt: "2099-01-01T00:00:00Z",
        gatewayInstanceId: "unit-instance",
      });
    }
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer fake-pair-token",
    );
    if (url.endsWith("/providers"))
      return Response.json({
        providerId: "deepseek",
        model: "deepseek-flash",
        configured: true,
        liveEnabled: true,
        gatewayInstanceId: "unit-instance",
      });
    expect(JSON.parse(String(init?.body))).toEqual({ confirmPaidCall: true });
    return Response.json({
      status: "passed",
      providerId: "deepseek",
      model: "deepseek-flash",
      latencyMs: 8,
      usage: null,
    });
  });
  const store = useAiConnectionStore();
  expect(store.mode).toBe("REPLAY");
  await store.pair("12345678");
  expect(calls).toBe(2);
  expect(store.tested).toBe(false);
  expect(() => store.enableLive()).toThrow("PROVIDER_DISABLED");
  await expect(store.testConnection(false)).rejects.toMatchObject({
    code: "INPUT_BLOCKED",
  });
  expect(calls).toBe(2);
  await store.testConnection(true);
  expect(store.mode).toBe("REPLAY");
  store.enableLive();
  expect(store.mode).toBe("LIVE");
  expect(store.connection().consented).toBe(false);
  store.consentOnce("domain-a");
  expect(store.connection("domain-a").consented).toBe(true);
  expect(store.connection("domain-b").consented).toBe(false);
  store.roleChanged();
  expect(store.mode).toBe("REPLAY");
  expect(store.paired).toBe(true);
  expect(store.connection("domain-a").consented).toBe(false);
  expect(storage).not.toHaveBeenCalled();
});
it("GW12 disable clears memory immediately and best-effort unpair still uses old token", async () => {
  const headers: string[] = [];
  let unpaired = false;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url.endsWith("/pair"))
      return Response.json({
        token: "old-token",
        expiresAt: "2099-01-01T00:00:00Z",
        gatewayInstanceId: "i",
      });
    if (url.endsWith("/providers"))
      return Response.json({
        providerId: "deepseek",
        model: "deepseek-flash",
        configured: true,
        liveEnabled: true,
        gatewayInstanceId: "i",
      });
    headers.push(new Headers(init?.headers).get("Authorization")!);
    unpaired = true;
    return new Response(null, { status: 204 });
  });
  const store = useAiConnectionStore();
  await store.pair("12345678");
  store.disableLive();
  expect(store.paired).toBe(false);
  expect(store.mode).toBe("REPLAY");
  await Promise.resolve();
  expect(unpaired).toBe(true);
  expect(headers).toEqual(["Bearer old-token"]);
});
it("GW12 role change invalidates a pending pairing response without reviving another role's connection", async () => {
  const response = deferred<Response>();
  let signal: AbortSignal | null | undefined;
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
    signal = init.signal;
    return response.promise;
  });
  const store = useAiConnectionStore();
  const result = store.pair("12345678").catch(error => error);
  store.roleChanged();
  response.resolve(Response.json({ token: "stale-token", expiresAt: "2099-01-01T00:00:00Z", gatewayInstanceId: "i" }));
  expect(await result).toMatchObject({ code: "CANCELLED" });
  expect(signal?.aborted).toBe(true);
  expect(store.paired).toBe(false);
  expect(store.busy).toBe(false);
});
it("GW12 expired memory token cannot authorize a later request", async () => {
  vi.stubGlobal("fetch", async (url: string) => Response.json(url.endsWith("/pair")
    ? { token: "expiring-token", expiresAt: "2099-01-01T00:00:00Z", gatewayInstanceId: "i" }
    : { providerId: "deepseek", model: "deepseek-flash", configured: true, liveEnabled: true, gatewayInstanceId: "i" }));
  const store = useAiConnectionStore();
  await store.pair("12345678");
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2099-01-01T00:00:01Z"));
  expect(store.connection().token).toBeNull();
  expect(store.paired).toBe(false);
});
it("GW12 connection handshake rejects oversized JSON before retaining a token", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ token: "x".repeat(65537), expiresAt: "2099-01-01T00:00:00Z", gatewayInstanceId: "i" }));
  const store = useAiConnectionStore();
  await expect(store.pair("12345678")).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  expect(store.paired).toBe(false);
});
