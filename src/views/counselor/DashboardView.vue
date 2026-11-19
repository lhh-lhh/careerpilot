<script setup lang="ts">
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import type { EChartsOption } from "echarts";
import type { RuleId } from "../../adapters/ai/types";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AiBlock from "../../components/base/AiBlock.vue";
import AppButton from "../../components/base/AppButton.vue";
import AppIcon from "../../components/base/AppIcon.vue";
import AppInput from "../../components/base/AppInput.vue";
import AppModal from "../../components/base/AppModal.vue";
import AppSkeleton from "../../components/base/AppSkeleton.vue";
import AppTag from "../../components/base/AppTag.vue";
import AiConsentDialog from "../../components/business/AiConsentDialog.vue";
import InsightChart from "../../components/charts/InsightChart.vue";
import { useBusinessAi } from "../../composables/useBusinessAi";
import { useCounselorData } from "../../composables/useCounselorData";
import { DESTINATION_DEADLINE, fixedClock } from "../../domain/clock";
import { businessNow, isOnline } from "../../services/runtime";
import {
  calculateAlerts,
  calculateMetrics,
  parseMetricIntent,
  type MetricIntent,
} from "../../domain/metrics/calculate";
import { diagnose } from "../../domain/resume/diagnose";
import { metricsRequestInput } from "../../services/ai-requests";
import { appRepository } from "../../services/app-services";
import { useSessionStore } from "../../stores/session";
import { useThemeStore } from "../../stores/theme";
import type { Assistance } from "../../types/entities";

