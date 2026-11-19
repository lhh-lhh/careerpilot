<script setup lang="ts">
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import { computed, ref, watch } from "vue";
import { useStudentData } from "../../composables/useStudentData";
import { diagnose } from "../../domain/resume/diagnose";
import { DESTINATION_DEADLINE } from "../../domain/clock";
import { studentTasks } from "../../domain/student-tasks";
import { matchInWorker } from "../../services/matching-worker";
import type { MatchExplanation } from "../../types/entities";
import ScoreRing from "../../components/charts/ScoreRing.vue";
import RadarChart from "../../components/charts/RadarChart.vue";
import AppIcon from "../../components/base/AppIcon.vue";
import AppButton from "../../components/base/AppButton.vue";
import AppSkeleton from "../../components/base/AppSkeleton.vue";
import JobArtwork from "../../components/base/JobArtwork.vue";
import { businessNow, isOnline } from "../../services/runtime";
const {
  data,
  catalog,
  jobs,
  loading,
  error,
  load,
  label,
  skillLabel,
  companyLabel,
} = useStudentData();
const resume = computed(() => data.value?.resumes[0]);
const diagnosis = computed(() =>
  resume.value && catalog.value
    ? diagnose(resume.value, null, catalog.value.skills, businessNow())
    : null,
);
const labels: Record<string, string> = {
  basic: "基本信息",
  education: "教育背景",
  experience: "实习经历",
  projects: "项目经历",
  skills: "技能",
  certificates: "证书",
};
const recommendations = ref<MatchExplanation[]>([]);
watch([resume, catalog, jobs], async () => {
  if (!resume.value || !catalog.value) return;
  try {
    recommendations.value = (
      await matchInWorker({
        resume: structuredClone(resume.value),
        jobs: structuredClone(jobs.value),
        skills: structuredClone(catalog.value.skills),
        dictionaries: structuredClone(catalog.value.dictionaries),
        now: businessNow(),
      })
    ).results.slice(0, 3);
  } catch {
    recommendations.value = [];
  }
});
const progress = computed(() => {
  const apps = data.value?.applications ?? [];
  return [
    { label: "已投递", value: apps.length },
    {
      label: "进入面试",
      value: apps.filter((a) =>
        ["interview", "offered", "closed"].includes(a.status),
      ).length,
    },
    {
      label: "获得意向",
      value: apps.filter(
        (a) => a.status === "offered" || a.closedReason === "accepted",
      ).length,
    },
  ];
});
const days = Math.ceil(
  (Date.parse(DESTINATION_DEADLINE) - Date.parse(businessNow())) / 86400000,
);
const tasks = computed(() => data.value ? studentTasks(data.value, businessNow()) : []);
</script>
<template>
  <main id="main-content" class="business-page home-page ui-scene ui-scene--journey">
    <WorkbenchHeader>
      <template #heading><div>
        <div class="kicker">生涯概览 · CAREER JOURNEY</div>
        <h1>让下一步，更有方向。</h1>
        <p>从简历、岗位到面试，把今天值得推进的事放在眼前。</p>
      <div class="home-date">
        <span>{{ isOnline ? new Date().toLocaleDateString('zh-CN') : '2026 年 11 月 12 日' }}</span
        ><strong>{{ days >= 0 ? `距去向登记截止 ${days} 天` : '本期去向登记已截止' }}</strong>
      </div>
