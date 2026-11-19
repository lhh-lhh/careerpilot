<script setup lang="ts">
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import EntityMark from "../../components/base/EntityMark.vue";
import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import { useStudentData } from "../../composables/useStudentData";
import { appRepository } from "../../services/app-services";
import { useSessionStore } from "../../stores/session";
import { fixedClock } from "../../domain/clock";
import type { Application } from "../../types/entities";
import type { ApplicationAction } from "../../domain/lifecycle/transition";
import AppButton from "../../components/base/AppButton.vue";
import AppIcon from "../../components/base/AppIcon.vue";
import AppModal from "../../components/base/AppModal.vue";
import AppTag from "../../components/base/AppTag.vue";
import AppSkeleton from "../../components/base/AppSkeleton.vue";
import OfferDocument from '../../components/business/OfferDocument.vue';
import ResumeCard from '../../components/business/ResumeCard.vue';
const route = useRoute();
const { data, catalog, jobs, loading, error, companyLabel, load } = useStudentData(),
  session = useSessionStore();
const resumeLabel=(id:string)=>catalog.value?.skills.find(s=>s.id===id)?.canonical??catalog.value?.dictionaries.find(d=>d.id===id)?.label??id;
const selectedId = ref(typeof route.query.application === "string" ? route.query.application : ""),
  withdraw = ref<Application | null>(null),
  reason = ref(""),
  notice = ref("");
const responding = ref(false), responseReason = ref("");
const responseTarget = ref<{ id: string; revision: number; action: ApplicationAction; title: string } | null>(null);
const responseLabels: Record<string, string> = { pending: "等待你的响应", accepted: "已确认参加", declined: "已拒绝邀约", rescheduleRequested: "已申请改期" };
function prepareResponse(action: ApplicationAction, title: string) {
  if (!selected.value) return;
  responseTarget.value = { id: selected.value.id, revision: selected.value.revision, action, title };
  responseReason.value = "";
}
async function submitResponse() {
  const target = responseTarget.value;
  if (!target || !session.actor || responding.value) return;
  responding.value = true;
  try {
    await appRepository.execute({ type: "APPLICATION_ACTION", commandId: crypto.randomUUID(), entityId: target.id, expectedRevision: target.revision,
      payload: { action: target.action, ...(!['CONFIRM_INTERVIEW','ACCEPT_OFFER'].includes(target.action) ? { reason: responseReason.value } : {}) } }, session.actor, fixedClock);
    responseTarget.value = null;
    await load();
    notice.value = "响应已保存，企业将看到本次决定。";
  } catch { notice.value = "响应未完成，请核对最新安排、文书与截止时间后重试；填写内容已保留。"; }
  finally { responding.value = false; }
}
const apps = computed(() => data.value?.applications ?? []),
  selected = computed(
    () => apps.value.find((a) => a.id === selectedId.value) ?? apps.value[0],
  );
const states: Record<string, string> = {
  applied: "已投递",
  screening: "筛选中",
  interview: "面试阶段",
  offered: "录用意向",
  rejected: "未通过",
  withdrawn: "已撤回",
  closed: "已结束",
};
const currentOffer = computed(() => selected.value?.offerDocuments?.at(-1));
const previousOffers = computed(() => selected.value?.offerDocuments?.slice(0,-1) ?? []);
const offerCurrentTime = ref(Date.now());
let offerTimer: number | undefined;
onMounted(() => { offerTimer = window.setInterval(() => { offerCurrentTime.value = Date.now(); }, 1000); });
onBeforeUnmount(() => { window.clearInterval(offerTimer); });
const canRespondToOffer = computed(() => selected.value?.status === 'offered' && currentOffer.value?.status === 'pending' && Date.parse(currentOffer.value.responseDeadline) > offerCurrentTime.value);
const events = computed(
  () =>
    data.value?.applicationEvents
      .filter((e) => e.applicationId === selected.value?.id)
      .sort((a, b) => a.at.localeCompare(b.at)) ?? [],
);
const interviews = computed(() => data.value?.interviews
  .filter(i => i.applicationId === selected.value?.id)
  .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)) ?? []);
