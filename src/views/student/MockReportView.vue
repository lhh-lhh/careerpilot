<script setup lang="ts">
import WorkbenchGuide from "../../components/presentation/WorkbenchGuide.vue";
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { useStudentData } from "../../composables/useStudentData";
import { useBusinessAi } from "../../composables/useBusinessAi";
import { interviewRequestInput } from "../../services/ai-requests";
import type { InterviewKey } from "../../types/entities";
import AiBlock from "../../components/base/AiBlock.vue";
import AppButton from "../../components/base/AppButton.vue";
import AppIcon from "../../components/base/AppIcon.vue";
import AppSkeleton from "../../components/base/AppSkeleton.vue";
import AppTag from "../../components/base/AppTag.vue";
import AiConsentDialog from "../../components/business/AiConsentDialog.vue";
import RadarChart from "../../components/charts/RadarChart.vue";
import ScoreRing from "../../components/charts/ScoreRing.vue";
import {isOnline} from '../../services/runtime';

const route = useRoute();
const { data, catalog, jobs, loading, error, companyLabel } = useStudentData();
const ai = useBusinessAi();
const feedbackQuestionId = ref("");
const dimensions: { key: InterviewKey; label: string; note: string }[] = [
  { key: "relevance", label: "相关性", note: "是否回应题目关键词" },
  { key: "star", label: "STAR", note: "场景、任务、行动与结果" },
  { key: "evidence", label: "证据", note: "可核实的数量与结果" },
  { key: "skill", label: "技能", note: "目标能力的真实表达" },
  { key: "structure", label: "结构", note: "层次与衔接" },
  { key: "consistency", label: "一致性", note: "表述是否自洽" },
];
const reportSession = computed(() => {
  const id = typeof route.query.id === "string" ? route.query.id : "";
  const list = (data.value?.mockSessions ?? [])
    .filter((item) => item.state === "completed" && item.report)
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id),
    );
  return list.find((item) => item.id === id) ?? list[0];
});
const report = computed(() => reportSession.value?.report ?? null);
const job = computed(() =>
  jobs.value.find((item) => item.id === reportSession.value?.targetJobId),
);
const radarValues = computed(() =>
  report.value
    ? dimensions.map((item) => ({
        label: item.label,
        value: report.value!.dimensions[item.key],
      }))
    : [],
);
const questionRows = computed(() =>
  (report.value?.questionScores ?? []).map((row, index) => ({
    ...row,
    index,
    question: catalog.value?.questions.find(
      (item) => item.id === row.questionId,
    ),
    answers:
      reportSession.value?.answers.filter(
        (answer) => answer.questionId === row.questionId,
      ) ?? [],
  })),
);
const aiText = computed(() =>
  ai.response.value?.data.module === "A2" ? ai.response.value.data.text : "",
);

async function feedback(questionId: string) {
  if (!reportSession.value || !catalog.value || !job.value) return;
  const question = catalog.value.questions.find(
    (item) => item.id === questionId,
  );
  if (!question) return;
  feedbackQuestionId.value = questionId;
  await ai.generate(
    "A2",
    "feedback",
    interviewRequestInput(reportSession.value, question, job.value),
  );
}
const print = () => window.print();
</script>

