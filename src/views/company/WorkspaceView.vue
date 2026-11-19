<script setup lang="ts">
import WorkbenchGuide from "../../components/presentation/WorkbenchGuide.vue";
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import { computed, reactive, ref, onBeforeUnmount, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useCompanyData } from "../../composables/useCompanyData";
import { appRepository } from "../../services/app-services";
import { useSessionStore } from "../../stores/session";
import { fixedClock } from "../../domain/clock";
import { isOnline } from "../../services/runtime";
import type { Application, Job } from "../../types/entities";
import type {
  ApplicationAction,
  LifecyclePayload,
} from "../../domain/lifecycle/transition";
import AppButton from "../../components/base/AppButton.vue";
import AppIcon from "../../components/base/AppIcon.vue";
import AppModal from "../../components/base/AppModal.vue";
import AppSkeleton from "../../components/base/AppSkeleton.vue";
import AppTag from "../../components/base/AppTag.vue";
import EntityMark from "../../components/base/EntityMark.vue";
import OfferDocument from '../../components/business/OfferDocument.vue';
import CompanyProfileEditor from '../../components/business/CompanyProfileEditor.vue';
import CertificateFiles from '../../components/business/CertificateFiles.vue';
import ResumeCard from '../../components/business/ResumeCard.vue';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const { data, catalog, loading, error, load, label, skillLabel } =
  useCompanyData();
const notice = ref("");
const resumeLabel=(id:string)=>catalog.value?.skills.find(s=>s.id===id)?.canonical??label(id);
const working = ref(false);
const jobOpen = ref(false);
const jobTarget = ref<Job | null>(null);
const scheduleOpen = ref(false);
const scheduleTarget = ref<Application | null>(null);
const scheduleAction = ref<ApplicationAction>("SCHEDULE_INTERVIEW");
const interviewResponses: Record<string, string> = { pending: "等待学生响应", accepted: "学生已确认", declined: "学生已拒绝", rescheduleRequested: "学生申请改期" };
function prepareSchedule(action: ApplicationAction) {
  if (!selected.value) return;
  scheduleTarget.value = structuredClone(selected.value);
  scheduleAction.value = action;
  if (openInterview.value) {
    const date = new Date(openInterview.value.scheduledAt);
    scheduleForm.scheduledAt = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    scheduleForm.location = openInterview.value.location;
  }
  scheduleOpen.value = true;
}
const resultOpen = ref(false);
const actionTarget = ref<Application | null>(null);
const cancelOpen = ref(false), cancelReason = ref('');
function prepareCandidateAction(action: 'result' | 'reject' | 'cancel') {
  if (!selected.value) return;
  actionTarget.value = structuredClone(selected.value);
  if (action === 'result') resultOpen.value = true;
  if (action === 'reject') { rejectionReason.value = ''; rejectionOpen.value = true; }
  if (action === 'cancel') { cancelReason.value = ''; cancelOpen.value = true; }
}
const rejectionOpen = ref(false);
const offerOpen = ref(false), offerWithdrawOpen = ref(false), offerReason = ref('');
const offerTarget = ref<Application | null>(null);
const offerForm = reactive({ location: '', compensation: '', startDate: '', responseDeadline: '', note: '' });
function prepareOffer(withdraw = false) {
  if (!selected.value) return;
  offerTarget.value = structuredClone(selected.value);
  if (withdraw) { offerReason.value = ''; offerWithdrawOpen.value = true; }
  else { Object.assign(offerForm, { location: '', compensation: '', startDate: '', responseDeadline: '', note: '' }); offerOpen.value = true; }
}
const currentOffer = computed(() => selected.value?.offerDocuments?.at(-1));
const previousOffers = computed(() => selected.value?.offerDocuments?.slice(0,-1) ?? []);
const offerCurrentTime = ref(Date.now());
let offerTimer: number | undefined;
onMounted(() => { offerTimer = window.setInterval(() => { offerCurrentTime.value = Date.now(); }, 1000); });
onBeforeUnmount(() => { window.clearInterval(offerTimer); });
const selectedId = ref(
  typeof route.query.application === "string" ? route.query.application : "",
);
const section = computed(() => {
  const value = route.params.section;
  return typeof value === "string" &&
    ["jobs", "candidates", "agreements"].includes(value)
    ? value
    : "overview";
});
const jobs = computed(() => data.value?.jobs ?? []);
const candidateQuery = ref(""), candidateStage = ref(""), candidateSort = ref("recent");
const filteredApplications = computed(() => [...(data.value?.applications ?? [])].filter((a) =>
  (!candidateStage.value || a.status === candidateStage.value) &&
  `${a.resumeSnapshot.basic.name} ${jobs.value.find((j) => j.id === a.jobId)?.title ?? ''}`.toLowerCase().includes(candidateQuery.value.trim().toLowerCase()),
).sort((a, b) => candidateSort.value === "match" ? b.matchSnapshot.total - a.matchSnapshot.total || a.id.localeCompare(b.id) : b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)));
const applications = computed(() =>
  [...(data.value?.applications ?? [])].sort((a, b) =>
    a.id.localeCompare(b.id),
  ),
);
const selected = computed(
  () =>
    filteredApplications.value.find(
      (application) => application.id === selectedId.value,
    ) ??
    filteredApplications.value[0] ??
    null,
);
const selectedJob = computed(() =>
  jobs.value.find((job) => job.id === selected.value?.jobId),
);
const selectedInterviews = computed(() =>
  (data.value?.interviews ?? []).filter(
    (interview) => interview.applicationId === selected.value?.id,
  ),
);
const openInterview = computed(() =>
  selectedInterviews.value.find(
    (interview) => interview.status === "scheduled",
  ),
);
const passedInterview = computed(() =>
  selectedInterviews.value.some(
    (interview) =>
      interview.status === "completed" && interview.result === "pass",
  ),
);
const selectedAgreement = computed(() =>
  (data.value?.agreements ?? []).find(
    (agreement) =>
      agreement.applicationId === selected.value?.id &&
      agreement.status !== "terminated",
  ),
);
const counts = computed(() => ({
  published: jobs.value.filter((job) => job.status === "published").length,
  active: applications.value.filter((application) =>
    ["applied", "screening", "interview", "offered"].includes(
      application.status,
    ),
  ).length,
  interview: applications.value.filter(
    (application) => application.status === "interview",
  ).length,
  agreement: (data.value?.agreements ?? []).filter(
    (agreement) => agreement.status === "signed",
  ).length,
}));