const titles: Record<string, string> = {
  APPLY: "提交简历快照",
  START_SCREEN: "开始筛选",
  SCHEDULE_INTERVIEW: "安排面试",
  RESCHEDULE: "调整面试时间",
  CONFIRM_INTERVIEW: "确认参加面试",
  DECLINE_INTERVIEW: "拒绝本次邀约",
  REQUEST_RESCHEDULE: "申请面试改期",
  CANCEL_INTERVIEW: "取消面试",
  COMPLETE_INTERVIEW: "完成面试反馈",
  ISSUE_OFFER: "发出录用意向",
  ISSUE_OFFER_DOCUMENT: '签发录用意向文书',
  ACCEPT_OFFER: '接受录用意向',
  DECLINE_OFFER: '拒绝录用意向',
  WITHDRAW_OFFER: '撤销录用意向',
  CREATE_AGREEMENT: '创建就业协议',
  WITHDRAW: "撤回投递",
  CONFIRM_AGREEMENT: "确认就业协议",
  REJECT: "结束招聘流程",
};
async function confirmWithdraw() {
  if (!withdraw.value || !session.actor) return;
  try {
    await appRepository.execute(
      {
        type: "APPLICATION_ACTION",
        commandId: crypto.randomUUID(),
        entityId: withdraw.value.id,
        expectedRevision: withdraw.value.revision,
        payload: { action: "WITHDRAW", reason: reason.value },
      },
      session.actor,
      fixedClock,
    );
    withdraw.value = null;
    notice.value = "已撤回投递，历史事件和原始快照仍保留。";
  } catch {
    notice.value = "当前状态已变化或已有签约约束，撤回未完成，请重新核对。";
  }
}
const time = (text: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(text));
</script>
<template>
  <main id="main-content" class="business-page applications-page ui-scene ui-scene--journey">
    <WorkbenchHeader>
      <template #heading><div>
        <h1>每一步进展，都有迹可循。</h1>
        <p>
          查看面试与录用进展。投递时的简历快照保持不变。
        </p>
      </div></template>
      <template #actions><RouterLink class="inline-link" to="/student/jobs"
        >继续发现岗位<AppIcon name="arrow" :size="16"
      /></RouterLink></template>
    </WorkbenchHeader>
    <p v-if="notice" class="business-notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <AppSkeleton v-else-if="loading" />
    <div v-else-if="apps.length" class="applications-layout">
      <section class="application-list" aria-label="我的投递列表">
        <button
          v-for="a in apps"
          :key="a.id"
          :class="{ selected: a.id === selected?.id }"
          @click="selectedId = a.id"
        >
          <div class="application-identity"><EntityMark :id="jobs.find((j) => j.id === a.jobId)?.companyId ?? ''" :size="32" /><AppTag>{{ states[a.status] }}</AppTag></div>
          <h2>{{ jobs.find((j) => j.id === a.jobId)?.title ?? "历史岗位" }}</h2>
          <p>
            {{
              companyLabel(jobs.find((j) => j.id === a.jobId)?.companyId ?? "")
            }}
            · {{ time(a.createdAt) }}
          </p>
          <span class="caption"
            >投递时匹配 {{ a.matchSnapshot.total }}</span
          >
        </button>
      </section>
      <section v-if="selected" class="surface timeline-panel">
        <div class="section-heading">
          <h2>投递时间轴</h2>
          <AppTag>{{ states[selected.status] }}</AppTag>
        </div>
        <section v-if="interviews.length" class="interview-details" aria-label="面试安排">
          <h3>面试安排 <small>北京时间</small></h3>
          <article v-for="interview in interviews" :key="interview.id">
            <div><time>{{ time(interview.scheduledAt) }}</time><AppTag :tone="interview.status === 'scheduled' ? 'warn' : 'neutral'">{{ interview.status === 'scheduled' ? '待参加' : interview.status === 'completed' ? '已完成' : '已取消' }}</AppTag></div>
            <p>{{ interview.location }}</p>
            <p v-if="interview.status === 'scheduled' || interview.respondedAt">{{ responseLabels[interview.studentResponse ?? 'pending'] }}<span v-if="interview.responseReason"> · {{ interview.responseReason }}</span></p>
            <p v-if="interview.feedback" class="muted">{{ interview.feedback }}</p>
            <div v-if="interview.status === 'scheduled'" class="page-actions no-print">
              <AppButton v-if="interview.studentResponse !== 'accepted'" :disabled="responding" @click="prepareResponse('CONFIRM_INTERVIEW', '确认参加')">确认参加</AppButton>
              <AppButton variant="secondary" :disabled="responding" @click="prepareResponse('REQUEST_RESCHEDULE', '申请改期')">申请改期</AppButton>
              <AppButton variant="ghost" :disabled="responding" @click="prepareResponse('DECLINE_INTERVIEW', '拒绝邀约')">拒绝邀约</AppButton>
            </div>
          </article>
        </section>
        <OfferDocument v-if="currentOffer" :document="currentOffer" :recipient="selected.resumeSnapshot.basic.name" />
        <div v-if="canRespondToOffer" class="page-actions no-print">
          <AppButton :disabled="responding" @click="prepareResponse('ACCEPT_OFFER', '接受录用意向')">接受录用意向</AppButton>
          <AppButton variant="secondary" :disabled="responding" @click="prepareResponse('DECLINE_OFFER', '拒绝录用意向')">拒绝录用意向</AppButton>
        </div>
        <details v-if="previousOffers.length"><summary>历史意向文书（{{ previousOffers.length }}）</summary><OfferDocument v-for="document in previousOffers" :key="document.id" :document="document" :recipient="selected.resumeSnapshot.basic.name" :label="`历史录用意向文书版本${document.version}`" /></details>
        <p v-if="selected.status === 'offered' && !currentOffer" class="caption">历史教学意向：未签发独立条款文书。</p>
        <ol class="timeline">
          <li v-for="e in events" :key="e.id">
            <span class="timeline-point"></span>
            <div>
              <strong>{{ titles[e.event] ?? e.event }}</strong>
              <p>{{ states[e.from] ?? "开始" }} → {{ states[e.to] ?? e.to }}</p>
              <p v-if="e.reason">{{ e.reason }}</p>
              <time>{{ time(e.at) }}</time>
            </div>
          </li>
        </ol>
        <section class="snapshot">
          <h3>本次提供的简历快照</h3>
          <details :key="selected.id"><summary>查看已投递简历卡片</summary><ResumeCard :sections="selected.resumeSnapshot" :label="resumeLabel" :target-title="jobs.find(j=>j.id===selected!.jobId)?.title" /></details>
          <p>
            {{ selected.resumeSnapshot.basic.name }} ·
            {{
              selected.resumeSnapshot.projects.map((p) => p.name).join(" / ")
            }}
          </p>
          <p class="caption">
            版本编号 {{ selected.resumeVersionId }} · 当前页面仅显示本人投递
          </p>
        </section>
        <div class="page-actions no-print">
          <AppButton
            v-if="
              ['applied', 'screening', 'interview', 'offered'].includes(
                selected.status,
              )
            "
            variant="secondary"
            @click="
              withdraw = selected;
              reason = '';
            "
            >撤回投递</AppButton
          ><RouterLink
            v-if="['closed', 'offered'].includes(selected.status)"
            to="/student/destination"
            class="inline-link"
            >查看协议与去向<AppIcon name="chevron" :size="14"
          /></RouterLink>
        </div>
      </section>
    </div>
    <section v-else class="business-empty">
      <AppIcon name="timeline" :size="40" />
      <h2>你的求职时间轴，从一次了解开始</h2>
      <p>尚未投递任何岗位。先查看匹配依据，确认后再提供简历快照。</p>
      <RouterLink to="/student/jobs" class="inline-link"
        >发现岗位<AppIcon name="arrow" :size="16"
      /></RouterLink>
    </section>
    <AppModal data-scene="governance" :open="!!responseTarget" :title="responseTarget?.title ?? '响应邀约'" @close="!responding && (responseTarget = null)">
      <p v-if="responseTarget?.action === 'CONFIRM_INTERVIEW'">请核对时间和地点，确认参加本次面试。</p>
      <p v-else-if="responseTarget?.action === 'ACCEPT_OFFER'">请确认已阅读本版本的全部条款。接受意向后仍需双方分别确认就业协议。</p>
      <label v-else class="form-label">原因<textarea v-model="responseReason" maxlength="500" :disabled="responding" /></label>
      <template #footer><AppButton variant="secondary" :disabled="responding" @click="responseTarget = null">暂不提交</AppButton><AppButton :loading="responding" :disabled="!['CONFIRM_INTERVIEW','ACCEPT_OFFER'].includes(responseTarget?.action ?? '') && responseReason.trim().length < 2" @click="submitResponse">提交响应</AppButton></template>
    </AppModal>
    <AppModal data-scene="governance"
      :open="!!withdraw"
      title="确认撤回本次投递"
      @close="withdraw = null"
      ><label class="form-label"
        >撤回原因<textarea
          v-model="reason"
          maxlength="300"
          placeholder="至少填写两个字，便于保留决定依据"
        /></label
      ><template #footer
        ><AppButton variant="secondary" @click="withdraw = null"
          >暂不撤回</AppButton
        ><AppButton
          :disabled="reason.trim().length < 2"
          @click="confirmWithdraw"
          >确认撤回</AppButton
        ></template
      ></AppModal
    >
  </main>