<template>
  <main id="main-content" class="business-page report-page ui-scene ui-scene--paper">
    <WorkbenchHeader>
      <template #heading><div>
        <span class="report-kicker">PRACTICE REPORT · LOCAL SCORING</span>
        <h1>每一次表达，都能更进一步。</h1>
        <p v-if="job">
          {{ job.title }} · {{ companyLabel(job.companyId) }} ·
          练习结果仅用于自我复盘
        </p>
      </div></template>
      <template #actions><div class="page-actions no-print">
        <RouterLink class="inline-link" to="/student/mock">返回练习</RouterLink>
        <AppButton variant="secondary" @click="print">
          <AppIcon name="resume" :size="16" />打印报告
        </AppButton>
      </div></template>
    </WorkbenchHeader>

    <div class="workbench-split workbench-body-layout"><div class="workbench-body-main">

    <p v-if="isOnline" class="business-notice">旧规则练习记录 · 仅供历史核对</p>
    <p v-if="error" class="business-notice business-error" role="alert">
      {{ error }}
    </p>
    <AppSkeleton v-else-if="loading" height="420px" />

    <template v-else-if="reportSession && report">
      <section class="report-hero">
        <div class="score-summary">
          <p>综合表现</p>
          <ScoreRing :value="report.overall" :size="152" label="分" />
          <AppTag :tone="report.completion === 1 ? 'success' : 'warn'">
            完成度 {{ Math.round(report.completion * 100) }}%
          </AppTag>
        </div>
        <div class="report-radar">
          <RadarChart :values="radarValues" title="面试表达六维评分" />
        </div>
        <div class="report-reading">
          <span>怎么读这份报告</span>
          <h2>分数用于定位表达缺口，<br />不代表真实录用概率。</h2>
          <p>
            所有数值由算法
            {{
              report.algorithmVersion
            }}
            根据已提交文字计算。生成式反馈只能解释，不能更改任何分数。
          </p>
          <div class="growth">
            <span>同口径成长</span>
            <strong v-if="report.growthDelta !== null">
              {{ report.growthDelta > 0 ? "+" : "" }}{{ report.growthDelta }}
            </strong>
            <strong v-else>--</strong>
            <small>{{ report.comparisonReason }}</small>
          </div>
        </div>
      </section>

      <section class="dimension-band">
        <article v-for="item in dimensions" :key="item.key">
          <header>
            <span>{{ item.label }}</span
            ><strong>{{ report.dimensions[item.key] }}</strong>
          </header>
          <progress
            :value="report.dimensions[item.key]"
            max="100"
            :aria-label="`${item.label} ${report.dimensions[item.key]}分`"
          ></progress>
          <p>{{ item.note }}</p>
        </article>
      </section>

      <section class="evidence-section">
        <div class="evidence-heading">
          <div>
            <h2>逐题证据</h2>
            <p>每一分都回到你的原始回答；未命中的维度不会补造依据。</p>
          </div>
          <span>{{ questionRows.length }} 道已提交题目</span>
        </div>
        <article
          v-for="row in questionRows"
          :key="row.questionId"
          class="question-report"
        >
          <header>
            <span class="question-number">0{{ row.index + 1 }}</span>
            <div>
              <p>
                {{
                  row.question?.type === "behavior"
                    ? "经历复盘"
                    : row.question?.type === "technical"
                      ? "能力说明"
                      : "动机与协作"
                }}
              </p>
              <h3>{{ row.question?.text ?? "历史题目" }}</h3>
            </div>
            <strong>{{ row.score.total }}</strong>
          </header>
          <div class="question-body">
            <blockquote>
              <p v-for="answer in row.answers" :key="answer.id">
                {{ answer.kind === "skip" ? "本题已跳过" : answer.text }}
              </p>
            </blockquote>
            <div class="evidence-list">
              <template v-for="item in dimensions" :key="item.key">
                <section>
                  <div>
                    <span>{{ item.label }}</span
                    ><strong>{{ row.score.dimensions[item.key] }}</strong>
                  </div>
                  <p v-if="row.score.evidence[item.key]?.length">
                    <mark
                      v-for="piece in row.score.evidence[item.key]!.slice(0, 3)"
                      :key="`${piece.start}-${piece.end}-${piece.quote}`"
                      >{{ piece.quote }}</mark
                    >
                  </p>
                  <p v-else class="missing-evidence">
                    未识别到可展示的文字依据
                  </p>
                </section>
              </template>
            </div>
          </div>
          <footer v-if="!isOnline" class="question-footer no-print">
            <AppButton
              variant="secondary"
              :loading="ai.busy.value && feedbackQuestionId === row.questionId"
              @click="feedback(row.questionId)"
              ><AppIcon name="sparkle" :size="16" />生成文字反馈</AppButton
            >
            <span>可选功能 · 反馈不参与评分</span>
          </footer>
          <AiBlock
            v-if="ai.response.value && feedbackQuestionId === row.questionId"
            class="feedback-block"
            :mode="ai.response.value.effectiveMode"
            :origin="ai.response.value.origin"
            :reason="ai.response.value.fallbackReason ?? undefined"
          >
            <p>{{ aiText }}</p>
            <template #evidence
              >文字仅引用本题已提交回答；数值仍以上方本地评分为准。</template
            >
          </AiBlock>
          <p
            v-if="ai.error.value && feedbackQuestionId === row.questionId"
            class="business-notice business-error"
            role="alert"
          >
            {{ ai.error.value }}
          </p>
        </article>
      </section>
    </template>

    <section v-else class="business-empty">
      <AppIcon name="chart" :size="40" />
      <h2>还没有可查看的练习报告</h2>
      <p>完成至少一道题并结束练习后，系统会根据已提交内容生成本地证据报告。</p>
      <RouterLink to="/student/mock" class="inline-link"
        >开始一次练习<AppIcon name="arrow" :size="16"
      /></RouterLink>
    </section>

    
    </div><WorkbenchGuide title="从逐题证据，寻找下一步。" copy="回看逐题证据与固定规则评分；与在线AI报告分开，不把参考分当作招聘结论。" /></div>
    <AiConsentDialog
      :open="ai.consentOpen.value"
      :preview="ai.preview.value"
      @close="ai.stop"
      @confirm="ai.confirm"
    />
    <footer class="business-footer">
      算法版本 {{ report?.algorithmVersion ?? "1.0" }} · 无证据不补写 ·
      报告不替代真实面试评价
    </footer>
  </main>
