import type { createRepository } from "../../services/repository";
import type { Actor } from "../../types/identity";
import type { Command } from "../../services/repository";
import type { Attachment, Json } from "../../types/entities";
import { DomainError } from "../../domain/errors";
export type Repository = ReturnType<typeof createRepository>;
let csrf = "";
/** Workbench audio/streaming calls have their own deadline; the API key stays on the server. */
export async function aiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.method && !['GET', 'HEAD'].includes(init.method)) headers.set('X-CSRF-Token', csrf);
  const response = await fetch(`/api/workbench${path}`, { ...init, headers, credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('careerpilot-session-expired'));
    const code = (await response.json().catch(() => null))?.error ?? 'NETWORK_ERROR';
    throw new DomainError(code);
  }
  return response;
}
export async function workbench<T>(path: string, payload?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await aiFetch(path, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000), ...(payload !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}) });
  return response.json() as Promise<T>;
}
export async function api<T>(path: string, payload?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin", cache: "no-store",
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
    ...(payload !== undefined ? { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify(payload) } : {}),
  });
  if (!response.ok) {
    const code = (await response.json().catch(() => null))?.error ?? "NETWORK_ERROR";
    if (response.status === 401) window.dispatchEvent(new Event("careerpilot-session-expired"));
    throw new DomainError(code);
  }
  return response.json() as Promise<T>;
}
export interface OnlineSession { actor: Actor; csrf: string; displayName: string; accountStatus: 'pending' | 'approved' | 'rejected' }
export async function restoreOnlineSession() {
  const session = await api<OnlineSession>("/api/session"); csrf = session.csrf; return session;
}
export async function loginOnline(login: string, password: string) {
  const session = await api<OnlineSession>("/api/session", { login, password }); csrf = session.csrf; return session;
}
export async function logoutOnline() { await api("/api/logout", {}); csrf = ""; }
let stream: EventSource | null = null;
export function connectChanges(changed: () => void, status: (connected: boolean) => void) {
  stream?.close(); stream = new EventSource("/api/events");
  stream.addEventListener("change", () => { status(true); changed(); });
  stream.onopen = () => status(true);
  stream.onerror = () => { status(false); void restoreOnlineSession().catch(() => { /* 401 clears the session; a network failure keeps the current draft. */ }); };
}
export function disconnectChanges() { stream?.close(); stream = null; }
function asBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]!);
    reader.onerror = () => reject(Error("FILE_READ_FAILED")); reader.readAsDataURL(blob);
  });
}
export function createHttpRepository(changed: () => void): Repository {
  const read = (name: string, args: unknown[] = []) => api(`/api/read/${name}?args=${encodeURIComponent(JSON.stringify(args))}`);
  const methods: Record<string, unknown> = {};
  for (const name of ["listStudents", "readResume", "readResumeHistory", "listApplications", "readApplication", "listJobs", "readCatalog", "readScopedSnapshot", "readCompanyWorkspace", "readAdminConsole", "readGovernance", "readTickets", "exportRedactedAudit", "listAttachments"]) {
    methods[name] = (_actor: Actor, ...args: unknown[]) => read(name, args);
  }
  return {
    ...methods, epoch: 0,
    initialize: async () => undefined,
    execute: async (command: Command) => { const result = await api<Json>("/api/commands", command); changed(); return result; },
    appendAiRun: async () => undefined,
    resetDemo: async () => { throw new DomainError("FORBIDDEN"); },
    clearMyData: async () => { throw new DomainError("FORBIDDEN", "在线数据保留需通过隐私申请办理。"); },
    addAttachment: async (_actor: Actor, file: { fileName: string; blob: Blob }) => {
      const result = await api<Attachment>("/api/attachments", { fileName: file.fileName, mime: file.blob.type, base64: await asBase64(file.blob) }); changed(); return result;
    },
    readAttachment: async (_actor: Actor, id: string) => {
      const result = await api<{ base64: string; mime: string }>(`/api/attachments/${encodeURIComponent(id)}`);
      return { ...result, blob: new Blob([Uint8Array.from(atob(result.base64), (x) => x.charCodeAt(0))], { type: result.mime }) };
    },
  } as unknown as Repository;
}
