<script setup lang="ts">
import WorkbenchGuide from "../../components/presentation/WorkbenchGuide.vue";
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import { computed, ref } from "vue";
import { useCounselorData } from "../../composables/useCounselorData";
import { useSessionStore } from "../../stores/session";
import { appRepository } from "../../services/app-services";
import { businessNow } from "../../services/runtime";
import type { Assistance } from "../../types/entities";
import type { Command } from "../../services/repository";
import AppButton from "../../components/base/AppButton.vue";
import AppModal from "../../components/base/AppModal.vue";
import AppTag from "../../components/base/AppTag.vue";
import AppSkeleton from "../../components/base/AppSkeleton.vue";

const { data, loading, error, load } = useCounselorData(), session = useSessionStore();
const query = ref(""), status = ref(""), notice = ref(""), working = ref(false);
const mode = ref<"CREATE" | "REVIEW" | "CLOSE" | "REOPEN" | null>(null), target = ref<Assistance | null>(null);
const studentId = ref(""), note = ref(""), confirmed = ref(false), nextReview = ref("");
const studentPlan = ref('');
const names: Record<string, string> = { open: "跟进中", reviewed: "已复查", closed: "已结案" };
const titles = { CREATE: "新建帮扶", REVIEW: "记录复查", CLOSE: "确认结案", REOPEN: "重开帮扶" };
const studentName = (id: string) => data.value?.resumes.find(r => r.studentId === id)?.sections.basic.name ?? data.value?.students.find(s => s.id === id)?.studentNo ?? "学生";
const records = computed(() => [...(data.value?.assistance ?? [])].filter(r => (!status.value || r.status === status.value) && `${studentName(r.studentId)} ${r.note}`.includes(query.value.trim())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
function open(action: NonNullable<typeof mode.value>, record: Assistance | null = null) {
  mode.value = action; target.value = record ? structuredClone(record) : null; note.value = ""; confirmed.value = false;
  studentPlan.value = '';
  studentId.value = record?.studentId ?? data.value?.students[0]?.id ?? "";
  const date = new Date(Date.parse(businessNow()) + 7 * 86400000);
  nextReview.value = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
async function save() {
  if (!session.actor || !mode.value || working.value) return;
  const action = mode.value, record = target.value;
  const command: Command = action === "CREATE" ? { type: "CREATE_ASSISTANCE", commandId: crypto.randomUUID(), entityId: crypto.randomUUID(), expectedRevision: 0, payload: { studentId: studentId.value, alertRuleIds: ["manual"], note: note.value, studentPlan: studentPlan.value, nextReviewAt: new Date(nextReview.value).toISOString() } } : {
    type: "ASSISTANCE_ACTION", commandId: crypto.randomUUID(), entityId: record!.id, expectedRevision: record!.revision,
    payload: action === "CLOSE" ? { action, confirmed: confirmed.value } : action === "REOPEN" ? { action, reviewNote: note.value, nextReviewAt: new Date(nextReview.value).toISOString() } : { action, reviewNote: note.value },
  };
  working.value = true;
  try { await appRepository.execute(command, session.actor, { now: businessNow }); mode.value = null; await load(); notice.value = "记录已保存。"; }
  catch { notice.value = "未保存，请核对辖区、版本、复查时间及进行中的记录。输入已保留。"; }
  finally { working.value = false; }
}
const valid = computed(() => mode.value === "CLOSE" ? confirmed.value : note.value.trim().length >= 4 && (!(mode.value === "CREATE" || mode.value === "REOPEN") || !!nextReview.value));
const date = (value: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
</script>
<template>
  <main id="main-content" class="business-page support-page ui-scene ui-scene--governance">
    <WorkbenchHeader>
      <template #heading><div><p class="eyebrow">学生就业支持 · 帮扶跟进</p><h1>从一次核实，到持续行动。</h1><p>从一次核实到持续行动，保留每一步服务记录。</p></div></template>
      <template #actions><AppButton @click="open('CREATE')">新建帮扶</AppButton></template>
    </WorkbenchHeader>

    <div class="workbench-split workbench-body-layout"><div class="workbench-body-main">
    <p v-if="notice" role="status" class="business-notice">{{ notice }}</p><p v-if="error" role="alert">{{ error }}</p><AppSkeleton v-if="loading" />
    <template v-else>
      <div class="support-tools"><label class="form-label">查找记录<input v-model="query" placeholder="姓名或行动计划" /></label><label class="form-label">记录状态<select v-model="status"><option value="">全部记录</option><option v-for="(name, key) in names" :key="key" :value="key">{{ name }}</option></select></label><span>{{ records.length }} 条</span></div>
      <p class="caption">仅当前获授权辖区。人工核实记录不是风险标签，企业无法读取。</p>
      <section class="support-records" aria-label="帮扶档案">
        <article v-for="record in records" :key="record.id" class="surface">
          <header><div><h2>{{ studentName(record.studentId) }}</h2><p>复查 · {{ date(record.nextReviewAt) }}<span v-if="record.status !== 'closed' && record.nextReviewAt < businessNow()"> · 已到复查时间</span></p></div><AppTag :tone="record.status === 'closed' ? 'neutral' : 'brand'">{{ names[record.status] }}</AppTag></header>
          <p class="support-note">{{ record.note }}</p><p v-if="record.reviewNote" class="muted">复查：{{ record.reviewNote }}</p>
          <p v-if="record.studentPlan">学生可见行动：{{ record.studentPlan }}</p>
          <details><summary>历史办理</summary><ol><li v-for="log in data?.auditLogs.filter(a => a.entityId === record.id)" :key="log.id">{{ date(log.at) }} · {{ log.action === 'CREATE_ASSISTANCE' ? '建立档案' : log.action === 'REVIEW_ASSISTANCE' ? '复查' : log.action === 'REOPEN_ASSISTANCE' ? '重开' : '结案' }}</li></ol></details>
          <footer class="page-actions"><AppButton v-if="record.status === 'open'" size="sm" @click="open('REVIEW', record)">记录复查</AppButton><AppButton v-if="record.status === 'reviewed'" size="sm" variant="secondary" @click="open('CLOSE', record)">结案</AppButton><AppButton v-if="record.status === 'closed'" size="sm" variant="secondary" @click="open('REOPEN', record)">重开</AppButton></footer>
        </article>
        <div v-if="!records.length" class="business-empty"><h2>没有符合条件的记录</h2><p>可以主动核实学生需求并建立行动计划。</p></div>
      </section>
    </template>
    
    </div><WorkbenchGuide title="先倾听，再一起推进。" copy="创建、复查、结案和重开分别记录。学生可见行动与内部核实内容保持原有权限边界。" /></div>
    <AppModal data-scene="governance" :open="!!mode" :title="mode ? titles[mode] : '帮扶跟进'" @close="!working && (mode = null)">
      <div class="form-stack">
        <label v-if="mode === 'CREATE'" class="form-label">学生<select v-model="studentId" :disabled="working"><option v-for="student in data?.students" :key="student.id" :value="student.id">{{ studentName(student.id) }} · {{ student.studentNo }}</option></select></label>
        <label v-if="mode === 'CLOSE'"><input v-model="confirmed" type="checkbox" :disabled="working" />已核实并确认结案</label>
        <label v-else class="form-label">{{ mode === 'CREATE' ? '行动计划' : mode === 'REOPEN' ? '重开原因' : '复查记录' }}<textarea v-model="note" maxlength="500" :disabled="working" /></label>
        <label v-if="mode === 'CREATE'" class="form-label">学生可见行动（可选）<textarea v-model="studentPlan" maxlength="500" :disabled="working" /><span class="caption">仅此处内容与复查时间同步给学生；上方行动计划及复查记录仅辅导员可见。</span></label>
        <label v-if="mode === 'CREATE' || mode === 'REOPEN'" class="form-label">下次复查时间<input v-model="nextReview" type="datetime-local" :disabled="working" /></label>
      </div><template #footer><AppButton variant="secondary" :disabled="working" @click="mode = null">取消</AppButton><AppButton :disabled="!valid" :loading="working" @click="save">保存记录</AppButton></template>
    </AppModal>
  </main>
</template>
<style scoped>
.support-page{max-width:1250px}.support-tools{display:flex;align-items:end;gap:20px;margin-bottom:16px}.support-tools>label:first-child{flex:1}.support-tools>span{padding-bottom:12px;color:var(--text-2);white-space:nowrap}.support-records{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;margin-top:24px}.support-records article{padding:24px}.support-records header{display:flex;justify-content:space-between;align-items:start;gap:16px}.support-records h2{font-size:18px}.support-records header p{font-size:12px;color:var(--text-2);margin-top:8px}.support-note{white-space:pre-wrap;margin:24px 0 16px;overflow-wrap:anywhere}.support-records details{margin:20px 0;font-size:13px;color:var(--text-2)}.support-records li{margin-top:8px}.support-records footer{margin-top:20px}@media(max-width:900px){.support-records{grid-template-columns:1fr}.support-tools{flex-wrap:wrap}.support-tools>label:first-child{flex-basis:100%}}
</style>
