<script setup lang="ts">
import WorkbenchGuide from "../../components/presentation/WorkbenchGuide.vue";
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { appRepository, onDomainChange } from "../../services/app-services";
import { useSessionStore } from "../../stores/session";
import { businessNow } from "../../services/runtime";
import type { Company, Job } from "../../types/entities";
import type { GovernanceCommand } from "../../services/governance-command";
import AppButton from "../../components/base/AppButton.vue";
import AppModal from "../../components/base/AppModal.vue";
import AppTag from "../../components/base/AppTag.vue";
import AppSkeleton from "../../components/base/AppSkeleton.vue";
const session = useSessionStore();
const data = shallowRef<Awaited<ReturnType<typeof appRepository.readGovernance>> | null>(null);
const loading = ref(true), notice = ref(""), error = ref(""), reason = ref(""), working = ref(false);
const target = shallowRef<{ title: string; command: GovernanceCommand } | null>(null);
const transfer = shallowRef<NonNullable<typeof data.value>['students'][number] | null>(null), counselorId = ref(''), transferReason = ref(''), studentQuery = ref('');
const jobQuery = ref(''), jobState = ref(''), jobPage = ref(1);
const filteredJobs = computed(() => [...(data.value?.jobs ?? [])].filter(job =>
  `${job.title} ${data.value?.companies.find(c => c.id === job.companyId)?.name ?? ''}`.toLowerCase().includes(jobQuery.value.trim().toLowerCase()) &&
  (!jobState.value || (jobState.value === 'published' ? job.status === 'published' : job.reviewStatus === jobState.value)),
).sort((a,b) => Number(b.reviewStatus === 'pending') - Number(a.reviewStatus === 'pending') || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)));
const jobPages = computed(() => Math.max(1, Math.ceil(filteredJobs.value.length / 12)));
const visibleJobs = computed(() => filteredJobs.value.slice((jobPage.value - 1) * 12, jobPage.value * 12));
watch([jobQuery, jobState], () => { jobPage.value = 1; });
watch(jobPages, count => { jobPage.value = Math.min(jobPage.value, count); });
let generation = 0, disposed = false;
async function load() {
  const id = ++generation, actor = session.actor; if (!actor) return;
  try { const result = await appRepository.readGovernance(actor); if (!disposed && id === generation) { data.value = result; error.value = ""; } }
  catch { if (id === generation) error.value = "审核队列暂时无法读取，请重试。"; }
  finally { if (id === generation) loading.value = false; }
}
const unsubscribe = onDomainChange(() => void load());
onMounted(load); onUnmounted(() => { disposed = true; generation++; unsubscribe(); });
function reviewCompany(company: Company) {
  reason.value = ""; target.value = { title: company.verified ? "暂停企业准入" : "核准企业准入", command: { type: "REVIEW_COMPANY", commandId: crypto.randomUUID(), entityId: company.id, expectedRevision: company.revision, payload: { verified: !company.verified, reason: "" } } };
}
function reviewJob(job: Job, decision: "approve" | "reject" | "takedown") {
  reason.value = ""; target.value = { title: decision === "approve" ? "通过上架" : decision === "reject" ? "退回修改" : "下架岗位", command: { type: "REVIEW_JOB", commandId: crypto.randomUUID(), entityId: job.id, expectedRevision: job.revision, payload: { decision, reason: "" } } };
}
async function save() {
  if (!target.value || !session.actor || working.value) return;
  const command = structuredClone(target.value.command); command.payload.reason = reason.value;
  working.value = true;
  try { await appRepository.execute(command, session.actor, { now: businessNow }); target.value = null; notice.value = "办理已保存。"; await load(); }
  catch { notice.value = "未办理，队列可能已变化。原因已保留，请核对最新版本后重试。"; }
  finally { working.value = false; }
}
function prepareTransfer(student: NonNullable<typeof data.value>['students'][number]) {
  transfer.value = structuredClone(student); counselorId.value = ''; transferReason.value = '';
}
async function saveTransfer() {
  const student = transfer.value; if (!student || !session.actor || working.value) return;
  working.value = true;
  try {
    await appRepository.execute({ type: 'REASSIGN_STUDENT', commandId: crypto.randomUUID(), entityId: student.id, expectedRevision: student.revision, payload: { counselorId: counselorId.value, reason: transferReason.value } }, session.actor, { now: businessNow });
    transfer.value = null; notice.value = '辖区交接已保存，旧辖区访问权限已撤销。'; await load();
  } catch { notice.value = '交接未保存，请核对学生版本与在职辅导员。原因已保留。'; }
  finally { working.value = false; }
}
const state = (job: Job) => job.status === "published" ? "已上架" : job.reviewStatus === "pending" ? "待审核" : job.reviewStatus === "rejected" ? "已退回" : job.status === "closed" ? "已下架" : "草稿";
</script>
<template>
  <main id="main-content" class="business-page governance-page ui-scene ui-scene--governance">
    <WorkbenchHeader>
      <template #heading><div><p class="eyebrow">平台准入治理</p><h1>核实主体，让机会可靠呈现。</h1><p>核实主体与岗位事实，办理结果同步到企业与学生端。</p></div></template>
      <template #actions><AppButton variant="secondary" @click="load">刷新队列</AppButton></template>
    </WorkbenchHeader>

    <div class="workbench-split workbench-body-layout"><div class="workbench-body-main">
    <p v-if="notice" role="status" class="business-notice">{{ notice }}</p><p v-if="error" role="alert">{{ error }}</p><AppSkeleton v-if="loading" />
    <template v-else-if="data">
      <section class="surface governance-section" aria-label="学生辖区交接"><h2>学生辖区交接</h2><label class="form-label">查找学生<input v-model="studentQuery" placeholder="输入学号查找" /></label><ul class="company-admission transfer-list"><li v-for="student in data.students.filter(s => s.studentNo.includes(studentQuery.trim()))" :key="student.id"><div><strong>{{ student.studentNo }}</strong><p>{{ data.counselors.find(c => c.id === student.counselorId)?.displayName ?? '原辅导员已停用' }}</p></div><AppButton size="sm" variant="secondary" @click="prepareTransfer(student)">交接辖区</AppButton></li></ul></section>
      <section class="surface governance-section" aria-label="企业准入"><h2>企业准入</h2><p class="caption">封闭试用采用管理员人工核准；不代表已完成工商自动核验或资质原件审核。</p>
        <ul class="company-admission"><li v-for="company in data.companies" :key="company.id"><div><strong>{{ company.name }}</strong><p v-if="company.reviewReason">{{ company.reviewReason }}</p></div><AppTag :tone="company.verified ? 'success' : 'warn'">{{ company.verified ? '已核准' : '待核准 / 已暂停' }}</AppTag><AppButton size="sm" variant="secondary" @click="reviewCompany(company)">{{ company.verified ? '暂停准入' : '核准准入' }}</AppButton></li></ul>
      </section>
      <section class="governance-section" aria-label="岗位审核队列"><h2>岗位审核队列</h2>
        <div class="review-filters"><label class="form-label">查找岗位<input v-model="jobQuery" placeholder="岗位或企业名称" /></label><label class="form-label">审核状态<select v-model="jobState"><option value="">全部状态</option><option value="pending">待审核</option><option value="published">已上架</option><option value="rejected">已退回</option><option value="revoked">已下架</option></select></label></div>
        <p v-if="!filteredJobs.length" class="business-empty">没有符合条件的岗位。</p>
        <nav v-else class="page-actions" aria-label="审核队列分页"><span>{{ filteredJobs.length }} 个岗位 · 第 {{ jobPage }} / {{ jobPages }} 页</span><AppButton size="sm" variant="secondary" :disabled="jobPage === 1" @click="jobPage--">上一页</AppButton><AppButton size="sm" variant="secondary" :disabled="jobPage === jobPages" @click="jobPage++">下一页</AppButton></nav>
        <div class="review-jobs">
        <article v-for="job in visibleJobs" :key="job.id" class="surface">
          <header><div><h3>{{ job.title }}</h3><p>{{ data.companies.find(c => c.id === job.companyId)?.name }}</p></div><AppTag :tone="job.status === 'published' ? 'success' : job.reviewStatus === 'pending' ? 'warn' : 'neutral'">{{ state(job) }}</AppTag></header>
          <p class="job-description">{{ job.jdText }}</p><p v-if="job.reviewReason" class="muted">办理原因：{{ job.reviewReason }}</p>
          <details><summary>办理历史</summary><ol><li v-for="log in data.history.filter(a => a.entityId === job.id)" :key="log.id">{{ new Date(log.at).toLocaleString('zh-CN') }} · {{ log.action }}<p v-if="log.reason">{{ log.reason }}</p></li></ol></details>
          <footer class="page-actions"><template v-if="job.reviewStatus === 'pending'"><AppButton size="sm" @click="reviewJob(job,'approve')">通过上架</AppButton><AppButton size="sm" variant="secondary" @click="reviewJob(job,'reject')">退回修改</AppButton></template><AppButton v-if="job.status === 'published'" size="sm" variant="secondary" @click="reviewJob(job,'takedown')">下架岗位</AppButton></footer>
        </article>
      </div></section>
    </template>
    
    </div><WorkbenchGuide title="把好准入与审核的每一关。" copy="主体准入、岗位审核与辖区交接分区办理。查看影响范围后，再执行原有确认流程。" /></div>
    <AppModal data-scene="governance" :open="!!target" :title="target?.title ?? '审核办理'" @close="!working && (target = null)"><div class="form-stack"><p v-if="target?.command.type === 'REVIEW_COMPANY' && !target.command.payload.verified">暂停后，企业已上架岗位会同时下架，历史申请与审核记录继续保留。重新核准不会自动恢复岗位。</p><label class="form-label">办理原因<textarea v-model="reason" minlength="4" maxlength="500" :disabled="working" /></label></div><template #footer><AppButton variant="secondary" :disabled="working" @click="target = null">取消</AppButton><AppButton :loading="working" :disabled="reason.trim().length < 4" @click="save">确认办理</AppButton></template></AppModal>
    <AppModal data-scene="governance" :open="!!transfer" title="学生辖区交接" @close="!working && (transfer = null)"><div class="form-stack"><p>{{ transfer?.studentNo }} 的帮扶档案随学生归属移交，旧辅导员立即失去资料读取权限。历史办理人保留，不转移登录身份。</p><label class="form-label">接收辅导员<select v-model="counselorId" :disabled="working"><option value="">请选择</option><option v-for="c in data?.counselors.filter(c => c.id !== transfer?.counselorId)" :key="c.id" :value="c.id">{{ c.displayName }}</option></select></label><label class="form-label">交接原因<textarea v-model="transferReason" maxlength="500" :disabled="working" /></label></div><template #footer><AppButton variant="secondary" :disabled="working" @click="transfer = null">取消</AppButton><AppButton :loading="working" :disabled="!counselorId || transferReason.trim().length < 4" @click="saveTransfer">确认交接</AppButton></template></AppModal>
  </main>
