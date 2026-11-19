<script setup lang="ts">
import WorkbenchHeader from "../components/presentation/WorkbenchHeader.vue";
import { onBeforeUnmount, onMounted, ref, toRaw } from "vue";
import { useRouter } from "vue-router";
import { useSessionStore } from "../stores/session";
import {
  appRepository,
  ensureDatabase,
  onDatabaseBlocked,
  onDomainChange,
} from "../services/app-services";
import { storageMessage } from "../services/repository";
import { fixedClock } from "../domain/clock";
import { matchInWorker } from "../services/matching-worker";
import type { Resume } from "../types/entities";
import AppButton from "../components/base/AppButton.vue";
import AppInput from "../components/base/AppInput.vue";
import AppTag from "../components/base/AppTag.vue";
import AppModal from "../components/base/AppModal.vue";
import AppSkeleton from "../components/base/AppSkeleton.vue";
const session = useSessionStore(),
  router = useRouter();
const loading = ref(true),
  busy = ref(false),
  error = ref(""),
  status = ref(""),
  stale = ref(false),
  studentCount = ref(0),
  jobCount = ref(0),
  name = ref(""),
  resume = ref<Resume | null>(null),
  erase = ref(false),
  reset = ref(false);
let saving = false;
const performanceResult = ref<{
  p95: number;
  preprocessMs: number;
  unchanged: boolean;
} | null>(null);
const attachments = ref<{ id: string; fileName: string; url: string }[]>([]);
function releaseAttachments() {
  attachments.value.forEach((a) => URL.revokeObjectURL(a.url));
  attachments.value = [];
}
async function loadAttachments() {
  if (!session.actor) return;
  const files = await appRepository.listAttachments(session.actor);
  releaseAttachments();
  attachments.value = files.map((file) => ({
    id: file.id,
    fileName: file.fileName,
    url: URL.createObjectURL(file.blob),
  }));
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  if (!file || !session.actor) return;
  error.value = "";
  status.value = "";
  try {
    await appRepository.addAttachment(
      session.actor,
      { fileName: file.name, blob: file },
      fixedClock,
    );
    await loadAttachments();
    status.value = "附件已保存到本机，刷新后可重新打开。";
  } catch (e) {
    error.value =
      e instanceof Error && "code" in e && e.code === "VALIDATION_ERROR"
        ? e.message
        : storageMessage(e);
  } finally {
    input.value = "";
  }
}
async function runPerformance() {
  if (!session.actor || !resume.value) return;
  busy.value = true;
  error.value = "";
  try {
    const original = JSON.stringify(resume.value),
      catalog = await appRepository.readCatalog(session.actor),
      jobs = await appRepository.listJobs(session.actor),
      input = {
        resume: window.structuredClone(toRaw(resume.value)),
        jobs,
        skills: catalog.skills,
        dictionaries: catalog.dictionaries,
        now: fixedClock.now(),
      };
    const first = await matchInWorker(input);
    for (let i = 0; i < 5; i++) await matchInWorker(input);
    const times: number[] = [];
    for (let i = 0; i < 30; i++)
      times.push((await matchInWorker(input)).roundTripMs);
    const controller = new AbortController();
    controller.abort();
    try {
      await matchInWorker(input, controller.signal);
    } catch (e) {
      if (!(e instanceof window.DOMException && e.name === "AbortError"))
        throw e;
    }
    performanceResult.value = {
      p95: times.sort((a, b) => a - b)[Math.ceil(0.95 * times.length) - 1]!,
      preprocessMs: first.preprocessMs,
      unchanged: JSON.stringify(resume.value) === original,
    };
  } catch (e) {
    error.value = e instanceof Error ? e.message : "性能检查失败";
  } finally {
    busy.value = false;
  }
}
async function load() {
  loading.value = true;
  error.value = "";
  try {
    await ensureDatabase();
    const actor = session.actor;
    if (!actor) return;
    if (actor.role !== "company")
      studentCount.value = (await appRepository.listStudents(actor)).length;
    jobCount.value = (await appRepository.listJobs(actor)).length;
    if (actor.role === "student") {
      const students = await appRepository.listStudents(actor);
      const own = students[0];
      if (own) {
        resume.value = await appRepository.readResume(actor, own.id);
        name.value = resume.value.sections.basic.name;
        await loadAttachments();
      }
    }
    stale.value = false;
  } catch (e) {
    error.value = storageMessage(e);
  } finally {
    loading.value = false;
  }
}
async function save() {
  if (!session.actor || !resume.value) return;
  busy.value = true;
  error.value = "";
  status.value = "";
  saving = true;
  try {
    const sections = window.structuredClone(toRaw(resume.value.sections));
    sections.basic.name = name.value;
    await appRepository.execute(
      {
        type: "SAVE_RESUME",
        commandId: crypto.randomUUID(),
        entityId: resume.value.id,
        expectedRevision: resume.value.revision,
        payload: { sections },
      },
      session.actor,
      fixedClock,
    );
    await load();
    status.value = "已保存到本机，初始版本保留。";
  } catch (e) {
    error.value =
      e instanceof Error && "code" in e && e.code === "REVISION_CONFLICT"
        ? "其他标签页已修改此简历。当前输入保留，请重新读取后核对再保存。"
        : storageMessage(e);
  } finally {
    busy.value = false;
    saving = false;
  }
}
async function clearMine() {
  if (!session.actor) return;
  busy.value = true;
  try {
    await appRepository.clearMyData(session.actor, true);
    session.logout();
    await router.push("/login");
  } catch (e) {
    error.value = storageMessage(e);
  } finally {
    busy.value = false;
    erase.value = false;
  }
}
async function resetAll() {
  if (!session.actor) return;
  busy.value = true;
  try {
    await appRepository.resetDemo(session.actor);
    session.logout();
    localStorage.removeItem("careerpilot-theme");
    await router.push("/login");
  } catch (e) {
    error.value = storageMessage(e);
  } finally {
    busy.value = false;
    reset.value = false;
  }
}
const stop = onDomainChange(() => {
  if (!saving) stale.value = true;
});
const unblock = onDatabaseBlocked(() => {
  error.value =
    "数据库升级被其他标签页阻止。请关闭旧标签页后点击重新读取；已有数据不会被清空。";
});
onMounted(load);
onBeforeUnmount(() => {
  releaseAttachments();
  stop();
  unblock();
});
</script>
<template>
  <main id="main-content" class="data-page ui-scene ui-scene--service">
    <WorkbenchHeader>
      <template #heading="{design}"><div>
        <p class="eyebrow">LOCAL DATA / 开发验收</p>
        <h1>{{ design.headline }}</h1>
        <p class="intro">先让数据可靠，再让服务发生。</p>
      </div></template>
      <template #actions><AppTag>全部虚构 · IndexedDB</AppTag></template>
    </WorkbenchHeader>
    <p class="notice">
      此页面用于M2持久化与隐私验收，不是最终业务工作台。数据仅属于当前浏览器与127.0.0.1:4173。
    </p>
    <div v-if="loading" class="loading">
      <AppSkeleton /><AppSkeleton width="60%" />
    </div>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="status" role="status" class="status">{{ status }}</p>
    <div v-if="stale" class="stale" role="alert">
      本机其他操作已更新数据。当前输入未覆盖，请重新读取后核对。
    </div>
    <div class="data-grid" v-if="!loading">
      <section class="local-stats">
        <p class="eyebrow">当前身份的可见范围</p>
        <div class="stat">
          <strong class="numeric">{{ studentCount }}</strong><span
            >{{ studentCount }} 位学生</span
          >
        </div>
        <div class="stat">
          <strong class="numeric">{{ jobCount }}</strong><span>个可见岗位</span>
        </div>
        <p>
          学生仅本人，辅导员仅辖区，企业仅自己岗位及授权投递。不是生产认证隔离。
        </p>
      </section>
      <section class="data-editor">
        <h2>持久化草稿</h2>
        <template v-if="resume"
          ><AppInput
            v-model="name"
            label="演示简历姓名"
            helper="不要填写真实个人信息。保存后刷新可核对本机持久化。"
          />
          <p class="version-note">
            保留初始版本：{{ resume.versionIds.length > 0 ? "是" : "否" }} ·
            当前 revision {{ resume.revision }} ·
            {{ resume.versionIds.length }} 个版本
          </p>
          <AppButton :loading="busy" @click="save"
            >保存检查草稿</AppButton
          ></template
        >
        <p v-else>当前角色不直接编辑学生简历。</p>
        <AppButton variant="secondary" :disabled="busy" @click="load"
          >重新读取</AppButton
        >
      </section>
    </div>
    <section v-if="resume" class="privacy">
      <div>
        <h2>附件持久化检查</h2>
        <p>
          仅上传虚构证明，PDF、PNG或JPEG，单文件不超过2MiB。文件保存在本机，不外发。
        </p>
        <label class="attachment-input"
          >证明文件检查<input
            aria-label="证明文件检查"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            @change="upload"
        /></label>
        <ul class="attachment-list">
          <li v-for="file in attachments" :key="file.id">
            <a
              :href="file.url"
                :download="file.fileName"
              target="_blank"
              rel="noopener"
              :aria-label="`打开附件 ${file.fileName}`"
              >{{ file.fileName }}</a
            >
          </li>
        </ul>
      </div>
    </section>
    <section v-if="resume" class="privacy">
      <div>
        <h2>匹配计算性能</h2>
        <p>
          实际 Worker
          消息往返，100岗位，预热5次后连续30次；包含序列化与分批调度，取消不修改简历。
        </p>
        <p v-if="performanceResult" data-testid="matching-performance">
          30次 / p95
          <span data-testid="matching-p95">{{
            performanceResult.p95.toFixed(2)
          }}</span>
          ms · 初次本体预处理 {{ performanceResult.preprocessMs.toFixed(2) }} ms
          ·
          {{
            performanceResult.unchanged
              ? "真实简历未修改"
              : "检查失败：简历发生变化"
          }}
        </p>
      </div>
      <AppButton :loading="busy" variant="secondary" @click="runPerformance"
        >运行匹配性能检查</AppButton
      >
    </section>
    <section v-if="!loading" class="privacy">
      <div>
        <h2>隐私与恢复</h2>
        <p>
          清除本人会删除该生关联记录并退出；复位会重建整个虚构教学环境。两者均需再次确认。
        </p>
      </div>
      <AppButton
        v-if="session.actor?.role === 'student'"
        variant="danger"
        @click="erase = true"
        >清除本人演示数据</AppButton
      ><AppButton
        v-if="session.actor?.role === 'admin'"
        variant="danger"
        @click="reset = true"
        >复位完整虚构种子</AppButton
      >
    </section>
    <AppModal data-scene="governance" :open="erase" title="清除本人的演示数据？" @close="erase = false"
      ><p>
        将删除本人的账号、简历版本、投递、面试、协议、去向、附件和相关记录。其他学生与公司岗位不受影响。复位可恢复虚构初始数据，但无法找回清除前的个人修改。
      </p>
      <template #footer
        ><AppButton variant="secondary" @click="erase = false">取消</AppButton
        ><AppButton variant="danger" :loading="busy" @click="clearMine"
          >确认清除本人</AppButton
        ></template
      ></AppModal
    >
    <AppModal data-scene="governance" :open="reset" title="复位整个演示环境？" @close="reset = false"
      ><p>
        将取消运行任务，清空所有本机业务修改，恢复40位学生、100个岗位及固定时钟和REPLAY模式，然后退出。操作失败会回滚数据库。
      </p>
      <template #footer
        ><AppButton variant="secondary" @click="reset = false">取消</AppButton
        ><AppButton variant="danger" :loading="busy" @click="resetAll"
          >确认复位</AppButton
        ></template
      ></AppModal
    >
  </main>