const statusLabels: Record<Application["status"], string> = {
  applied: "待筛选",
  screening: "筛选中",
  interview: "面试阶段",
  offered: "录用意向",
  rejected: "未通过",
  withdrawn: "学生已撤回",
  closed: "已结束",
};
const statusTone = (status: Application["status"]) =>
  status === "closed"
    ? "success"
    : status === "rejected" || status === "withdrawn"
      ? "danger"
      : status === "offered"
        ? "warn"
        : "brand";

const jobForm = reactive({
  title: "",
  cityId: "city-1",
  industryId: "industry-1",
  skillId: "skill-1",
  salaryMin: 8000,
  salaryMax: 12000,
  jdText: "",
  deadline: isOnline ? localFuture(30) : "2026-12-20T16:00",
});
const scheduleForm = reactive({
  scheduledAt: isOnline ? localFuture(3) : "2026-12-20T14:00",
  location: isOnline ? "" : "教学在线会议室",
});
function localFuture(days: number) { return new Date(Date.now() + days * 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
const resultForm = reactive({
  result: "pass" as "pass" | "fail",
  feedback: "",
});
const rejectionReason = ref("");

function editJob(job: Job | null = null) {
  jobTarget.value = job ? structuredClone(job) : null;
  Object.assign(jobForm, job ? {
    title: job.title, cityId: job.cityId, industryId: job.industryId, skillId: job.requiredSkills[0]?.skillId ?? 'skill-1',
    salaryMin: job.salaryRange?.min ?? 0, salaryMax: job.salaryRange?.max ?? 0, jdText: job.jdText,
    deadline: new Date(Date.parse(job.deadline) - new Date(job.deadline).getTimezoneOffset() * 60000).toISOString().slice(0,16),
  } : { title: '', cityId: 'city-1', industryId: 'industry-1', skillId: 'skill-1', salaryMin: 8000, salaryMax: 12000, jdText: '', deadline: isOnline ? localFuture(30) : '2026-12-20T16:00' });
  jobOpen.value = true;
}

function selectApplication(application: Application) {
  selectedId.value = application.id;
  void router.replace({ query: { application: application.id } });
}

async function publishJob() {
  if (!session.actor) return;
  working.value = true;
  notice.value = "";
  const target = jobTarget.value, entityId = target?.id ?? crypto.randomUUID();
  try {
    const saved = await appRepository.execute(
      {
        type: "SAVE_JOB",
        commandId: crypto.randomUUID(),
        entityId,
        expectedRevision: target?.revision ?? 0,
        payload: {
          title: jobForm.title,
          categoryId: target?.categoryId ?? "jobCategory-digital",
          industryId: jobForm.industryId,
          cityId: jobForm.cityId,
          salaryRange: jobForm.salaryMin && jobForm.salaryMax ? { min: jobForm.salaryMin, max: jobForm.salaryMax } : null,
          requiredSkills: target ? target.requiredSkills.map((s,i) => i === 0 ? { ...s, skillId: jobForm.skillId } : { ...s }) : [{ skillId: jobForm.skillId, weight: 1 }],
          preferredMajorIds: target?.preferredMajorIds ?? [],
          minDegree: target ? target.minDegree : "bachelor",
          minExperienceMonths: target?.minExperienceMonths ?? 0,
          jdText: jobForm.jdText,
          deadline: new Date(jobForm.deadline).toISOString(),
        },
      },
      session.actor,
      fixedClock,
    );
    await appRepository.execute(
      {
        type: "JOB_ACTION",
        commandId: crypto.randomUUID(),
        entityId,
        expectedRevision: (saved as { revision: number }).revision,
        payload: { action: "PUBLISH" },
      },
      session.actor,
      fixedClock,
    );
    await load();
    jobOpen.value = false;
    notice.value = isOnline ? "岗位已提交审核，通过后学生端可见。" : "岗位已发布，学生端现在可以检索并查看匹配依据。";
    Object.assign(jobForm, { title: "", jdText: "" });
  } catch {
    notice.value = "岗位未能发布；若草稿已保存，可刷新后继续核对字段。";
  } finally {
    working.value = false;
  }
}

async function runApplication(
  action: ApplicationAction,
  payload: LifecyclePayload = {},
  target: Application | null = selected.value,
) {
  if (!session.actor || !target || working.value) return;
  working.value = true;
  notice.value = "";
  try {
    await appRepository.execute(
      {
        type: "APPLICATION_ACTION",
        commandId: crypto.randomUUID(),
        entityId: target.id,
        expectedRevision: target.revision,
        payload: { action, ...payload },
      },
      session.actor,
      fixedClock,
    );
    await load();
    notice.value =
      action === "SCHEDULE_INTERVIEW"
        ? "面试已安排，候选人的流程时间线已同步更新。"
        : action === "COMPLETE_INTERVIEW"
          ? "面试结果已保存，后续动作将依据本次结果开放。"
          : action === "ISSUE_OFFER"
            ? "录用意向已发出。"
            : action === "CREATE_AGREEMENT"
              ? "就业协议已创建，等待双方分别确认。"
              : action === "CONFIRM_AGREEMENT"
                ? "企业已确认协议，等待学生确认。"
                : "招聘流程已更新。";
    scheduleOpen.value = false;
    resultOpen.value = false;
    rejectionOpen.value = false;
    cancelOpen.value = false;
    offerOpen.value = false;
    offerWithdrawOpen.value = false;
  } catch {
    notice.value =
      "流程状态已变化或前置条件不足，本次操作未写入，请刷新后核对。";
  } finally {
    working.value = false;
  }
}

async function closeJob(job: Job) {
  if (!session.actor) return;
  try {
    await appRepository.execute(
      {
        type: "JOB_ACTION",
        commandId: crypto.randomUUID(),
        entityId: job.id,
        expectedRevision: job.revision,
        payload: { action: job.status === "published" ? "CLOSE" : "PUBLISH" },
      },
      session.actor,
      fixedClock,
    );
    await load();
    notice.value =
      job.status === "published" ? "岗位已关闭。" : isOnline ? "岗位已提交审核。" : "岗位已重新发布。";
  } catch {
    notice.value = "岗位状态未更新，请检查截止时间与当前版本。";
  }
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
</script>

<template>
  <main id="main-content" class="business-page company-page ui-scene ui-scene--pipeline" :class="`feature-company--${section}`">
    <WorkbenchHeader>
      <template #heading="{ design }"><div>
        <p class="company-identity"><EntityMark :id="data?.company.id ?? ''" :name="data?.company.name" :size="36" />{{ data?.company.name ?? "企业招聘工作台" }}</p>
        <h1>{{ section === 'overview' ? '让每一次招聘推进，都有清晰依据。' : section === 'jobs' ? '把岗位写清楚，让机会被看见。' : section === 'candidates' ? '每一位候选人，都值得认真回应。' : '让每一份约定，都清楚可追溯。' }}</h1>
        <p>{{ design.desc }}</p>
      </div></template>
      <template #actions><AppButton v-if="section === 'overview'" @click="editJob()"
        ><AppIcon name="plus" :size="17" />发布新岗位</AppButton
      >
      <div v-if="section === 'overview'" class="hero-metrics" aria-label="招聘概览">
        <span
          ><strong>{{ counts.published }}</strong
          >开放岗位</span
        >
        <span
          ><strong>{{ counts.active }}</strong
          >进行中候选</span
        >
        <span
          ><strong>{{ counts.interview }}</strong
          >面试阶段</span
        >
        <span
          ><strong>{{ counts.agreement }}</strong
          >已签协议</span
        >
      </div></template>
    </WorkbenchHeader>

    <nav class="workspace-tabs" aria-label="招聘工作台视图">
      <RouterLink to="/company">招聘概览</RouterLink>
      <RouterLink to="/company/jobs">岗位管理</RouterLink>
      <RouterLink to="/company/candidates">候选人流程</RouterLink>
      <RouterLink to="/company/agreements">就业协议</RouterLink>
    </nav>
    <p v-if="notice" class="business-notice" role="status">{{ notice }}</p>
    <p v-if="error" class="business-notice business-error" role="alert">
      {{ error }}
    </p>
    <AppSkeleton v-else-if="loading" />
    <template v-else>
    <CompanyProfileEditor v-if="data&&catalog&&(section==='overview'||section==='jobs')" :company="data.company" :dictionaries="catalog.dictionaries" @saved="load" />

    <section v-if="section === 'overview'" class="overview-grid">
      <article class="pipeline-board">
        <div class="section-heading">
          <h2>当前招聘管线</h2>
          <span class="caption">只显示已获简历授权的候选人</span>
        </div>
        <div class="pipeline-columns">
          <div
            v-for="state in ['applied', 'screening', 'interview', 'offered']"
            :key="state"
          >
            <span>{{ statusLabels[state as Application["status"]] }}</span>
            <strong>{{
              applications.filter((item) => item.status === state).length
            }}</strong>
            <i></i>
          </div>
        </div>
        <RouterLink class="inline-link" to="/company/candidates"
          >进入候选人流程<AppIcon name="arrow" :size="16"
        /></RouterLink>
      </article>
      <aside class="today-rail">
        <img class="company-overview-art" src="/media/workbench/company-03.webp" alt="" width="384" height="341" loading="lazy" />
        <p class="eyebrow">接下来</p>
        <h2>把等待处理的动作，落到人。</h2>
        <ul>
          <li>
            <strong>{{
              applications.filter((item) => item.status === "applied").length
            }}</strong
            ><span>份新投递等待查看</span>
          </li>
          <li>
            <strong>{{
              data?.interviews.filter((item) => item.status === "scheduled")
                .length ?? 0
            }}</strong
            ><span>场面试等待完成</span>
          </li>
          <li>
            <strong>{{
              data?.agreements.filter((item) => item.status === "draft")
                .length ?? 0
            }}</strong
            ><span>份协议等待双方确认</span>
          </li>
        </ul>
      </aside>
    </section>

    <section v-else-if="section === 'jobs'" class="jobs-workspace">
      <div class="section-heading">
        <div>
          <h2>岗位管理</h2>
          <p class="muted">
            手工维护岗位事实，发布前校验城市、职责、技能与截止时间。
          </p>
        </div>
        <AppButton @click="editJob()"
          ><AppIcon name="plus" :size="16" />发布新岗位</AppButton
        >
      </div>
      <div class="job-table" role="table" aria-label="企业岗位">
        <div class="table-head" role="row">
          <span>岗位</span><span>地点与技能</span><span>截止时间</span
          ><span>状态与动作</span>
        </div>
        <article v-for="job in jobs" :key="job.id" role="row">
          <div>
            <strong>{{ job.title }}</strong
            ><small>{{ job.id.slice(0, 12) }}</small>
          </div>
          <div>
            <span>{{ label(job.cityId) }}</span
            ><small>{{
              job.requiredSkills
                .map((skill) => skillLabel(skill.skillId))
                .join(" / ")
            }}</small>
          </div>
          <time>{{ formatDate(job.deadline) }}</time>
          <div class="row-action">
            <AppTag
              :tone="job.status === 'published' ? 'success' : 'neutral'"
              >{{
                job.status === "published"
                  ? "招聘中"
                  : job.reviewStatus === 'pending' ? '待审核' : job.reviewStatus === 'rejected' ? '已退回' : job.status === "draft"
                    ? "草稿"
                    : "已关闭"
              }}</AppTag
            ><AppButton v-if="job.reviewStatus !== 'pending'" size="sm" variant="ghost" @click="closeJob(job)">{{
              job.status === "published" ? "关闭" : isOnline ? "提交审核" : "重新发布"
            }}</AppButton><AppButton v-if="job.status !== 'published' && job.reviewStatus !== 'pending'" size="sm" variant="ghost" @click="editJob(job)">编辑岗位</AppButton><p v-if="job.reviewReason" class="caption">{{ job.reviewReason }}</p>
          </div>
        </article>
      </div>
    </section>

    <section v-else-if="section === 'candidates'" class="workbench-split workbench-body-layout">
      <div class="candidate-workspace workbench-body-main">
      <aside class="candidate-list" aria-label="候选人列表">
        <div class="list-title">
          <h2>候选人</h2>
          <span>{{ applications.length }} 份授权投递</span>
        </div>
        <div class="candidate-filters">
          <input v-model="candidateQuery" aria-label="搜索候选人" placeholder="姓名或岗位" />
          <select v-model="candidateStage" aria-label="候选人阶段"><option value="">全部阶段</option><option v-for="(title, key) in statusLabels" :key="key" :value="key">{{ title }}</option></select>
          <select v-model="candidateSort" aria-label="候选人排序"><option value="recent">最近投递</option><option value="match">匹配度优先</option></select>
        </div>
        <button
          v-for="application in filteredApplications"
          :key="application.id"
          :class="{ selected: application.id === selected?.id }"
          :aria-label="`查看 ${application.resumeSnapshot.basic.name} 的投递，申请 ${application.id.slice(-3)}`"
          @click="selectApplication(application)"
        >
          <span class="candidate-avatar">{{
            application.resumeSnapshot.basic.name.slice(0, 1)
          }}</span>
          <span
            ><strong>{{ application.resumeSnapshot.basic.name }}</strong
            ><small
              >申请 {{ application.id.slice(-3) }} ·
              {{
                jobs.find((job) => job.id === application.jobId)?.title
              }}</small
            ></span
          >
          <AppTag :tone="statusTone(application.status)">{{
            statusLabels[application.status]
          }}</AppTag>
        </button>
      </aside>
      <article v-if="selected" class="candidate-detail">
        <header>
          <div>
            <p class="eyebrow">申请 {{ selected.id.slice(-3) }}</p>
            <h2>{{ selected.resumeSnapshot.basic.name }}</h2>
            <p>
              {{ selectedJob?.title }} · 投递时匹配
              {{ selected.matchSnapshot.total }}
            </p>
          </div>
          <AppTag :tone="statusTone(selected.status)">{{
            statusLabels[selected.status]
          }}</AppTag>
        </header>
        <div class="candidate-facts">
          <span
            ><small>简历版本</small
            ><strong>{{ selected.resumeVersionId.slice(-8) }}</strong></span
          >
          <span
            ><small>项目经历</small
            ><strong
              >{{ selected.resumeSnapshot.projects.length }} 项</strong
            ></span
          >
          <span><small>授权范围</small><strong>本次岗位快照</strong></span>
        </div>
        <details :key="selected.id" class="full-resume"><summary>查看完整简历卡片</summary><p class="caption">投递时固定的版本 {{ selected.resumeVersionId }}。学生后续编辑不会覆盖；联系邮箱按原授权规则脱敏。</p><ResumeCard :sections="selected.resumeSnapshot" :label="resumeLabel" :target-title="selectedJob?.title" /></details>
        <section class="resume-evidence">
          <h3>候选依据</h3>
          <p
            v-for="project in selected.resumeSnapshot.projects"
            :key="project.id"
          >
            <strong>{{ project.name }} · {{ project.role }}</strong
            ><span>{{ project.description }}</span>
          </p>
        </section>
        <section v-if="selectedInterviews.length" class="process-record">
          <h3>面试记录</h3>
          <p v-for="interview in selectedInterviews" :key="interview.id">
            <AppIcon name="calendar" :size="17" /><span
              ><strong>{{
                interview.status === "scheduled"
                  ? "待进行"
                  : interview.status === "cancelled" ? "已取消"
                  : interview.result === "pass"
                    ? "已通过"
                    : "未通过"
              }}</strong
              >{{ formatDate(interview.scheduledAt) }} · {{ interview.location
              }}<small v-if="interview.feedback">{{
                interview.feedback
              }}</small><small v-if="interview.status === 'scheduled' || interview.respondedAt">{{ interviewResponses[interview.studentResponse ?? 'pending'] }}</small><small v-if="interview.responseReason">{{ interview.responseReason }}</small></span
            >
          </p>
        </section>
        <section v-if="selectedAgreement" class="agreement-strip">
          <AppIcon name="agreement" :size="22" />
          <div>
            <strong>就业协议</strong>
            <p v-if="selectedAgreement.status === 'signed'">
              双方已确认，协议已签署
            </p>
            <p
              v-else-if="
                selectedAgreement.companyConfirmedAt &&
                !selectedAgreement.studentConfirmedAt
              "
            >
              等待学生确认
            </p>
            <p v-else>等待双方确认</p>
          </div>
          <AppTag
            :tone="selectedAgreement.status === 'signed' ? 'success' : 'warn'"
            >{{
              selectedAgreement.status === "signed" ? "已签署" : "确认中"
            }}</AppTag
          >
        </section>
        <section v-if="selected.resumeSnapshot.certificates.length" class="snapshot-certificates" aria-label="投递快照证书"><h3>本次投递的证书</h3><article v-for="certificate in selected.resumeSnapshot.certificates" :key="certificate.id"><strong>{{ certificate.name }}</strong><p>{{ certificate.issuer }} · {{ certificate.awardedAt }}</p><p>{{ certificate.description }}</p><CertificateFiles :ids="certificate.attachmentIds??[]" /></article><p class="caption">仅可读取本企业收到的投递快照中引用的文件，不能查看该学生的其他附件。</p></section>
        <OfferDocument v-if="currentOffer" :document="currentOffer" :recipient="selected.resumeSnapshot.basic.name" />
        <details v-if="previousOffers.length"><summary>历史意向文书（{{ previousOffers.length }}）</summary><OfferDocument v-for="document in previousOffers" :key="document.id" :document="document" :recipient="selected.resumeSnapshot.basic.name" :label="`历史录用意向文书版本${document.version}`" /></details>
        <p v-if="selected.status === 'offered' && !currentOffer" class="caption">历史教学意向：未签发独立条款文书。</p>
        <footer class="candidate-actions">
          <AppButton
            v-if="selected.status === 'applied'"
            variant="secondary"
            :loading="working"
            @click="runApplication('START_SCREEN')"
            >开始筛选</AppButton
          >
          <AppButton
            v-if="
              ['applied', 'screening'].includes(selected.status) &&
              !openInterview
            "
            :loading="working"
            @click="prepareSchedule('SCHEDULE_INTERVIEW')"
            >安排面试</AppButton
          >
          <AppButton v-if="openInterview" variant="secondary" :loading="working" @click="prepareSchedule('RESCHEDULE')">调整面试</AppButton>
          <AppButton v-if="openInterview" variant="ghost" :disabled="working" @click="prepareCandidateAction('cancel')">取消邀约</AppButton>
          <AppButton
            v-if="openInterview"
            :loading="working"
            @click="prepareCandidateAction('result')"
            >完成面试</AppButton
          >
          <AppButton
            v-if="
              ['interview','offered'].includes(selected.status) &&
              passedInterview &&
              !openInterview && !selectedAgreement && (!currentOffer || currentOffer.status === 'withdrawn')
            "
            :loading="working"
            @click="isOnline ? prepareOffer() : runApplication('ISSUE_OFFER')"
            >发出录用意向</AppButton
          >
          <AppButton
            v-if="selected.status === 'offered' && !selectedAgreement && (!currentOffer || (currentOffer.status === 'accepted' && Date.parse(currentOffer.responseDeadline) > offerCurrentTime))"
            :loading="working"
            @click="runApplication('CREATE_AGREEMENT')"
            >创建就业协议</AppButton
          >
          <AppButton v-if="currentOffer && ['pending','accepted'].includes(currentOffer.status) && !selectedAgreement && selected.status === 'offered'" variant="ghost" :disabled="working" @click="prepareOffer(true)">撤销录用意向</AppButton>
          <AppButton
            v-if="
              selectedAgreement?.status === 'draft' &&
              !selectedAgreement.companyConfirmedAt
            "
            :loading="working"
            @click="runApplication('CONFIRM_AGREEMENT')"
            >企业确认协议</AppButton
          >
          <AppButton
            v-if="
              ['applied', 'screening', 'interview'].includes(selected.status)
            "
            variant="ghost"
            @click="prepareCandidateAction('reject')"
            >结束候选流程</AppButton
          >
        </footer>
      </article>
      </div>
      <WorkbenchGuide title="状态清楚，回应及时。" copy="先从候选人队列选择一份授权投递，再核对固定简历快照与面试记录。各阶段仅显示当前允许的业务操作。" />
    </section>

    <section v-else class="agreement-workspace">
      <div class="section-heading">
        <div>
          <h2>就业协议</h2>
          <p class="muted">双边分别确认；任何一方确认都不会替代另一方决定。</p>
        </div>
      </div>
      <article
        v-for="agreement in data?.agreements"
        :key="agreement.id"
        class="agreement-row"
      >
        <AppIcon name="agreement" :size="24" />
        <div>
          <strong>{{
            applications.find((item) => item.id === agreement.applicationId)
              ?.resumeSnapshot.basic.name ?? "候选人"
          }}</strong
          ><span>{{
            jobs.find(
              (job) =>
                job.id ===
                applications.find((item) => item.id === agreement.applicationId)
                  ?.jobId,
            )?.title
          }}</span>
        </div>
        <div class="confirmation-pair">
          <span :class="{ done: agreement.companyConfirmedAt }">企业确认</span
          ><i></i
          ><span :class="{ done: agreement.studentConfirmedAt }">学生确认</span>
        </div>
        <AppTag
          :tone="
            agreement.status === 'signed'
              ? 'success'
              : agreement.status === 'terminated'
                ? 'danger'
                : 'warn'
          "
          >{{
            agreement.status === "signed"
              ? "已签署"
              : agreement.status === "terminated"
                ? "已终止"
                : "确认中"
          }}</AppTag
        >
      </article>
    </section>

    </template>
    <AppModal data-scene="governance" :open="offerOpen" title="签发录用意向文书" @close="!working && (offerOpen = false)">
      <div class="form-stack">
        <p>收件人：{{ offerTarget?.resumeSnapshot.basic.name }}</p>
        <label class="form-label">工作地点<input v-model="offerForm.location" maxlength="200" :disabled="working" /></label>
        <label class="form-label">薪酬说明<textarea v-model="offerForm.compensation" maxlength="1000" :disabled="working" /></label>
        <label class="form-label">预计到岗日期<input v-model="offerForm.startDate" type="date" :disabled="working" /></label>
        <label class="form-label">响应截止时间<input v-model="offerForm.responseDeadline" type="datetime-local" :disabled="working" /></label>
        <label class="form-label">补充条款<textarea v-model="offerForm.note" maxlength="2000" :disabled="working" /></label>
        <p class="caption">签发后条款不可修改；更正需撤销后重新签发。本地时间以设备时区为准。</p>
      </div>
      <template #footer><AppButton variant="secondary" :disabled="working" @click="offerOpen = false">取消</AppButton><AppButton :loading="working" :disabled="offerForm.location.trim().length < 2 || offerForm.compensation.trim().length < 4 || !offerForm.startDate || !Number.isFinite(Date.parse(offerForm.responseDeadline))" @click="runApplication('ISSUE_OFFER_DOCUMENT', { offer: { ...offerForm, responseDeadline: new Date(offerForm.responseDeadline).toISOString() } }, offerTarget)">签发文书</AppButton></template>
    </AppModal>
    <AppModal data-scene="governance" :open="offerWithdrawOpen" title="撤销录用意向" @close="!working && (offerWithdrawOpen = false)">
      <label class="form-label">撤销原因<textarea v-model="offerReason" maxlength="500" :disabled="working" /></label>
      <template #footer><AppButton variant="secondary" :disabled="working" @click="offerWithdrawOpen = false">暂不撤销</AppButton><AppButton :loading="working" :disabled="offerReason.trim().length < 4" @click="runApplication('WITHDRAW_OFFER', { reason: offerReason }, offerTarget)">确认撤销</AppButton></template>
    </AppModal>
    <AppModal data-scene="governance" :open="jobOpen" :title="jobTarget ? '编辑岗位' : '发布新岗位'" @close="!working && (jobOpen = false)">
      <form class="form-stack" @submit.prevent="publishJob">
        <label class="form-label"
          >岗位名称<input v-model="jobForm.title" required maxlength="80"
        /></label>
        <div class="field-grid">
          <label class="form-label"
            >工作城市<select v-model="jobForm.cityId">
              <option
                v-for="row in catalog?.dictionaries.filter(
                  (item) => item.kind === 'city',
                )"
                :key="row.id"
                :value="row.id"
              >
                {{ row.label }}
              </option>
            </select></label
          ><label class="form-label"
            >所属行业<select v-model="jobForm.industryId">
              <option
                v-for="row in catalog?.dictionaries.filter(
                  (item) => item.kind === 'industry',
                )"
                :key="row.id"
                :value="row.id"
              >
                {{ row.label }}
              </option>
            </select></label
          >
        </div>
        <label class="form-label"
          >核心技能<select v-model="jobForm.skillId">
            <option
              v-for="skill in catalog?.skills"
              :key="skill.id"
              :value="skill.id"
            >
              {{ skill.canonical }}
            </option>
          </select></label
        >
        <div class="field-grid">
          <label class="form-label"
            >最低月薪<input
              v-model.number="jobForm.salaryMin"
              type="number"
              min="1" /></label
          ><label class="form-label"
            >最高月薪<input
              v-model.number="jobForm.salaryMax"
              type="number"
              min="1"
          /></label>
        </div>
        <label class="form-label"
          >岗位职责<textarea
            v-model="jobForm.jdText"
            required
            minlength="10"
            maxlength="4000"
          ></textarea>
        </label>
        <label class="form-label"
          >投递截止时间<input
            v-model="jobForm.deadline"
            type="datetime-local"
            required
        /></label>
      </form>
      <template #footer
        ><AppButton variant="secondary" @click="jobOpen = false">取消</AppButton
        ><AppButton
          :loading="working"
          :disabled="
            jobForm.title.trim().length < 2 ||
            jobForm.jdText.trim().length < 10 ||
            jobForm.salaryMax < jobForm.salaryMin
          "
          @click="publishJob"
          >{{ isOnline ? '保存并提审' : '保存并发布' }}</AppButton
        ></template
      >
    </AppModal>
    <AppModal data-scene="governance"
      :open="scheduleOpen"
      :title="scheduleAction === 'RESCHEDULE' ? '调整候选人面试' : '安排候选人面试'"
      @close="!working && (scheduleOpen = false)"
    >
      <div class="form-stack">
        <label class="form-label"
          >面试时间<input
            v-model="scheduleForm.scheduledAt"
            type="datetime-local" /></label
        ><label class="form-label"
          >面试地点<input v-model="scheduleForm.location" maxlength="100"
        /></label>
      </div>
      <template #footer
        ><AppButton variant="secondary" @click="scheduleOpen = false"
          >取消</AppButton
        ><AppButton
          :loading="working"
          :disabled="!scheduleForm.scheduledAt || !scheduleForm.location.trim()"
          @click="
            runApplication(scheduleAction, {
              scheduledAt: new Date(scheduleForm.scheduledAt).toISOString(),
              location: scheduleForm.location,
            }, scheduleTarget)
          "
          >确认安排</AppButton
        ></template
      >
    </AppModal>
    <AppModal data-scene="governance"
      :open="resultOpen"
      title="记录面试结果"
      @close="resultOpen = false"
    >
      <div class="form-stack">
        <label class="form-label"
          >面试结论<select v-model="resultForm.result">
            <option value="pass">通过，进入录用评估</option>
            <option value="fail">未通过，结束流程</option>
          </select></label
        ><label class="form-label"
          >面试反馈<textarea
            v-model="resultForm.feedback"
            maxlength="1000"
          ></textarea>
        </label>
      </div>
      <template #footer
        ><AppButton variant="secondary" @click="resultOpen = false"
          >取消</AppButton
        ><AppButton
          :loading="working"
          :disabled="!resultForm.feedback.trim()"
          @click="runApplication('COMPLETE_INTERVIEW', resultForm, actionTarget)"
          >保存结果</AppButton
        ></template
      >
    </AppModal>
    <AppModal data-scene="governance"
      :open="rejectionOpen"
      title="结束候选流程"
      @close="rejectionOpen = false"
    >
      <label class="form-label"
        >结束原因<textarea v-model="rejectionReason" maxlength="300"></textarea>
      </label>
      <template #footer
        ><AppButton variant="secondary" @click="rejectionOpen = false"
          >取消</AppButton
        ><AppButton
          variant="danger"
          :disabled="rejectionReason.trim().length < 2"
          @click="runApplication('REJECT', { reason: rejectionReason }, actionTarget)"
          >确认结束</AppButton
        ></template
      >
    </AppModal>
    <AppModal data-scene="governance" :open="cancelOpen" title="取消本次面试" @close="!working && (cancelOpen = false)">
      <label class="form-label">取消原因<textarea v-model="cancelReason" maxlength="500"></textarea></label>
      <template #footer><AppButton variant="secondary" :disabled="working" @click="cancelOpen = false">返回</AppButton><AppButton variant="danger" :loading="working" :disabled="cancelReason.trim().length < 2" @click="runApplication('CANCEL_INTERVIEW', { reason: cancelReason }, actionTarget)">确认取消</AppButton></template>
    </AppModal>
  </main>
</template>

<style scoped>
.company-identity { display: flex; align-items: center; gap: 12px; font-size: 14px; color: var(--text-2); margin-bottom: 18px; }
.company-hero.compact { padding: 0 0 24px; background: none; color: var(--text-1); border-bottom: 1px solid var(--border); border-radius: 0; }
.company-hero.compact p { color: var(--text-2); }
.company-hero.compact::after { display: none; }
.company-hero.compact h1 { font-size: 28px; }
.candidate-filters { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 0 16px 16px; }
.candidate-filters input, .candidate-filters select { width: 100%; min-width: 0; font: 13px var(--font-sans); padding: 10px; border: 1px solid var(--border-control); border-radius: 7px; background: var(--surface); color: var(--text-1); }
.candidate-filters input { grid-column: 1 / -1; }
.company-page {
  max-width: 1540px;
}
.company-hero {
  position: relative;
  overflow: hidden;
  background: var(--navy);
  color: var(--on-navy);
  padding: 36px 40px 28px;
  border-radius: var(--r-card);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
}
.company-hero::after {
  content: "";
  position: absolute;
  right: -40px;
  bottom: -80px;
  width: 360px;
  height: 180px;
  border: 1px solid rgba(167, 180, 204, 0.22);
  border-radius: 50%;
  transform: rotate(-10deg);
}
.company-hero > div:first-child,
.company-hero > .app-button {
  position: relative;
  z-index: 1;
}
.company-hero h1 {
  font-size: 30px;
  line-height: 1.4;
  margin: 8px 0 12px;
}
.company-hero p {
  max-width: 760px;
  color: var(--on-navy-muted);
  font-size: 14px;
}
.eyebrow {
  font: 12px var(--font-mono);
  color: var(--brand-text);
  text-transform: uppercase;
}
.company-hero .eyebrow {
  color: var(--amber);
}
.hero-metrics {
  grid-column: 1/-1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid rgba(167, 180, 204, 0.2);
  padding-top: 22px;
  position: relative;
  z-index: 1;
}
.hero-metrics span {
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: var(--on-navy-muted);
  font-size: 12px;
}
.hero-metrics strong {
  font: 24px var(--font-mono);
  color: var(--on-navy);
}
.workspace-tabs {
  display: flex;
  gap: 28px;
  border-bottom: 1px solid var(--border);
  margin: 26px 0 30px;
  padding: 0 4px;
}
.workspace-tabs a {
  padding: 0 0 14px;
  color: var(--text-2);
  font-size: 14px;
  border-bottom: 2px solid transparent;
}
.workspace-tabs a.router-link-exact-active {
  color: var(--brand-text);
  border-color: var(--brand-text);
  font-weight: 600;
}
.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(280px, 0.75fr);
  gap: 24px;
}
.pipeline-board {
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 28px;
}
.pipeline-columns {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--border);
  margin: 20px 0 28px;
}
.pipeline-columns div {
  background: var(--surface);
  padding: 24px 20px;
  display: grid;
  gap: 12px;
}
.pipeline-columns span {
  font-size: 13px;
  color: var(--text-2);
}
.pipeline-columns strong {
  font: 32px var(--font-mono);
}
.pipeline-columns i {
  width: 32px;
  height: 3px;
  background: var(--brand);
  border-radius: 3px;
}
.today-rail {
  background: var(--surface-2);
  padding: 28px;
}
.today-rail h2 {
  font-size: 22px;
  line-height: 1.55;
  margin: 12px 0 22px;
}
.today-rail ul {
  list-style: none;
  display: grid;
  gap: 0;
}
.today-rail li {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 0;
  border-top: 1px solid var(--border);
}
.today-rail li strong {
  font: 22px var(--font-mono);
  color: var(--brand-text);
}
.today-rail li span {
  font-size: 13px;
  color: var(--text-2);
}
.jobs-workspace,
.agreement-workspace {
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 28px;
}
.section-heading p {
  font-size: 13px;
  margin-top: 8px;
}
.job-table {
  display: grid;
}
.table-head,
.job-table article {
  display: grid;
  grid-template-columns: 1.3fr 1fr 0.8fr 0.8fr;
  gap: 18px;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}
