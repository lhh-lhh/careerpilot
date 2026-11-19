import { onMounted, onUnmounted, ref, shallowRef } from "vue";
import {
  appRepository,
  ensureDatabase,
  onDomainChange,
} from "../services/app-services";
import { useSessionStore } from "../stores/session";

export function useCounselorData() {
  const session = useSessionStore();
  const data = shallowRef<Awaited<
    ReturnType<typeof appRepository.readScopedSnapshot>
  > | null>(null);
  const catalog = shallowRef<Awaited<
    ReturnType<typeof appRepository.readCatalog>
  > | null>(null);
  const attachments = shallowRef<
    Awaited<ReturnType<typeof appRepository.listAttachments>>
  >([]);
  const loading = ref(true);
  const error = ref("");
  let generation = 0;
  let disposed = false;

  async function load() {
    const id = ++generation;
    const actor = session.actor;
    if (!actor || actor.role !== "counselor") return;
    error.value = "";
    try {
      await ensureDatabase();
      const result = await Promise.all([
        appRepository.readScopedSnapshot(actor),
        appRepository.readCatalog(actor),
        appRepository.listAttachments(actor),
      ]);
      if (
        disposed ||
        generation !== id ||
        session.actor?.userId !== actor.userId
      )
        return;
      [data.value, catalog.value, attachments.value] = result;
    } catch {
      if (id === generation)
        error.value = "学生材料暂时无法读取，原数据不会被自动清除。";
    } finally {
      if (id === generation) loading.value = false;
    }
  }

  const unsubscribe = onDomainChange(() => void load());
  onMounted(load);
  onUnmounted(() => {
    disposed = true;
    generation++;
    unsubscribe();
  });
  const label = (id: string | null) =>
    catalog.value?.dictionaries.find((row) => row.id === id)?.label ??
    id ??
    "未填写";
  return { data, catalog, attachments, loading, error, load, label };
}