</div></template>
      <template #actions>
        <RouterLink class="inline-link" to="/student/resume">完善简历<AppIcon name="arrow" :size="16" /></RouterLink>
        <RouterLink class="inline-link" to="/student/jobs">查看全部岗位<AppIcon name="arrow" :size="16" /></RouterLink>
        <RouterLink class="inline-link" to="/student/applications">查看投递时间轴<AppIcon name="arrow" :size="16" /></RouterLink>
      </template>
    </WorkbenchHeader>
    <div v-if="error" class="business-notice business-error" role="alert">
      {{ error }} <AppButton variant="secondary" @click="load">重试</AppButton>
    </div>
    <AppSkeleton v-else-if="loading" />
    <template v-else-if="diagnosis && resume">
      <section class="overview-kpis" aria-label="生涯数据概览">
        <article><span>简历体检</span><strong>{{ diagnosis.total }}<small>/100</small></strong><p>规则体检参考分</p></article>
        <article><span>待处理事项</span><strong>{{ tasks.length }}</strong><p>从当前任务列表读取</p></article>
        <article><span>进行中投递</span><strong>{{ data?.applications.filter(a=>a.status!=='closed').length ?? 0 }}</strong><p>按现有状态统计</p></article>
        <article><span>准备进度</span><strong class="overview-progress-copy">持续推进</strong><p>不冒充录用概率</p></article>
      </section>
      <div class="overview-layout"><div class="overview-main">
      <section class="surface personal-tasks" aria-label="待办事项">
        <div class="section-heading"><h2>今天，先推进这几件事</h2><span class="caption">{{ tasks.length ? `${tasks.length} 项待处理` : '暂无待处理事项' }}</span></div>
        <RouterLink v-for="task in tasks" :key="`${task.kind}-${task.id}`" :to="task.to"><div><strong>{{ task.title }}</strong><p>{{ task.detail }}</p></div><AppIcon name="chevron" :size="18" /></RouterLink>
        <p v-if="!tasks.length" class="caption">可以继续完善简历，或了解新的岗位机会。</p>
      </section>
        <section class="surface recommendations">
          <div class="section-heading">
            <h2><AppIcon name="jobs" />值得了解的岗位</h2>
            <RouterLink to="/student/jobs" class="inline-link"
              >查看全部<AppIcon name="chevron" :size="14"
            /></RouterLink>
          </div>
          <RouterLink
            v-for="m in recommendations"
            :key="m.jobId"
            :to="`/student/jobs?job=${m.jobId}`"
            class="recommendation-row"
            ><JobArtwork :identity="m.jobId" :title="jobs.find((j) => j.id === m.jobId)?.title ?? ''" />
            <div>
              <h3>{{ jobs.find((j) => j.id === m.jobId)?.title }}</h3>
              <p>
                {{
                  companyLabel(jobs.find((j) => j.id === m.jobId)!.companyId)
                }}
                · {{ label(jobs.find((j) => j.id === m.jobId)!.cityId) }}
              </p>
              <span class="caption">{{
                m.dimensions[0]?.hits.map(skillLabel).join(" / ") ||
                "点击查看各维贡献"
              }}</span>
            </div>
            <ScoreRing :value="m.total" :size="64" label="匹配" /><AppIcon
              name="chevron"
              :size="16"
          /></RouterLink>
          <p v-if="!recommendations.length" class="muted">
            暂时没有可计算的岗位。请检查简历字段或前往岗位列表。
          </p>
        </section>
        <div class="home-side">
          <section class="surface">
            <div class="section-heading">
              <h2><AppIcon name="chart" />求职进度</h2>
            </div>
            <div class="funnel">
              <div v-for="(p, i) in progress" :key="p.label">
                <span
                  class="funnel-shape"
                  :style="{ width: `${100 - i * 25}%` }"
                ></span
                ><span>{{ p.label }}</span
                ><strong>{{ p.value }}</strong>
              </div>
            </div>
            <RouterLink to="/student/applications" class="inline-link"
              >查看投递时间轴<AppIcon name="chevron" :size="14"
            /></RouterLink>
            <p class="caption progress-caption">
              按当前投递状态统计，非累计历史转化率。
            </p>
          </section>
          <section class="surface radar-panel">
            <h3>准备度概览</h3>
            <RadarChart
              :values="
                diagnosis.dimensions.map((d) => ({
                  label: labels[d.key]!,
                  value: d.score,
                }))
              "
              title="简历六项完整度"
            />
          </section>
        </div>
      </div><aside class="overview-rail">
        <section class="surface overview-visual"><img src="/media/workbench/student-a-02.webp" alt="" width="384" height="341" /><div><h2>把经历，写成优势。</h2><p>从真实的经历开始，整理一份更清楚的简历。</p><RouterLink to="/student/resume" class="inline-link">完善简历<AppIcon name="arrow" :size="16" /></RouterLink></div></section>
        <section class="surface overview-visual"><img src="/media/workbench/student-a-12.webp" alt="" width="384" height="341" /><div><h2>选一个方向，先练起来。</h2><p>从岗位要求出发，在练习中找到更好的表达。</p><RouterLink to="/student/mock/practice" class="inline-link">题库快速练习<AppIcon name="arrow" :size="16" /></RouterLink></div></section>
        <section v-if="data?.supportTasks.length" class="surface personal-tasks" aria-label="辅导员行动计划"><h2>辅导员行动计划</h2><article v-for="task in data.supportTasks" :key="task.id"><p>{{ task.plan }}</p><p class="caption">{{ task.status === 'closed' ? '本次跟进已结案' : `下次复查：${new Date(task.nextReviewAt).toLocaleDateString('zh-CN')}` }}</p></article></section>
      </aside></div>
      <div class="overview-bottom">
        <section class="surface diagnosis">
          <div class="section-heading"><h2><AppIcon name="resume" />简历体检 · 六维度</h2><span class="caption">本地规则 1.0</span></div>
          <div class="diagnosis-body"><ScoreRing :value="diagnosis.total" /><div class="dimension-list"><div v-for="d in diagnosis.dimensions" :key="d.key"><span>{{ labels[d.key] }}</span><progress :value="d.score" max="100" :aria-label="`${labels[d.key]} ${d.score}分`"></progress><strong>{{ d.score }}</strong></div></div></div>
          <RouterLink class="home-primary-action" to="/student/resume">继续完善简历<AppIcon name="arrow" :size="18" /></RouterLink>
        </section>
        <section class="journey"><h2>你的下一步</h2><div class="journey-steps"><RouterLink v-for="step in [{ to: 'resume', name: '梳理经历', icon: 'resume' }, { to: 'jobs', name: '发现岗位', icon: 'jobs' }, { to: 'mock', name: '开始练习', icon: 'interview' }]" :key="step.to" :to="`/student/${step.to}`"><span><AppIcon :name="step.icon" :size="28" /></span><strong>{{ step.name }}</strong></RouterLink></div><RouterLink to="/student/jobs" class="inline-link">查看匹配岗位<AppIcon name="chevron" :size="14" /></RouterLink></section>
      </div>
    </template>
    <section v-else class="business-empty">
      <AppIcon name="resume" :size="40" />
      <h2>还没有可读取的个人简历</h2>
      <p>请刷新重试，或联系平台管理员。</p>
      <RouterLink to="/student/data-check">检查本机数据</RouterLink>
    </section>
    <footer class="business-footer">
      评分仅供参考，不替代个人就业决策
    </footer>
  </main>