.table-head {
  background: var(--surface-2);
  font-size: 12px;
  color: var(--text-3);
  font-weight: 600;
}
.job-table article > div {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.job-table strong {
  font-size: 14px;
}
.job-table small {
  font-size: 11px;
  color: var(--text-3);
  overflow-wrap: anywhere;
}
.job-table time {
  font: 12px var(--font-mono);
  color: var(--text-2);
}
.job-table .row-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.candidate-workspace {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  min-height: 640px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.candidate-list {
  border-right: 1px solid var(--border);
  background: var(--surface-2);
  padding: 18px 0;
}
.list-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 20px 16px;
}
.list-title h2 {
  font-size: 18px;
}
.list-title span {
  font-size: 11px;
  color: var(--text-3);
}
.candidate-list button {
  border: 0;
  background: transparent;
  font-family: var(--font-sans);
  width: 100%;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  text-align: left;
  padding: 14px 18px;
  border-left: 3px solid transparent;
  color: var(--text-1);
}
.candidate-list button:hover {
  background: var(--surface);
}
.candidate-list button.selected {
  background: var(--surface);
  border-left-color: var(--brand-text);
}
.candidate-list button > span:nth-child(2) {
  display: grid;
  gap: 5px;
  min-width: 0;
}
.candidate-list small {
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.candidate-avatar {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  background: var(--brand-soft);
  color: var(--brand-text);
  border-radius: 50%;
  font-weight: 700;
}
.candidate-detail {
  padding: 32px;
  min-width: 0;
}
.candidate-detail > header {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border);
}
.candidate-detail h2 {
  font-size: 28px;
  margin: 6px 0;
}
.candidate-detail header p:last-child {
  font-size: 13px;
  color: var(--text-2);
}
.candidate-facts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: var(--border);
  margin: 24px 0;
}
.candidate-facts span {
  background: var(--surface);
  display: grid;
  gap: 8px;
  padding: 16px;
}
.candidate-facts small {
  color: var(--text-3);
  font-size: 11px;
}
.candidate-facts strong {
  font-size: 13px;
}
.resume-evidence,
.process-record {
  padding: 22px 0;
  border-top: 1px solid var(--border);
}
.resume-evidence > p {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}
.resume-evidence span {
  font-size: 13px;
  color: var(--text-2);
}
.process-record > p {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}
.process-record > p > svg {
  color: var(--brand-text);
  flex: none;
}
.process-record > p > span {
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: var(--text-2);
}
.process-record small {
  display: block;
}
.agreement-strip {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 16px;
  align-items: center;
  background: var(--warn-soft);
  padding: 18px;
  margin: 12px 0 24px;
}
.agreement-strip > svg {
  color: var(--warn-text);
}
.agreement-strip p {
  font-size: 12px;
  color: var(--text-2);
  margin-top: 4px;
}
.candidate-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}
.agreement-row {
  display: grid;
  grid-template-columns: auto minmax(180px, 1fr) minmax(260px, 0.8fr) auto;
  gap: 18px;
  align-items: center;
  padding: 20px 8px;
  border-top: 1px solid var(--border);
}
.agreement-row > svg {
  color: var(--brand-text);
}
.agreement-row > div:nth-child(2) {
  display: grid;
  gap: 6px;
}
.agreement-row > div:nth-child(2) span {
  font-size: 12px;
  color: var(--text-2);
}
.confirmation-pair {
  display: flex;
  align-items: center;
}
.confirmation-pair span {
  font-size: 12px;
  color: var(--text-3);
  border: 1px solid var(--border);
  padding: 6px 10px;
}
.confirmation-pair span.done {
  color: var(--success-text);
  background: var(--success-soft);
  border-color: transparent;
}
.confirmation-pair i {
  width: 24px;
  height: 1px;
  background: var(--border);
}
@media (max-width: 1050px) {
  .candidate-workspace {
    grid-template-columns: 300px minmax(0, 1fr);
  }
  .hero-metrics {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  .overview-grid {
    grid-template-columns: 1fr;
  }
  .job-table .table-head,
  .job-table article {
    grid-template-columns: 1fr 1fr;
  }
  .agreement-row {
    grid-template-columns: auto 1fr auto;
  }
  .confirmation-pair {
    grid-column: 2;
  }
}
@media (max-width: 767px) {
  .company-hero {
    display: grid;
    padding: 24px;
  }
  .company-hero h1 {
    font-size: 24px;
  }
  .hero-metrics {
    grid-template-columns: 1fr 1fr;
  }
  .workspace-tabs {
    overflow: auto;
    gap: 22px;
  }
  .workspace-tabs a {
    white-space: nowrap;
  }
  .pipeline-columns {
    grid-template-columns: 1fr 1fr;
  }
  .candidate-workspace {
    grid-template-columns: 1fr;
  }
  .candidate-list {
    border-right: 0;
    border-bottom: 1px solid var(--border);
    max-height: 330px;
    overflow: auto;
  }
  .candidate-detail {
    padding: 22px;
  }
  .candidate-facts {
    grid-template-columns: 1fr;
  }
  .job-table .table-head {
    display: none;
  }
  .job-table article {
    grid-template-columns: 1fr;
    padding: 18px 4px;
  }
  .agreement-row {
    grid-template-columns: auto 1fr;
  }
  .agreement-row > .tag {
    grid-column: 2;
    justify-self: start;
  }
  .confirmation-pair {
    grid-column: 2;
    overflow: auto;
  }
}
</style>