</template>
<style scoped>
.interview-details { padding: 18px; background: var(--surface-2); margin-bottom: 24px; border-radius: var(--r-card); }
.interview-details h3 { font-size: 15px; margin-bottom: 12px; }
.interview-details small { font-size: 11px; font-weight: 400; color: var(--text-2); }
.interview-details article + article { border-top: 1px solid var(--border); margin-top: 14px; padding-top: 14px; }
.interview-details article > div { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.interview-details p { margin-top: 8px; font-size: 13px; overflow-wrap: anywhere; }
.application-identity { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.applications-layout {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 32px;
  align-items: start;
}
.application-list {
  display: grid;
  gap: 16px;
}
.application-list > button {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  padding: 24px;
  text-align: left;
  color: var(--text-1);
  display: grid;
  gap: 12px;
}
.application-list > button.selected {
  border-color: var(--brand-text);
  box-shadow: inset 3px 0 var(--brand-text);
}
.application-list h2 {
  font-size: 16px;
}
.application-list p {
  font-size: 12px;
  color: var(--text-2);
}
.application-list .tag {
  justify-self: start;
}
.timeline-panel {
  padding: 32px;
}
.timeline {
  list-style: none;
  padding: 8px 0;
  display: grid;
  gap: 0;
}
.timeline li {
  display: flex;
  gap: 24px;
  position: relative;
  min-height: 124px;
}
.timeline li:not(:last-child)::before {
  content: "";
  position: absolute;
  left: 6px;
  top: 16px;
  bottom: 0;
  width: 1px;
  background: var(--border);
}
.timeline-point {
  margin-top: 4px;
  width: 13px;
  height: 13px;
  flex: none;
  background: var(--brand-text);
  border: 3px solid var(--brand-soft);
  border-radius: 50%;
  z-index: 1;
}
.timeline strong {
  font-size: 16px;
}
.timeline p {
  font-size: 14px;
  color: var(--text-2);
  margin-top: 8px;
}
.timeline time {
  font: 12px var(--font-mono);
  color: var(--text-3);
  display: block;
  margin: 12px 0 24px;
}
.snapshot {
  padding: 24px;
  background: var(--surface-2);
  border-radius: var(--r-control);
  margin: 16px 0 24px;
}
.snapshot p {
  font-size: 14px;
  margin-top: 12px;
}
.snapshot .caption {
  font-size: 12px;
  overflow-wrap: anywhere;
}
@media (max-width: 1000px) {
  .applications-layout {
    grid-template-columns: 280px 1fr;
    gap: 24px;
  }
  .timeline-panel {
    padding: 24px;
  }
}
@media (max-width: 767px) {
  .applications-layout {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  .application-list {
    display: flex;
    overflow: auto;
    padding-bottom: 8px;
  }
  .application-list > button {
    flex: 0 0 260px;
  }
  .timeline-panel {
    padding: 20px;
  }
}
</style>