</template>
<style scoped>
.data-page {
  padding: 48px;
  max-width: 1200px;
  margin: auto;
}
.data-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
}
.eyebrow {
  font-size: 12px;
  letter-spacing: 0;
  color: var(--brand-text);
  margin-bottom: 16px;
}
.intro {
  color: var(--text-2);
  margin-top: 16px;
}
.notice {
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-2);
  padding: 20px 0;
  border-bottom: 1px solid var(--border);
  margin: 24px 0 32px;
}
.data-grid {
  display: grid;
  grid-template-columns: 1fr 1.3fr;
  gap: 48px;
}
.local-stats {
  padding: 32px;
  background: var(--navy);
  color: var(--on-navy);
  border-radius: var(--r-card);
}
.local-stats .eyebrow {
  color: var(--on-navy-muted);
}
.stat {
  display: flex;
  align-items: baseline;
  gap: 16px;
  margin: 24px 0;
}
.stat strong {
  font-size: 40px;
  font-weight: 600;
}
.stat span,
.local-stats > p:last-child {
  font-size: 14px;
  color: var(--on-navy-muted);
  line-height: 1.8;
}
.data-editor {
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 20px;
}
.data-editor .app-field {
  width: 100%;
}
.version-note {
  font-size: 14px;
  color: var(--text-2);
}
.privacy {
  border-top: 1px solid var(--border);
  margin-top: 40px;
  padding-top: 32px;
  display: flex;
  justify-content: space-between;
  gap: 32px;
  align-items: center;
}
.privacy p {
  font-size: 14px;
  color: var(--text-2);
  max-width: 640px;
  margin-top: 12px;
  line-height: 1.8;
}
.error,
.stale,
.status {
  padding: 16px;
  font-size: 14px;
  border: 1px solid var(--border-control);
  margin: 16px 0;
  border-radius: var(--r-sm);
}
.error {
  color: var(--danger-text);
  background: var(--danger-soft);
}
.attachment-input {
  display: grid;
  gap: 12px;
  margin-top: 20px;
  font-size: 14px;
}
.attachment-list {
  margin-top: 16px;
  padding-left: 20px;
  font-size: 14px;
  line-height: 2;
}
.attachment-list a {
  color: var(--brand-text);
}
.status {
  color: var(--success-text);
  background: var(--success-soft);
}
.loading {
  display: grid;
  gap: 16px;
}
@media (max-width: 767px) {
  .data-page {
    padding: 28px 24px;
  }
  .data-heading,
  .privacy {
    flex-direction: column;
    align-items: flex-start;
  }
  .data-grid {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  .data-heading h1 {
    font-size: 28px;
  }
}
</style>
