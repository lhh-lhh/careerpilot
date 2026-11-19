<script setup lang="ts">
import WorkbenchGuide from "../../components/presentation/WorkbenchGuide.vue";
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { useCounselorData } from "../../composables/useCounselorData";
import { appRepository } from "../../services/app-services";
import { useSessionStore } from "../../stores/session";
import { fixedClock } from "../../domain/clock";
import type { Destination, Student } from "../../types/entities";
import AppButton from "../../components/base/AppButton.vue";
import AppIcon from "../../components/base/AppIcon.vue";
import AppModal from "../../components/base/AppModal.vue";
import AppSkeleton from "../../components/base/AppSkeleton.vue";
import AppTag from "../../components/base/AppTag.vue";
import DestinationHistory from '../../components/business/DestinationHistory.vue';

const route = useRoute();
const session = useSessionStore();
const { data, catalog, attachments, loading, error, load, label } = useCounselorData();
const selectedId = ref("");
const query = ref("");
const reviewState = ref(""), major = ref(""), cohort = ref("");
const majorOptions = computed(() => catalog.value?.dictionaries.filter(d => d.kind === "major" && data.value?.students.some(s => s.majorId === d.id)) ?? []);
const cohortOptions = computed(() => [...new Set(data.value?.students.map(s => s.cohortYear) ?? [])].sort());
const notice = ref("");
const reasonOpen = ref<"REJECT" | "REVOKE_APPROVAL" | null>(null);
const reason = ref("");
const working = ref(false);
const reasonTarget = ref<{ id: string; revision: number } | null>(null);
function prepareReason(action: 'REJECT' | 'REVOKE_APPROVAL') {
  if (!destination.value) return;
  reasonTarget.value = { id: destination.value.id, revision: destination.value.revision }; reason.value = ''; reasonOpen.value = action;
}
const statusLabels: Record<Destination["status"], string> = {
  draft: "草稿",
  submitted: "待审核",
  approved: "已通过",
  rejected: "已驳回",
};
const typeLabels: Record<Destination["type"], string> = {
  employment: "签约就业",
  furtherStudy: "升学",
  entrepreneurship: "自主创业",
  flexible: "灵活就业",
  unemployed: "待就业",
};
const students = computed(() => {
  const rows = data.value?.students ?? [];
  const searched = rows.filter((student) => {
    const name = resumeName(student.id);
    return `${name}${student.studentNo}`.toLowerCase().includes(query.value.trim().toLowerCase()) &&
      (!reviewState.value || (destinationFor(student.id)?.status ?? "none") === reviewState.value) &&
      (!major.value || student.majorId === major.value) && (!cohort.value || String(student.cohortYear) === cohort.value);
  });
  if (route.params.section === "review")
    return [...searched].sort((a, b) => {
      const as = destinationFor(a.id)?.status === "submitted" ? 0 : 1;
      const bs = destinationFor(b.id)?.status === "submitted" ? 0 : 1;
      return as - bs || a.studentNo.localeCompare(b.studentNo);
    });
  return searched;
});
const selected = computed(
  () =>
    students.value.find(
      (student) => student.id === selectedId.value,
    ) ??
    students.value[0] ??
    null,
);
const destination = computed(() => destinationFor(selected.value?.id ?? ""));
const pendingCount = computed(
  () =>
    data.value?.destinations.filter((item) => item.status === "submitted")
      .length ?? 0,
);
const approvedCount = computed(
  () =>
    data.value?.destinations.filter((item) => item.status === "approved")
      .length ?? 0,
);