</template>
<style scoped>
.overview-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:20px}.overview-kpis article{padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:15px}.overview-kpis span,.overview-kpis p{font-size:12px;color:var(--text-2)}.overview-kpis strong{display:block;font-size:32px;line-height:1.5;margin:9px 0;color:var(--text-1)}.overview-kpis small{font-size:14px;font-weight:400;margin-left:4px}.overview-layout{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:20px;align-items:start}.overview-main,.overview-rail{display:grid;gap:20px;min-width:0}.overview-main>.personal-tasks{margin:0}.overview-main>.home-side{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:20px}.overview-visual{padding:0;overflow:hidden}.overview-visual>img{width:100%;height:180px;object-fit:contain;background:#edf5ff;display:block}.overview-visual>div{padding:22px}.overview-visual p{font-size:13px;line-height:1.9;color:var(--text-2);margin:10px 0 16px}.overview-bottom{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-top:20px}.overview-bottom .dimension-list>div{grid-template-columns:64px minmax(0,1fr) 24px}.overview-bottom .diagnosis-body{gap:16px}.recommendations .recommendation-row :deep(.job-artwork){width:106px;height:74px}.overview-main .recommendation-row{gap:14px}.overview-main .recommendation-row>div:nth-child(2){flex:1}
@media(max-width:1199px){.overview-layout{grid-template-columns:minmax(0,1fr) 250px}.overview-main>.home-side,.overview-bottom{grid-template-columns:minmax(0,1fr)}.overview-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:767px){.overview-layout{grid-template-columns:minmax(0,1fr)}.overview-kpis{gap:10px}.overview-kpis article{padding:15px}.overview-kpis strong{font-size:27px}.overview-main .recommendation-row{flex-wrap:wrap}.overview-main .recommendation-row>div:nth-child(2){min-width:120px}.overview-bottom .diagnosis-body{flex-wrap:wrap}.overview-bottom .dimension-list{min-width:175px}}
.personal-tasks{padding:24px;margin-bottom:24px}.personal-tasks>a{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:16px 0;border-top:1px solid var(--border);color:var(--text-1);font-size:14px}.personal-tasks p{font-size:12px;color:var(--text-2);margin-top:8px;line-height:1.8}
.home-date {
  display: grid;
  gap: 8px;
  font-size: 12px;
  text-align: right;
  color: var(--text-3);
  padding-top: 8px;
}
.home-date strong {
  font-weight: 500;
  color: var(--brand-text);
}
.home-primary {
  display: grid;
  grid-template-columns: minmax(380px, 5fr) minmax(0, 7fr);
  gap: 24px;
  margin-bottom: 24px;
}
.diagnosis-body {
  display: flex;
  align-items: center;
  gap: 24px;
  margin: 32px 0;
}
.dimension-list {
  display: grid;
  gap: 14px;
  flex: 1;
}
.dimension-list > div {
  display: grid;
  grid-template-columns: 64px 1fr;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--text-2);
}
progress {
  width: 100%;
  height: 5px;
  border: none;
  border-radius: 8px;
  overflow: hidden;
  appearance: none;
  background: var(--surface-2);
}
progress::-webkit-progress-bar {
  background: var(--surface-2);
}
progress::-webkit-progress-value {
  background: var(--brand-text);
  border-radius: 8px;
}
.home-primary-action {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: var(--brand);
  color: var(--on-brand);
  border-radius: var(--r-control);
  font-size: 14px;
}
.home-primary-action:hover {
  background: var(--brand-700);
  text-decoration: none;
}
.journey {
  background: var(--brand-soft);
  border-radius: var(--r-card);
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.journey h2 {
  font-size: 24px;
  margin-bottom: 12px;
}
.journey > p {
  font-size: 14px;
  color: var(--text-2);
}
.journey > .inline-link {
  align-self: center;
  margin-top: 24px;
}
.journey-steps {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  position: relative;
  margin: 32px 0 8px;
}
.journey-steps::before {
  content: "";
  position: absolute;
  top: 32px;
  left: 12%;
  right: 12%;
  height: 2px;
  background: var(--border);
}
.journey-steps > a {
  display: grid;
  justify-items: center;
  gap: 16px;
  z-index: 1;
  color: var(--text-1);
  font-size: 14px;
}
.journey-steps > a:hover {
  color: var(--brand-text);
  text-decoration: none;
}
.journey-steps span {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  background: var(--surface);
  color: var(--brand-text);
  border-radius: 50%;
  box-shadow: var(--sh-1);
}
.home-secondary {
  display: grid;
  grid-template-columns: minmax(0, 8fr) minmax(300px, 4fr);
  gap: 24px;
}
.recommendation-row {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 24px 0;
  border-bottom: 1px solid var(--border);
  color: var(--text-1);
}
.recommendation-row:hover {
  text-decoration: none;
}
.recommendation-row:last-child {
  border: 0;
}
.recommendation-row > div:nth-child(2) {
  flex: 1;
  min-width: 0;
}
.recommendation-row p {
  font-size: 12px;
  color: var(--text-2);
  margin: 8px 0;
}
.recommendation-row h3 {
  line-height: 1.6;
}
.row-number {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  font: 12px var(--font-mono);
  background: var(--brand-soft);
  color: var(--brand-text);
  border-radius: 50%;
  flex: none;
}
.home-side {
  display: grid;
  gap: 24px;
}
.funnel {
  display: grid;
  gap: 16px;
  margin-bottom: 24px;
}
.funnel > div {
  display: grid;
  grid-template-columns: 1fr 80px 32px;
  gap: 16px;
  align-items: center;
  font-size: 12px;
}
.funnel strong {
  font: 16px var(--font-mono);
}
.funnel-shape {
  display: block;
  height: 24px;
  background: var(--brand-text);
  clip-path: polygon(0 0, 100% 0, 88% 100%, 12% 100%);
}
.funnel > div:nth-child(2) .funnel-shape {
  background: var(--ai);
}
.funnel > div:nth-child(3) .funnel-shape {
  background: var(--teal);
}
.progress-caption {
  margin-top: 16px;
}
.radar-panel {
  padding-bottom: 8px;
}
.radar-panel h3 {
  font-size: 14px;
}
@media (max-width: 1199px) {
  .home-primary {
    grid-template-columns: 1fr 1fr;
  }
  .diagnosis-body {
    gap: 16px;
  }
  .diagnosis-body :deep(.score-ring) {
    width: 88px !important;
    height: 88px !important;
  }
  .home-secondary {
    grid-template-columns: 1fr;
  }
  .home-side {
    grid-template-columns: 1fr 1fr;
  }
  .journey {
    padding: 24px;
  }
  .journey-steps {
    gap: 12px;
  }
}
@media (max-width: 767px) {
  .home-date {
    text-align: left;
    padding: 0;
  }
  .home-primary,
  .home-side {
    grid-template-columns: 1fr;
  }
  .journey {
    min-height: 320px;
  }
  .recommendation-row {
    gap: 12px;
  }
  .recommendation-row .caption {
    display: none;
  }
  .home-primary {
    gap: 16px;
  }
  .home-secondary {
    gap: 16px;
  }
  .home-side {
    gap: 16px;
  }
}
</style>
