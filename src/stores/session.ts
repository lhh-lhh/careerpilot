import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { demoActors, roleLabels, roles } from "../types/identity";
import type { Actor, Role } from "../types/identity";
import { appAiRuntime } from "../services/ai-runtime";
import { useAiConnectionStore } from "./aiConnection";
import { isOnline } from "../services/runtime";
import { clearBrowserDrafts } from "../services/draft-cache";
import { loginOnline, logoutOnline, restoreOnlineSession } from "../adapters/repository/http";
import { startOnlineChanges, stopOnlineChanges } from "../services/app-services";

const storageKey = "careerpilot-session";
function restoreActor(): Actor | null {
  if (isOnline) return null;
  if (typeof sessionStorage === "undefined") return null;
  try {
    const saved: unknown = JSON.parse(
      sessionStorage.getItem(storageKey) ?? "null",
    );
    if (
      !saved ||
      typeof saved !== "object" ||
      !("role" in saved) ||
      !("userId" in saved)
    )
      return null;
    const role = saved.role as Role;
    return roles.includes(role) && saved.userId === demoActors[role].userId
      ? { ...demoActors[role] }
      : null;
  } catch {
    return null;
  }
}
export const useSessionStore = defineStore("session", () => {
  const actor = ref<Actor | null>(restoreActor());
  const epoch = ref(0);
  const displayName = ref("");
  const accountStatus = ref<'pending' | 'approved' | 'rejected'>('approved');
  function accept(current: Awaited<ReturnType<typeof restoreOnlineSession>>) {
    actor.value = current.actor; displayName.value = current.displayName;
    accountStatus.value = current.accountStatus;
    if (current.accountStatus === 'approved') startOnlineChanges(); else stopOnlineChanges();
  }
  async function refreshAccount() { accept(await restoreOnlineSession()); }
  let restored = false;
  async function restore() {
    if (!isOnline || restored) return;
    try {
      accept(await restoreOnlineSession());
    } catch { actor.value = null; }
    restored = true;
  }
  async function login(name: string, password: string) {
    const current = await loginOnline(name, password);
    accept(current);
    restored = true; epoch.value++;
  }
  const roleLabel = computed(() =>
    actor.value ? roleLabels[actor.value.role] : "访客",
  );
  const storageWarning = ref("");
  function persist() {
    if (typeof sessionStorage === "undefined") return;
    try {
      if (actor.value)
        sessionStorage.setItem(storageKey, JSON.stringify(actor.value));
      else sessionStorage.removeItem(storageKey);
    } catch {
      storageWarning.value = "浏览器禁止会话保存，刷新后需重新选择演示角色。";
    }
  }
  function enter(role: Role) {
    if (isOnline) throw Error("FORBIDDEN");
    if (!roles.includes(role)) throw Error("FORBIDDEN");
    clearBrowserDrafts();
    appAiRuntime.cancelAll();
    useAiConnectionStore().roleChanged();
    epoch.value += 1;
    actor.value = { ...demoActors[role] };
    persist();
  }
  async function logout() {
    if (isOnline) await logoutOnline();
    clearBrowserDrafts();
    stopOnlineChanges();
    appAiRuntime.cancelAll();
    useAiConnectionStore().disableLive();
    epoch.value += 1;
    actor.value = null;
    persist();
  }
  if (typeof window !== "undefined") window.addEventListener("careerpilot-session-expired", () => {
    if (!isOnline) return; clearBrowserDrafts(); actor.value = null; restored = false; stopOnlineChanges();
    window.dispatchEvent(new Event("careerpilot-invalidate"));
  });
  return { actor, epoch, roleLabel, storageWarning, displayName, accountStatus, refreshAccount, enter, logout, login, restore };
});
