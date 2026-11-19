import { onMounted, onUnmounted, shallowRef, ref, watch } from "vue";
import { browserDraftCache, type CachedDraft } from "../services/draft-cache";
import { useSessionStore } from "../stores/session";

export function useDraftRecovery<T>(module: string, capture: () => CachedDraft<T> | null, dirty: () => boolean, apply: (draft: CachedDraft<T>) => void) {
  const session = useSessionStore(), user = session.actor?.userId, epoch = session.epoch, cache = browserDraftCache();
  const pending = shallowRef(user ? cache?.read<T>(user, module) ?? null : null);
  const warning = ref("");
  function sync() {
    if (!user) return;
    if (session.actor?.userId !== user || session.epoch !== epoch) { cache?.remove(user, module); pending.value = null; return; }
    if (pending.value) return;
    const draft = capture();
    if (!dirty()) { cache?.remove(user, module); warning.value = ""; }
    else if (draft && !cache?.save(user, module, draft)) warning.value = "浏览器草稿缓存不可用，刷新前请先保存。";
  }
  watch(() => [JSON.stringify(capture()), dirty(), session.actor?.userId, session.epoch], sync, { flush: "sync" });
  function restore() { if (pending.value) { const draft = pending.value; pending.value = null; apply(draft); } }
  function discard() { if (user) cache?.remove(user, module); pending.value = null; }
  // A successful explicit save supersedes any older pending recovery choice.
  // If the user typed during the request, retain those newer unsaved edits instead.
  function committed() { pending.value = null; sync(); }
  function beforeUnload(event: BeforeUnloadEvent) { if (dirty() && warning.value) { event.preventDefault(); event.returnValue = ""; } }
  onMounted(() => window.addEventListener("beforeunload", beforeUnload));
  onUnmounted(() => window.removeEventListener("beforeunload", beforeUnload));
  return { pending, warning, restore, discard, committed };
}
