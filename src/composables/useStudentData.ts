import { onMounted, onUnmounted, ref, shallowRef } from "vue";
import {
  appRepository,
  ensureDatabase,
  onDomainChange,
} from "../services/app-services";
import { useSessionStore } from "../stores/session";
export function useStudentData() {
  const session = useSessionStore();
  const data = shallowRef<Awaited<
    ReturnType<typeof appRepository.readScopedSnapshot>
  > | null>(null);
  const catalog = shallowRef<Awaited<
    ReturnType<typeof appRepository.readCatalog>
  > | null>(null);
  const jobs = shallowRef<Awaited<ReturnType<typeof appRepository.listJobs>>>(
    [],
  );
  const attachments = shallowRef<
    Awaited<ReturnType<typeof appRepository.listAttachments>>
  >([]);
  const loading = ref(true),
    error = ref("");
  let generation = 0,
    disposed = false;
  async function load() {
    const id = ++generation,
      actor = session.actor;
    if (!actor || actor.role !== "student") return;
    error.value = "";
    try {
      await ensureDatabase();
      const result = await Promise.all([
        appRepository.readScopedSnapshot(actor),
        appRepository.readCatalog(actor),
        appRepository.listJobs(actor),
        appRepository.listAttachments(actor),
      ]);
      if (
        disposed ||
        generation !== id ||
        session.actor?.userId !== actor.userId
      )
        return;
      [data.value, catalog.value, jobs.value, attachments.value] = result;
    } catch {
      if (id === generation)
        error.value = "本机数据暂时无法读取。原数据不会被自动清除，请重试。";
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
  const skillLabel = (id: string) =>
    catalog.value?.skills.find((row) => row.id === id)?.canonical ?? id;
  const companyLabel = (id: string) =>
    catalog.value?.companies.find((row) => row.id === id)?.name ?? "演示企业";
  return {
    data,
    catalog,
    jobs,
    attachments,
    loading,
    error,
    load,
    label,
    skillLabel,
    companyLabel,
  };
}