</template>

<style scoped>
.report-page {
  max-width: 1360px;
}
.report-kicker {
  display: block;
  font: 11px var(--font-mono);
  color: var(--brand-text);
  margin-bottom: 14px;
}
.report-hero {
  display: grid;
  grid-template-columns: 240px minmax(320px, 1fr) minmax(320px, 1fr);
  background: var(--surface);
  border: 1px solid var(--border);
  min-height: 360px;
}
.score-summary {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  border-right: 1px solid var(--border);
  padding: 32px;
}
.score-summary > p {
  font-size: 13px;
  color: var(--text-2);
}
.report-radar {
  display: grid;
  place-items: center;
  padding: 24px;
  border-right: 1px solid var(--border);
}
.report-reading {
  padding: 44px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.report-reading > span {
  font: 11px var(--font-mono);
  color: var(--brand-text);
  margin-bottom: 14px;
}
.report-reading h2 {
  font-size: 23px;
  line-height: 1.65;
  margin-bottom: 16px;
}
.report-reading > p {
  font-size: 13px;
  color: var(--text-2);
}
.growth {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px 16px;
  border-top: 1px solid var(--border);
  margin-top: 28px;
  padding-top: 20px;
}
.growth span {
  font-size: 12px;
  color: var(--text-2);
}
.growth strong {
  grid-row: 1/3;
  grid-column: 2;
  font: 30px var(--font-mono);
  color: var(--brand-text);
}
.growth small {
  font-size: 11px;
  color: var(--text-3);
}
.dimension-band {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  margin: 24px 0 56px;
  background: var(--border);
  gap: 1px;
  border: 1px solid var(--border);
}
.dimension-band article {
  background: var(--surface);
  padding: 20px;
}
.dimension-band header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}
.dimension-band strong {
  font: 20px var(--font-mono);
  color: var(--brand-text);
}
.dimension-band progress {
  width: 100%;
  height: 4px;
  accent-color: var(--brand-text);
  margin: 16px 0 10px;
}
.dimension-band p {
  font-size: 11px;
  color: var(--text-3);
}
.evidence-section {
  max-width: 1080px;
  margin: 0 auto;
}
.evidence-heading {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-end;
  margin-bottom: 24px;
}
.evidence-heading h2 {
  font-size: 26px;
  margin-bottom: 8px;
}
.evidence-heading p {
  font-size: 13px;
  color: var(--text-2);
}
.evidence-heading > span {
  font: 12px var(--font-mono);
  color: var(--text-3);
}
.question-report {
  background: var(--surface);
  border: 1px solid var(--border);
  margin-bottom: 24px;
}
.question-report > header {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  gap: 20px;
  padding: 28px 32px;
  border-bottom: 1px solid var(--border);
  align-items: start;
}
.question-number {
  font: 14px var(--font-mono);
  color: var(--brand-text);
}
.question-report > header p {
  font-size: 11px;
  color: var(--text-3);
  margin-bottom: 8px;
}
.question-report > header h3 {
  font-size: 17px;
  line-height: 1.7;
}
.question-report > header > strong {
  font: 30px var(--font-mono);
  color: var(--brand-text);
}
.question-body {
  display: grid;
  grid-template-columns: minmax(260px, 4fr) minmax(360px, 6fr);
  gap: 0;
}
.question-body blockquote {
  margin: 0;
  padding: 32px;
  background: var(--bg-base);
  border-right: 1px solid var(--border);
  font-size: 14px;
  color: var(--text-2);
}
.question-body blockquote p + p {
  margin-top: 16px;
}
.evidence-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.evidence-list section {
  padding: 20px 24px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.evidence-list section:nth-child(even) {
  border-right: 0;
}
.evidence-list section:nth-last-child(-n + 2) {
  border-bottom: 0;
}
.evidence-list section > div {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}
.evidence-list section strong {
  font: 14px var(--font-mono);
}
.evidence-list section > p {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}
.evidence-list mark {
  background: var(--brand-soft);
  color: var(--brand-text);
  padding: 3px 6px;
  border-radius: 3px;
  font-size: 11px;
}
.missing-evidence {
  font-size: 11px;
  color: var(--text-3);
}
.question-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 32px;
  border-top: 1px solid var(--border);
}
.question-footer span {
  font-size: 11px;
  color: var(--text-3);
}
.feedback-block {
  margin: 0 32px 28px;
}
.feedback-block p {
  color: var(--text-2);
}
@media (max-width: 1100px) {
  .report-hero {
    grid-template-columns: 220px 1fr;
  }
  .report-reading {
    grid-column: 1/-1;
    border-top: 1px solid var(--border);
    padding: 32px;
  }
  .report-radar {
    border-right: 0;
  }
  .dimension-band {
    grid-template-columns: repeat(3, 1fr);
  }
  .question-body {
    grid-template-columns: 1fr;
  }
  .question-body blockquote {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
}
@media (max-width: 767px) {
  .report-hero {
    grid-template-columns: 1fr;
  }
  .score-summary {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
  .report-radar {
    padding: 16px;
  }
  .report-reading {
    padding: 28px 20px;
  }
  .dimension-band {
    grid-template-columns: 1fr 1fr;
    margin-bottom: 40px;
  }
  .question-report > header {
    grid-template-columns: 36px 1fr;
    padding: 24px 20px;
  }
  .question-report > header > strong {
    grid-column: 2;
  }
  .question-body blockquote {
    padding: 24px 20px;
  }
  .evidence-list {
    grid-template-columns: 1fr;
  }
  .evidence-list section {
    border-right: 0;
  }
  .evidence-list section:nth-last-child(2) {
    border-bottom: 1px solid var(--border);
  }
  .question-footer {
    align-items: flex-start;
    display: grid;
    padding: 20px;
  }
  .feedback-block {
    margin: 0 20px 20px;
  }
  .evidence-heading {
    align-items: flex-start;
  }
  .evidence-heading > span {
    display: none;
  }
}
</style>
