import { createDatabase } from "../adapters/repository/db";
import { createRepository } from "./repository";
import { appAiRuntime } from "./ai-runtime";
import { isOnline } from "./runtime";
import { createHttpRepository, connectChanges, disconnectChanges } from "../adapters/repository/http";
export { appAiRuntime } from "./ai-runtime";
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("careerpilot-revisions")
    : null;
const listeners = new Set<() => void>();
const blockedListeners = new Set<() => void>();
let databaseBlocked = false;
const notify = () => {
  for (const listener of listeners) listener();
};
channel?.addEventListener("message", notify);
const db = isOnline ? null : createDatabase();
export const appRepository = db ? createRepository(db, {
  committed: () => {
    notify();
    channel?.postMessage({ type: "revision-changed" });
  },
  invalidate: () => {
    appAiRuntime.cancelAll();
    window.dispatchEvent(new Event("careerpilot-invalidate"));
  },
}) : createHttpRepository(notify);
export function startOnlineChanges() {
  if (isOnline) connectChanges(notify, (connected) => window.dispatchEvent(new CustomEvent("careerpilot-sync", { detail: connected })));
}
export const stopOnlineChanges = disconnectChanges;
db?.on("blocked", () => {
  databaseBlocked = true;
  for (const listener of blockedListeners) listener();
});
let ready: Promise<void> | null = null;
export function ensureDatabase(): Promise<void> {
  ready ??= appRepository
    .initialize()
    .then(() => {
      databaseBlocked = false;
    })
    .catch((error: unknown) => {
      ready = null;
      throw error;
    });
  return ready;
}
export function onDomainChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function onDatabaseBlocked(listener: () => void): () => void {
  blockedListeners.add(listener);
  if (databaseBlocked)
    queueMicrotask(() => {
      if (databaseBlocked && blockedListeners.has(listener)) listener();
    });
  return () => blockedListeners.delete(listener);
}