function resumeFor(studentId: string) {
  return (
    data.value?.resumes.find((resume) => resume?.studentId === studentId) ??
    null
  );
}
function resumeName(studentId: string) {
  return resumeFor(studentId)?.sections.basic.name ?? "未命名学生";
}
function destinationFor(studentId: string) {
  return (
    data.value?.destinations.find((item) => item.studentId === studentId) ??
    null
  );
}
function selectStudent(student: Student) {
  selectedId.value = student.id;
}
function tone(status?: Destination["status"]) {
  return status === "approved"
    ? ("success" as const)
    : status === "submitted"
      ? ("warn" as const)
      : status === "rejected"
        ? ("danger" as const)
        : ("neutral" as const);
}
async function executeAction(action: "APPROVE" | "REJECT" | "REVOKE_APPROVAL") {
  const target = action === 'APPROVE' ? destination.value : reasonTarget.value;
  if (!session.actor || !target || working.value) return;
  working.value = true;
  notice.value = "";
  try {
    await appRepository.execute(
      {
        type: "DESTINATION_ACTION",
        commandId: crypto.randomUUID(),
        entityId: target.id,
        expectedRevision: target.revision,
        payload: {
          action,
          ...(action === "APPROVE" ? {} : { reason: reason.value }),
        },
      },
      session.actor,
      fixedClock,
    );
    await load();
    reasonOpen.value = null;
    reason.value = "";
    notice.value =
      action === "APPROVE"
        ? "审核已通过，去向统计将依据审批记录更新。"
        : action === "REJECT"
          ? "材料已驳回，学生可以依据原因修改后重新提交。"
          : "已撤销审批，材料已回到可编辑草稿状态。";
  } catch {
    notice.value = "材料版本或审批状态已变化，本次操作未写入，请重新核对。";
  } finally {
    working.value = false;
  }
}
async function downloadAttachment(id: string) {
  if (!session.actor) return;
  try {
    const attachment = await appRepository.readAttachment(session.actor, id);
    const url = URL.createObjectURL(attachment.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = attachment.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch {
    notice.value = "证明材料暂时无法读取，请核对当前学生范围。";
  }
}
</script>

<template>
  <main id="main-content" class="business-page counselor-page ui-scene ui-scene--governance" :class="{ 'feature-review': route.params.section === 'review' }">
    <WorkbenchHeader>
      <template #heading><div>
        <p class="eyebrow">辅导员 · 2027届辖区</p>
        <h1>{{ route.params.section === 'review' ? '每一份材料，都有明确的办理依据。' : '看见材料，也看见背后的人。' }}</h1>
        <p>查看辖区材料、审核去向，跟进学生进展。</p>
      </div></template>
      <template #actions><div class="review-metrics">
        <span
          ><strong>{{ data?.students.length ?? 0 }}</strong
          >辖区学生</span
        >
        <span class="pending"
          ><strong>{{ pendingCount }}</strong
          >待审核</span
        >
        <span
          ><strong>{{ approvedCount }}</strong
          >已通过</span
        >
      </div></template>
    </WorkbenchHeader>
    <nav class="review-tabs" aria-label="学生支持视图">
      <RouterLink to="/counselor">学生名册</RouterLink>
      <RouterLink to="/counselor/review"
        >去向审核 <b v-if="pendingCount">{{ pendingCount }}</b></RouterLink
      >
    </nav>
    <p v-if="notice" class="business-notice" role="status">{{ notice }}</p>
    <p v-if="error" class="business-notice business-error" role="alert">
      {{ error }}
    </p>
    <AppSkeleton v-else-if="loading" />
    <section v-else class="workbench-split workbench-body-layout">
      <div class="review-workspace workbench-body-main">
      <aside class="student-roster">
        <label class="roster-search"
          ><span class="sr-only">搜索学生</span
          ><AppIcon name="people" :size="18" /><input
            v-model="query"
            placeholder="搜索姓名或学号"
        /></label>
        <div class="roster-filters">
          <select v-model="reviewState" aria-label="去向审核状态"><option value="">全部审核状态</option><option value="none">未填报</option><option v-for="(name, status) in statusLabels" :key="status" :value="status">{{ name }}</option></select>
          <select v-model="major" aria-label="学生专业"><option value="">全部专业</option><option v-for="item in majorOptions" :key="item.id" :value="item.id">{{ item.label }}</option></select>
          <select v-model="cohort" aria-label="毕业届别"><option value="">全部届别</option><option v-for="year in cohortOptions" :key="year" :value="String(year)">{{ year }}届</option></select>
        </div>
        <div class="roster-caption">
          <span>{{
            route.params.section === "review" ? "审核队列" : "辖区名册"
          }}</span
          ><small>{{ students.length }} 人</small>
        </div>
        <button
          v-for="student in students"
          :key="student.id"
          :class="{ selected: student.id === selected?.id }"
          :aria-label="`查看 ${resumeName(student.id)} 的就业材料`"
          @click="selectStudent(student)"
        >
          <span class="student-avatar">{{
            resumeName(student.id).slice(0, 1)
          }}</span>
          <span
            ><strong>{{ resumeName(student.id) }}</strong
            ><small
              >{{ student.studentNo }} · {{ label(student.majorId) }}</small
            ></span
          >
          <AppTag :tone="tone(destinationFor(student.id)?.status)">{{
            destinationFor(student.id)
              ? statusLabels[destinationFor(student.id)!.status]
              : "未填报"
          }}</AppTag>
        </button>
        <p v-if="!students.length" class="roster-empty">没有符合条件的学生。</p>
      </aside>
      <article v-if="selected" class="student-review">
        <header class="student-identity">
          <div class="identity-mark">
            {{ resumeName(selected.id).slice(0, 1) }}
          </div>
          <div>
            <p class="eyebrow">{{ selected.studentNo }}</p>
            <h2>{{ resumeName(selected.id) }}</h2>
            <p>
              {{ label(selected.collegeId) }} · {{ label(selected.majorId) }} ·
              {{ selected.cohortYear }}届
            </p>
          </div>
          <AppTag :tone="tone(destination?.status)">{{
            destination ? statusLabels[destination.status] : "未填报"
          }}</AppTag>
        </header>
        <template v-if="destination">
          <section class="destination-summary">
            <div>
              <small>毕业去向</small
              ><strong>{{ typeLabels[destination.type] }}</strong>
            </div>
            <div>
              <small>单位 / 学校</small
              ><strong>{{ destination.organizationName || "暂未填写" }}</strong>
            </div>
            <div>
              <small>信息来源</small
              ><strong>{{
                destination.source === "internal"
                  ? "校内招聘闭环"
                  : destination.source === "external"
                    ? "校外就业材料"
                    : "学生独立填报"
              }}</strong>
            </div>
            <div>
              <small>提交时间</small
              ><strong class="data-number">{{
                destination.submittedAt
                  ? destination.submittedAt.slice(0, 10)
                  : "尚未提交"
              }}</strong>
            </div>
          </section>
          <section class="evidence-panel">
            <div class="section-heading">
              <h3><AppIcon name="agreement" :size="20" />材料与关联依据</h3>
              <span class="caption">仅当前辖区可见</span>
            </div>
            <p v-if="destination.applicationId">
              <span>招聘申请</span
              ><strong>{{ destination.applicationId }}</strong>
            </p>
            <p v-if="destination.agreementId">
              <span>就业协议</span
              ><strong>{{ destination.agreementId }}</strong>
            </p>
            <p v-for="id in destination.attachmentIds" :key="id">
              <span>证明材料</span
              ><button class="attachment-link" @click="downloadAttachment(id)">
                <AppIcon name="upload" :size="16" />{{
                  attachments.find((item) => item.id === id)?.fileName ?? id
                }}
              </button>
            </p>
            <p
              v-if="
                !destination.attachmentIds.length && !destination.agreementId
              "
              class="muted"
            >
              当前没有可核对的协议或证明附件。
            </p>
          </section>
          <section v-if="destination.reviewReason" class="review-reason">
            <strong>最近审核说明</strong>
            <p>{{ destination.reviewReason }}</p>
          </section>
          <footer class="review-actions">
            <p>
              <AppIcon
                name="lock"
                :size="15"
              />审批会写入审计记录，不能通过状态下拉直接修改。
            </p>
            <div>
              <AppButton
                v-if="destination.status === 'submitted'"
                variant="secondary"
                @click="prepareReason('REJECT')"
                >驳回并说明</AppButton
              >
              <AppButton
                v-if="destination.status === 'submitted'"
                :loading="working"
                @click="executeAction('APPROVE')"
                >通过审核</AppButton
              >
              <AppButton
                v-if="destination.status === 'approved'"
                variant="secondary"
                @click="prepareReason('REVOKE_APPROVAL')"
                >撤销审批</AppButton
              >
            </div>
          </footer>
          <DestinationHistory :logs="data?.auditLogs ?? []" :entity-id="destination.id" />
        </template>
        <section v-else class="business-empty">
          <AppIcon name="destination" :size="38" />
          <h2>尚未提交毕业去向</h2>
          <p>可以先在后续支持中核对求职进度，但不能替学生代填去向。</p>
        </section>
      </article>
      </div>
      <WorkbenchGuide title="看清材料，再作判断。" copy="从辖区名册定位学生，结合原始材料、关联依据与办理历史核对。审核与后续支持各有边界，不替学生代填事实。" />
    </section>
    <AppModal data-scene="governance"
      :open="!!reasonOpen"
      :title="reasonOpen === 'REJECT' ? '驳回本次材料' : '撤销本次审批'"
      @close="reasonOpen = null"
    >
      <label class="form-label"
        >{{ reasonOpen === "REJECT" ? "驳回原因" : "撤销原因"
        }}<textarea
          v-model="reason"
          maxlength="300"
          placeholder="至少5个字，帮助学生理解下一步"
        ></textarea>
      </label>
      <template #footer
        ><AppButton variant="secondary" @click="reasonOpen = null"
          >取消</AppButton
        ><AppButton
          variant="danger"
          :loading="working"
          :disabled="reason.trim().length < 5"
          @click="executeAction(reasonOpen!)"
          >{{ reasonOpen === "REJECT" ? "确认驳回" : "确认撤销" }}</AppButton
        ></template
      >
    </AppModal>
  </main>
</template>

<style scoped>
.roster-filters { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 18px 12px; }
.roster-filters select { flex: 1 1 100px; min-width: 0; min-height: 36px; padding: 7px 10px; font: 12px var(--font-sans); border: 1px solid var(--border-control); border-radius: var(--r-control); background: var(--surface); color: var(--text-1); }
.roster-empty { padding: 20px; color: var(--text-2); font-size: 13px; }
.counselor-page {
  max-width: 1540px;
}
.review-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 32px;
  padding: 8px 4px 26px;
}
.review-heading h1 {
  font-size: 30px;
  line-height: 1.4;
  margin: 8px 0 12px;
}
.review-heading > div:first-child > p:last-child {
  font-size: 14px;
  color: var(--text-2);
}
.eyebrow {
  font: 12px var(--font-mono);
  color: var(--success-text);
}
.review-metrics {
  display: flex;
  align-items: stretch;
  background: var(--surface);
  border: 1px solid var(--border);
}
.review-metrics span {
  min-width: 112px;
  padding: 16px 20px;
  display: grid;
  gap: 4px;
  font-size: 11px;
  color: var(--text-3);
  border-left: 1px solid var(--border);
}
.review-metrics span:first-child {
  border: 0;
}
.review-metrics strong {
  font: 22px var(--font-mono);
  color: var(--text-1);
}
.review-metrics .pending {
  background: var(--warn-soft);
}
.review-metrics .pending strong {
  color: var(--warn-text);
}
.review-tabs {
  display: flex;
  gap: 28px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 28px;
}
.review-tabs a {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px 14px;
  color: var(--text-2);
  font-size: 14px;
  border-bottom: 2px solid transparent;
}
.review-tabs a.router-link-exact-active {
  color: var(--brand-text);
  border-color: var(--brand-text);
  font-weight: 600;
}
.review-tabs b {
  display: grid;
  place-items: center;
  min-width: 19px;
  height: 19px;
  padding: 0 5px;
  border-radius: 10px;
  background: var(--warn-soft);
  color: var(--warn-text);
  font: 11px var(--font-mono);
}
.review-workspace {
  display: grid;
  grid-template-columns: 370px minmax(0, 1fr);
  background: var(--surface);
  border: 1px solid var(--border);
  min-height: 670px;
}
.student-roster {
  background: var(--surface-2);
  border-right: 1px solid var(--border);
  padding: 18px 0;
}
.roster-search {
  margin: 0 18px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  border: 1px solid var(--border-control);
  padding: 0 12px;
  border-radius: var(--r-control);
}
.roster-search svg {
  color: var(--text-3);
}
.roster-search input {
  border: 0;
  border-radius: 0;
  height: 42px;
  min-width: 0;
  width: 100%;
  font: 14px var(--font-sans);
  color: var(--text-1);
  background: transparent;
}
.roster-caption {
  display: flex;
  justify-content: space-between;
  padding: 10px 20px;
  font-size: 12px;
  color: var(--text-2);
}
.roster-caption small {
  color: var(--text-3);
}
.student-roster > button {
  border: 0;
  border-radius: 0;
  width: 100%;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  text-align: left;
  padding: 14px 18px;
  border-left: 3px solid transparent;
  color: var(--text-1);
}
.student-roster > button:hover {
  background: var(--surface);
}
.student-roster > button.selected {
  background: var(--surface);
  border-left-color: var(--success);
}
.student-roster > button > span:nth-child(2) {
  display: grid;
  gap: 5px;
  min-width: 0;
}
.student-roster small {
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.student-avatar {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--success-soft);
  color: var(--success-text);
  font-weight: 700;
}
.student-review {
  padding: 32px;
  min-width: 0;
}
.student-identity {
  display: grid;
  grid-template-columns: 56px 1fr auto;
  gap: 16px;
  align-items: center;
  padding-bottom: 26px;
  border-bottom: 1px solid var(--border);
}
.identity-mark {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--success-soft);
  color: var(--success-text);
  font-size: 20px;
  font-weight: 700;
}
.student-identity h2 {
  font-size: 26px;
  margin: 5px 0;
}
.student-identity > div:nth-child(2) > p:last-child {
  font-size: 13px;
  color: var(--text-2);
}
.destination-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--border);
  margin: 26px 0;
}
.destination-summary > div {
  background: var(--surface);
  padding: 18px 16px;
  display: grid;
  gap: 8px;
}
.destination-summary small {
  font-size: 11px;
  color: var(--text-3);
}
.destination-summary strong {
  font-size: 13px;
  overflow-wrap: anywhere;
}
.evidence-panel {
  background: var(--surface-2);
  padding: 24px;
  margin: 0 0 20px;
}
.evidence-panel .section-heading {
  margin-bottom: 12px;
}
.evidence-panel h3 {
  display: flex;
  align-items: center;
  gap: 9px;
}
.evidence-panel h3 svg {
  color: var(--success-text);
}
.evidence-panel > p {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 18px;
  padding: 13px 0;
  border-top: 1px solid var(--border);
  font-size: 13px;
}
.evidence-panel > p > span {
  color: var(--text-3);
}
.evidence-panel strong {
  font: 12px var(--font-mono);
  overflow-wrap: anywhere;
}
.attachment-link {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--brand-text);
  text-align: left;
}
.review-reason {
  padding: 16px 18px;
  border-left: 3px solid var(--warn);
  background: var(--warn-soft);
  margin-bottom: 20px;
}
.review-reason p {
  font-size: 13px;
  color: var(--text-2);
  margin-top: 8px;
}
.review-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}
.review-actions > p {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 11px;
  color: var(--text-3);
}
.review-actions > div {
  display: flex;
  gap: 10px;
  flex: none;
}
@media (max-width: 1100px) {
  .review-heading {
    align-items: flex-start;
  }
  .review-metrics {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
  }
  .review-metrics span {
    min-width: 0;
    padding: 12px;
  }
  .review-workspace {
    grid-template-columns: 310px minmax(0, 1fr);
  }
  .destination-summary {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 1000px) {
  .review-workspace { grid-template-columns: 1fr; }
  .student-roster { border-right: 0; border-bottom: 1px solid var(--border); max-height: 330px; overflow: auto; }
}
@media (max-width: 767px) {
  .review-heading {
    display: grid;
  }
  .review-heading h1 {
    font-size: 24px;
  }
  .review-metrics {
    width: 100%;
  }
  .review-workspace {
    grid-template-columns: 1fr;
  }
  .student-roster {
    border-right: 0;
    border-bottom: 1px solid var(--border);
    max-height: 330px;
    overflow: auto;
  }
  .student-review {
    padding: 22px;
  }
  .destination-summary {
    grid-template-columns: 1fr;
  }
  .student-identity {
    grid-template-columns: 46px 1fr;
  }
  .student-identity > .tag {
    grid-column: 2;
    justify-self: start;
  }
  .identity-mark {
    width: 44px;
    height: 44px;
  }
  .evidence-panel > p {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .review-actions {
    display: grid;
  }
  .review-actions > div {
    flex-wrap: wrap;
  }
}
</style>