const session = useSessionStore();
const theme = useThemeStore();
const previousTheme = theme.theme;
const { data, catalog, loading, error, load, label } = useCounselorData();
const ai = useBusinessAi();
const question = ref("");
const localAnswer = ref("");
const notice = ref("");
const assistanceMode = ref<"create" | "review" | "close" | null>(null);
const selectedStudentId = ref("");
const selectedRecord = ref<Assistance | null>(null);
const note = ref("");
const asOf = computed(() => { void data.value; return businessNow(); });
const reviewAt = ref(isOnline ? new Date(Date.now() + 3 * 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "2026-11-16T10:00");
const confirmed = ref(false);
const working = ref(false);

onMounted(() => {
  if (theme.theme === "light") theme.theme = "dark";
});
onBeforeUnmount(() => {
  if (previousTheme === "light" && theme.theme === "dark")
    theme.theme = "light";
});

const metrics = computed(() => {
  if (!data.value || !session.actor) return null;
  return calculateMetrics(
    {
      students: data.value.students,
      applications: data.value.applications,
      applicationEvents: data.value.applicationEvents,
      interviews: data.value.interviews,
      destinations: data.value.destinations,
      auditLogs: data.value.auditLogs,
    },
    { cohortYear: 2027, asOf: asOf.value },
    session.actor,
  );
});

const alerts = computed(() => {
  if (!data.value || !catalog.value) return [];
  const approved = new Set(
    data.value.destinations
      .filter(
        (row) => row.status === "approved" && row.type !== "unemployed",
      )
      .map((row) => row.studentId),
  );
  return calculateAlerts(
    data.value.students.map((student) => {
      const applications = data.value!.applications.filter(
        (row) => row.studentId === student.id,
      );
      const applicationIds = new Set(applications.map((row) => row.id));
      const activity = data.value!.auditLogs
        .filter(
          (row) =>
            (row.after?.studentId === student.id ||
              row.before?.studentId === student.id) &&
            ["APPLY", "COMPLETE_INTERVIEW", "SUBMIT_MOCK_ANSWER"].includes(
              row.action,
            ),
        )
        .map((row) => row.at)
        .sort()
        .at(-1);
      const resume = data.value!.resumes.find(
        (row) => row.studentId === student.id,
      );
      return {
        studentId: student.id,
        approved: approved.has(student.id),
        enrolledAt: student.enrolledAt,
        lastActivityAt: activity ?? null,
        applicationCount: applications.length,
        everInterviewed: data.value!.interviews.some((row) =>
          applicationIds.has(row.applicationId),
        ),
        resumeScore: resume
          ? diagnose(resume, null, catalog.value!.skills, asOf.value).total
          : 0,
      };
    }),
    asOf.value,
    DESTINATION_DEADLINE,
  );
});

const ruleLabels: Record<string, string> = {
  inactive7d: "连续 7 天无求职活动",
  applicationsWithoutInterview: "投递较多但尚未进入面试",
  resumeIncomplete: "简历完整度低于 60 分",
  deadlineApproaching: "去向登记截止时间临近",
};
const studentName = (studentId: string) =>
  data.value?.resumes.find((row) => row.studentId === studentId)?.sections
    .basic.name ?? "未命名学生";
const activeAssistance = (studentId: string) =>
  data.value?.assistance.find(
    (row) => row.studentId === studentId && row.status !== "closed",
  ) ?? null;
const percent = (value: number | null) =>
  value === null ? "暂无" : `${(value * 100).toFixed(1)}%`;
const numberValue = (value: number | null) =>
  value === null ? "暂无" : value.toFixed(1);
const printView = () => window.print();

const destinationOption = computed<EChartsOption>(() => ({
  legend: { bottom: 0, textStyle: { fontSize: 10 } },
  series: [
    {
      type: "pie",
      radius: ["42%", "68%"],
      center: ["50%", "42%"],
      label: { show: false },
      data: metrics.value
        ? [
            { name: "签约就业", value: metrics.value.structure.employment },
            { name: "升学", value: metrics.value.structure.furtherStudy },
            {
              name: "自主创业",
              value: metrics.value.structure.entrepreneurship,
            },
            { name: "灵活就业", value: metrics.value.structure.flexible },
            { name: "待审核", value: metrics.value.structure.pending },
            { name: "未登记", value: metrics.value.structure.unregistered },
          ]
        : [],
    },
  ],
}));
const funnelOption = computed<EChartsOption>(() => ({
  series: [
    {
      type: "funnel",
      top: 12,
      bottom: 10,
      left: "10%",
      width: "80%",
      minSize: "24%",
      maxSize: "100%",
      label: { formatter: "{b}  {c}", color: "inherit" },
      data: metrics.value
        ? [
            { name: "已投递", value: metrics.value.funnel.applied },
            { name: "进入面试", value: metrics.value.funnel.interview },
            { name: "获得录用", value: metrics.value.funnel.offered },
            { name: "签署协议", value: metrics.value.funnel.signed },
          ]
        : [],
    },
  ],
}));
const trendOption = computed<EChartsOption>(() => ({
  grid: { left: 36, right: 14, top: 20, bottom: 34 },
  xAxis: {
    type: "category",
    data: metrics.value?.weeklyTrend.map((row) =>
      row.weekStart.slice(5, 10).replace("-", "/"),
    ),
  },
  yAxis: {
    type: "value",
    min: 0,
    max: 1,
    axisLabel: { formatter: (value: number) => `${value * 100}%` },
  },
  series: [
    {
      type: "line",
      smooth: true,
      symbolSize: 7,
      areaStyle: { opacity: 0.1 },
      data: metrics.value?.weeklyTrend.map((row) => row.rate),
    },
  ],
}));
const majorIds = computed(() => metrics.value?.byMajor.map((row) => row.majorId) ?? []);
const industryIds = computed(() => [
  ...new Set(metrics.value?.majorIndustry.map((row) => row.industryId) ?? []),
]);
const heatOption = computed<EChartsOption>(() => ({
  grid: { left: 76, right: 24, top: 20, bottom: 72 },
  xAxis: {
    type: "category",
    data: industryIds.value.map(label),
    axisLabel: { interval: 0, rotate: 28, width: 58, overflow: "truncate" },
    splitArea: { show: true },
  },
  yAxis: {
    type: "category",
    data: majorIds.value.map(label),
    splitArea: { show: true },
  },
  visualMap: {
    min: 0,
    max: Math.max(1, ...(metrics.value?.majorIndustry.map((row) => row.count) ?? [1])),
    calculable: false,
    orient: "horizontal",
    left: "center",
    bottom: 0,
    textStyle: { fontSize: 10 },
  },
  series: [
    {
      type: "heatmap",
      label: { show: true },
      data: (metrics.value?.majorIndustry ?? []).map((row) => [
        industryIds.value.indexOf(row.industryId),
        majorIds.value.indexOf(row.majorId),
        row.count,
      ]),
    },
  ],
}));

function metricValue(intent: MetricIntent) {
  if (!metrics.value) return null;
  if (intent === "destinationRate") return metrics.value.destinationRate;
  if (intent === "avgApplications") return metrics.value.avgApplications;
  if (intent === "interviewPassRate") return metrics.value.interviewPassRate;
  if (intent === "alerts") return alerts.value.length;
  if (intent === "funnel") return metrics.value.funnel.signed;
  return Math.min(...metrics.value.byMajor.map((row) => row.rate));
}

function answerLocally() {
  const intent = parseMetricIntent(question.value.trim());
  if (!metrics.value || !intent) {
    localAnswer.value =
      "请明确询问落实率、专业对比、投递转化、风险预警、平均投递或面试通过情况。";
    return;
  }
  if (intent === "destinationRate")
    localAnswer.value = `当前辖区去向落实率为 ${percent(metrics.value.destinationRate)}，口径为已审核有效去向人数除以辖区学生数。`;
  else if (intent === "avgApplications")
    localAnswer.value = `当前辖区平均投递 ${numberValue(metrics.value.avgApplications)} 份。`;
  else if (intent === "interviewPassRate")
    localAnswer.value = `已完成面试的通过率为 ${percent(metrics.value.interviewPassRate)}。`;
  else if (intent === "alerts")
    localAnswer.value = `当前共有 ${alerts.value.length} 名学生触发至少一条固定预警规则。`;
  else if (intent === "funnel")
    localAnswer.value = `当前漏斗为投递 ${metrics.value.funnel.applied}、面试 ${metrics.value.funnel.interview}、录用 ${metrics.value.funnel.offered}、签约 ${metrics.value.funnel.signed}。`;
  else {
    const lowest = [...metrics.value.byMajor].sort((a, b) => a.rate - b.rate)[0];
    localAnswer.value = lowest
      ? `${label(lowest.majorId)}落实率最低，为 ${percent(lowest.rate)}。`
      : "当前范围暂无专业数据。";
  }
}

async function generateQuery() {
  if (!session.actor || !metrics.value) return;
  const intent = parseMetricIntent(question.value.trim()) ?? "clarify";
  await ai.generate(
    "A7",
    "query",
    metricsRequestInput(
      {
        queryText: question.value.trim(),
        intent,
        scopeLabel: "当前辅导员辖区",
        asOf: asOf.value,
        metricContext:
          intent === "clarify"
            ? []
            : [
                {
                  metricId: intent,
                  token: `{{metric:${intent}}}`,
                  label:
                    intent === "destinationRate"
                      ? "去向落实率"
                      : intent === "byMajor"
                        ? "最低专业落实率"
                        : intent === "funnel"
                          ? "漏斗签约数"
                          : intent === "alerts"
                            ? "风险人数"
                            : intent === "avgApplications"
                              ? "平均投递"
                              : "面试通过率",
                  value: metricValue(intent),
                },
              ],
        targetStudents: [],
      },
      session.actor,
    ),
  );
}

async function generateAdvice(studentId: string) {
  if (!session.actor) return;
  const alert = alerts.value.find((row) => row.studentId === studentId);
  if (!alert) return;
  const alias = "risk-1";
  await ai.generate(
    "A7",
    "advice",
    metricsRequestInput(
      {
        queryText: "如何开展帮扶",
        intent: "alerts",
        scopeLabel: "当前辅导员辖区",
        asOf: asOf.value,
        metricContext: [
          {
            metricId: "alerts",
            token: "{{metric:alerts}}",
            label: "风险人数",
            value: alerts.value.length,
          },
        ],
        targetStudents: [
          {
            studentId: alias,
            riskLevel: alert.level as "low" | "medium" | "high",
            ruleIds: alert.ruleIds as RuleId[],
          },
        ],
      },
      session.actor,
      { [alias]: studentId },
    ),
  );
}

const aiText = computed(() => {
  let text = ai.text.value;
  if (!metrics.value) return text;
  const values: Record<string, string> = {
    destinationRate: percent(metrics.value.destinationRate),
    byMajor: percent(metricValue("byMajor")),
    funnel: String(metrics.value.funnel.signed),
    alerts: String(alerts.value.length),
    avgApplications: numberValue(metrics.value.avgApplications),
    interviewPassRate: percent(metrics.value.interviewPassRate),
  };
  for (const [key, value] of Object.entries(values))
    text = text.replaceAll(`{{metric:${key}}}`, value);
  for (const [key, value] of Object.entries(ruleLabels))
    text = text.replaceAll(`{{rule:${key}}}`, value);
  return text;
});

function openAssistance(studentId: string) {
  selectedStudentId.value = studentId;
  selectedRecord.value = null;
  assistanceMode.value = "create";
  note.value = "";
  confirmed.value = false;
}
function openRecord(record: Assistance, mode: "review" | "close") {
  selectedStudentId.value = record.studentId;
  selectedRecord.value = record;
  assistanceMode.value = mode;
  note.value = "";
  confirmed.value = false;
}
async function saveAssistance() {
  if (!session.actor || !assistanceMode.value) return;
  working.value = true;
  notice.value = "";
  try {
    if (assistanceMode.value === "create") {
      const alert = alerts.value.find(
        (row) => row.studentId === selectedStudentId.value,
      );
      if (!alert) return;
      await appRepository.execute(
        {
          type: "CREATE_ASSISTANCE",
          commandId: crypto.randomUUID(),
          entityId: crypto.randomUUID(),
          expectedRevision: 0,
          payload: {
            studentId: alert.studentId,
            alertRuleIds: alert.ruleIds,
            note: note.value,
            nextReviewAt: new Date(reviewAt.value).toISOString(),
          },
        },
        session.actor,
        fixedClock,
      );
      notice.value = "帮扶已记录，预警条件仍按原始业务数据计算。";
    } else if (selectedRecord.value) {
      await appRepository.execute(
        {
          type: "ASSISTANCE_ACTION",
          commandId: crypto.randomUUID(),
          entityId: selectedRecord.value.id,
          expectedRevision: selectedRecord.value.revision,
          payload:
            assistanceMode.value === "review"
              ? { action: "REVIEW", reviewNote: note.value }
              : { action: "CLOSE", confirmed: confirmed.value },
        },
        session.actor,
        fixedClock,
      );
      notice.value =
        assistanceMode.value === "review"
          ? "复查结果已记录，可在核对完成后关闭帮扶。"
          : "帮扶记录已关闭；固定预警仍会依据当前条件重新计算。";
    }
    localAnswer.value = "";
    assistanceMode.value = null;
    await load();
  } catch {
    notice.value = "帮扶记录未写入，请核对必填内容与当前版本后重试。";
  } finally {
    working.value = false;
  }
}
</script>

<template>
  <main id="main-content" class="business-page dashboard-page ui-scene ui-scene--analytics">
    <WorkbenchHeader>
      <template #heading><div>
        <p>2027 届 · 当前辅导员辖区 · 统计时点 {{ asOf.slice(0, 10) }}</p>
        <h1>从整体趋势，到需要被看见的一个人。</h1>
      </div></template>
      <template #actions><AppButton variant="secondary" @click="printView"
        ><AppIcon name="chart" :size="16" />导出当前视图</AppButton
      ></template>
    </WorkbenchHeader>
    <p v-if="notice" class="dashboard-notice" role="status">{{ notice }}</p>
    <p v-if="error" class="dashboard-notice error" role="alert">
      {{ error }}
    </p>
    <AppSkeleton v-if="loading" />
    <template v-else-if="metrics">
      <section class="kpi-strip" aria-label="辖区核心指标">
        <article>
          <span>去向落实率</span
          ><strong data-testid="destination-rate">{{
            percent(metrics.destinationRate)
          }}</strong
          ><small>已审核有效去向 / 辖区学生</small>
        </article>
        <article>
          <span>辖区学生</span><strong>{{ metrics.studentCount }}</strong
          ><small>仅当前账号可见范围</small>
        </article>
        <article>
          <span>固定规则预警</span><strong>{{ alerts.length }}</strong
          ><small>展示全部触发原因</small>
        </article>
        <article>
          <span>平均投递</span
          ><strong>{{ numberValue(metrics.avgApplications) }}</strong
          ><small>当前范围投递数 / 学生数</small>
        </article>
      </section>

      <div class="dashboard-workspace">
        <div class="dashboard-main">
          <section class="chart-matrix">
            <article class="dashboard-panel">
              <header><h2>去向结构</h2><AppTag>按有效去向</AppTag></header>
              <InsightChart
                title="去向结构"
                :option="destinationOption"
                :summary="`已落实 ${metrics.structure.employment + metrics.structure.furtherStudy + metrics.structure.entrepreneurship + metrics.structure.flexible} 人，待审核 ${metrics.structure.pending} 人，未登记 ${metrics.structure.unregistered} 人。`"
              />
            </article>
            <article class="dashboard-panel">
              <header><h2>投递转化</h2><AppTag>去重口径</AppTag></header>
              <InsightChart
                title="投递转化漏斗"
                :option="funnelOption"
                :summary="`投递 ${metrics.funnel.applied}，进入面试 ${metrics.funnel.interview}，获得录用 ${metrics.funnel.offered}，签署协议 ${metrics.funnel.signed}。`"
              />
            </article>
            <article class="dashboard-panel">
              <header><h2>八周趋势</h2><AppTag>历史审计重放</AppTag></header>
              <InsightChart
                title="八周去向落实率趋势"
                :option="trendOption"
                summary="按周末审计快照重放；无历史快照的周次不补零。"
              />
            </article>
            <article class="dashboard-panel heatmap-panel">
              <header>
                <div><h2>专业 × 行业流向</h2><p>只统计已审核的签约就业去向。</p></div>
                <AppTag>可核对</AppTag>
              </header>
              <InsightChart
                title="专业与行业流向热力图"
                :option="heatOption"
                :height="270"
                summary="横轴为行业，纵轴为专业；数值为当前辖区已审核就业人数。"
              />
            </article>
          </section>

          <section class="dashboard-panel query-panel">
            <header>
              <div>
                <h2>自然语言问数</h2>
                <p>数值始终由当前本地作用域聚合，文本只负责解释。</p>
              </div>
              <AppTag tone="ai">A7</AppTag>
            </header>
            <div class="query-row">
              <AppInput
                v-model="question"
                label="问一个就业数据问题"
                placeholder="例如：当前去向落实率是多少"
              />
              <AppButton @click="answerLocally">本地问数</AppButton>
              <AppButton
                variant="secondary"
                :loading="ai.busy.value"
                @click="generateQuery"
                >生成问数解读</AppButton
              >
            </div>
            <p v-if="localAnswer" class="local-answer" role="status">
              {{ localAnswer }}
              <span>数据来自本地聚合 · 当前辅导员辖区</span>
            </p>
            <p v-if="ai.error.value" class="dashboard-notice error" role="alert">{{ ai.error.value }}</p>
            <div v-if="ai.busy.value" role="status">正在等待DeepSeek生成… <AppButton variant="ghost" size="sm" @click="ai.stop">停止生成</AppButton></div>
            <AiBlock
              v-if="ai.response.value"
              :mode="ai.response.value.effectiveMode"
              :trace-id="ai.response.value?.traceId"
              :provenance="ai.response.value?.provenance"
              :origin="ai.response.value.origin"
              :reason="ai.response.value?.fallbackReason ?? undefined"
              :loading="ai.busy.value"
              @cancel="ai.stop"
            >
              <p>{{ aiText }}</p>
            </AiBlock>
          </section>
        </div>

        <aside class="risk-rail" aria-label="慢就业预警">
          <header><div><h2>慢就业预警</h2><p>固定规则 · {{ alerts.length }} 人</p></div><AppIcon name="warning" /></header>
          <article v-for="alert in alerts.slice(0, 5)" :key="alert.studentId" class="risk-item">
            <div class="risk-person">
              <span>{{ studentName(alert.studentId).slice(0, 1) }}</span>
              <div><h3>{{ studentName(alert.studentId) }}</h3><p>{{ alert.level === 'high' ? '高风险' : alert.level === 'medium' ? '需关注' : '低风险' }} · {{ alert.score }} 分</p></div>
            </div>
            <ul><li v-for="rule in alert.rules" :key="rule.ruleId"><AppIcon name="warning" :size="14" /><span><b>{{ ruleLabels[rule.ruleId] }}</b><small>{{ rule.action }}</small></span></li></ul>
            <div v-if="activeAssistance(alert.studentId)" class="assistance-state">
              <AppTag tone="success">{{ activeAssistance(alert.studentId)!.status === 'open' ? '帮扶进行中' : '已复查' }}</AppTag>
              <p>{{ activeAssistance(alert.studentId)!.note }}</p>
            </div>
            <div class="risk-actions">
              <AppButton variant="ghost" size="sm" @click="generateAdvice(alert.studentId)">生成帮扶建议</AppButton>
              <AppButton v-if="!activeAssistance(alert.studentId)" size="sm" :aria-label="`记录 ${studentName(alert.studentId)} 的帮扶行动`" @click="openAssistance(alert.studentId)">记录闭环</AppButton>
              <AppButton v-else-if="activeAssistance(alert.studentId)!.status === 'open'" size="sm" @click="openRecord(activeAssistance(alert.studentId)!, 'review')">记录复查</AppButton>
              <AppButton v-else size="sm" @click="openRecord(activeAssistance(alert.studentId)!, 'close')">确认关闭</AppButton>
            </div>
          </article>
          <div v-if="!alerts.length" class="risk-empty"><AppIcon name="check" :size="28" /><p>当前辖区没有学生触发固定预警规则。</p></div>
        </aside>
      </div>
    </template>

    <AppModal data-scene="governance"
      :open="assistanceMode !== null"
      :title="assistanceMode === 'create' ? '记录帮扶行动' : assistanceMode === 'review' ? '记录帮扶复查' : '关闭帮扶记录'"
      @close="assistanceMode = null"
    >
      <div class="assistance-form">
        <p>学生：<strong>{{ studentName(selectedStudentId) }}</strong></p>
        <label v-if="assistanceMode !== 'close'">{{ assistanceMode === 'review' ? '复查记录' : '帮扶记录' }}<textarea v-model="note" :aria-label="assistanceMode === 'review' ? '复查记录' : '帮扶记录'"></textarea></label>
        <label v-if="assistanceMode === 'create'">下次复查时间<input v-model="reviewAt" type="datetime-local" /></label>
        <label v-if="assistanceMode === 'close'" class="confirm-row"><input v-model="confirmed" type="checkbox" />我已核对复查记录并确认关闭</label>
      </div>
      <template #footer><AppButton variant="secondary" @click="assistanceMode = null">取消</AppButton><AppButton :loading="working" :disabled="assistanceMode === 'close' && !confirmed" @click="saveAssistance">{{ assistanceMode === 'close' ? '确认关闭' : '保存帮扶' }}</AppButton></template>
    </AppModal>
    <AiConsentDialog :open="ai.consentOpen.value" :preview="ai.preview.value" @close="ai.stop" @confirm="ai.confirm" />
  </main>
</template>

<style scoped>
.dashboard-page{max-width:1600px;padding-top:28px}.dashboard-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:24px}.dashboard-heading h1{font-size:30px;line-height:1.35;margin-top:8px}.dashboard-heading p{color:var(--text-3);font-size:12px}.dashboard-notice{padding:12px 16px;margin-bottom:16px;border-left:3px solid var(--teal);background:var(--surface);font-size:13px}.dashboard-notice.error{border-color:var(--danger);color:var(--danger-text)}.kpi-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid var(--border);background:var(--surface);margin-bottom:16px}.kpi-strip article{padding:20px 24px;border-right:1px solid var(--border);display:grid;gap:8px}.kpi-strip article:last-child{border-right:0}.kpi-strip span,.kpi-strip small{font-size:11px;color:var(--text-3)}.kpi-strip strong{font:600 30px/1 var(--font-mono);color:var(--text-1)}.dashboard-workspace{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:16px}.dashboard-main{min-width:0;display:grid;gap:16px}.chart-matrix{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.dashboard-panel,.risk-rail{background:var(--surface);border:1px solid var(--border);padding:20px}.dashboard-panel>header,.risk-rail>header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:10px}.dashboard-panel h2,.risk-rail h2{font-size:15px}.dashboard-panel header p,.risk-rail header p{color:var(--text-3);font-size:11px;margin-top:6px}.heatmap-panel{grid-column:1/-1}.query-panel{display:grid;gap:16px}.query-row{display:grid;grid-template-columns:minmax(260px,1fr) auto auto;gap:12px;align-items:end}.local-answer{display:flex;justify-content:space-between;gap:16px;padding:14px 16px;border-left:3px solid var(--teal);background:var(--surface-2);font-size:13px}.local-answer span{color:var(--text-3);font-size:11px}.risk-rail{align-self:start;position:sticky;top:16px}.risk-rail>header>svg{color:var(--warn)}.risk-item{padding:18px 0;border-top:1px solid var(--border)}.risk-person{display:flex;gap:12px;align-items:center}.risk-person>span{width:38px;height:38px;display:grid;place-items:center;border-radius:50%;background:var(--warn-soft);color:var(--warn-text);font-weight:700}.risk-person h3{font-size:14px}.risk-person p{font-size:11px;color:var(--warn-text);margin-top:3px}.risk-item ul{display:grid;gap:10px;margin:16px 0;list-style:none}.risk-item li{display:flex;gap:8px;align-items:flex-start;color:var(--warn-text)}.risk-item li span{display:grid;gap:3px}.risk-item li b{font-size:12px;color:var(--text-1);font-weight:500}.risk-item li small{font-size:11px;color:var(--text-3)}.risk-actions{display:flex;gap:8px;flex-wrap:wrap}.assistance-state{padding:12px;margin:12px 0;background:var(--surface-2)}.assistance-state p{font-size:11px;color:var(--text-2);margin-top:8px}.risk-empty{padding:36px 12px;text-align:center;color:var(--text-3);display:grid;justify-items:center;gap:12px;font-size:13px}.assistance-form{display:grid;gap:20px}.assistance-form label{display:grid;gap:8px;font-size:14px;font-weight:600}.assistance-form textarea,.assistance-form input[type='datetime-local']{width:100%;padding:12px;border:1px solid var(--border-control);background:var(--surface);color:var(--text-1);border-radius:var(--r-control);font:400 14px/1.7 var(--font-sans)}.assistance-form textarea{min-height:120px;resize:vertical}.assistance-form .confirm-row{display:flex;grid-template-columns:auto 1fr;align-items:flex-start;font-weight:400}.confirm-row input{margin-top:4px}@media(max-width:1280px){.dashboard-workspace{grid-template-columns:1fr}.risk-rail{position:static}.chart-matrix{grid-template-columns:repeat(2,minmax(0,1fr))}.chart-matrix>article:nth-child(3){grid-column:1/-1}}@media(max-width:767px){.dashboard-heading{display:grid;align-items:start}.kpi-strip{grid-template-columns:1fr 1fr}.kpi-strip article:nth-child(2){border-right:0}.kpi-strip article:nth-child(-n+2){border-bottom:1px solid var(--border)}.chart-matrix{grid-template-columns:1fr}.chart-matrix>article:nth-child(3),.heatmap-panel{grid-column:auto}.query-row{grid-template-columns:1fr}.local-answer{display:grid}.dashboard-panel,.risk-rail{padding:16px}.dashboard-heading h1{font-size:24px}}@media print{.dashboard-page{background:#fff;color:#000}.dashboard-workspace{grid-template-columns:1fr}.risk-rail{position:static}.query-panel{display:none}.dashboard-panel,.risk-rail,.kpi-strip{border-color:#777;break-inside:avoid}}
</style>