</template>
<style scoped>
.transfer-list{max-height:300px;overflow:auto}
.review-filters { display:grid;grid-template-columns:minmax(0,1fr) minmax(130px,220px);gap:16px;margin-bottom:16px; }.review-jobs{margin-top:20px}@media(max-width:600px){.review-filters{grid-template-columns:1fr}}
.governance-page{max-width:1400px}.governance-section{margin-top:28px}.governance-section.surface{padding:24px}.governance-section>h2{margin-bottom:16px;font-size:20px}.company-admission{list-style:none;padding:0}.company-admission li{display:flex;align-items:center;gap:16px;padding:18px 0;border-bottom:1px solid var(--border)}.company-admission li>div{flex:1;min-width:0}.company-admission p{font-size:13px;color:var(--text-2);margin-top:8px}.review-jobs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.review-jobs article{padding:24px;min-width:0}.review-jobs header{display:flex;align-items:start;justify-content:space-between;gap:16px}.review-jobs h3{font-size:18px}.review-jobs header p{font-size:13px;color:var(--text-2);margin-top:8px}.job-description{margin:20px 0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7}.review-jobs details{margin:20px 0;font-size:13px}.review-jobs li{margin-top:12px;overflow-wrap:anywhere}.review-jobs footer{margin-top:20px}@media(max-width:900px){.review-jobs{grid-template-columns:1fr}}@media(max-width:600px){.company-admission li{flex-wrap:wrap}.company-admission li>div{flex-basis:100%}}
</style>
