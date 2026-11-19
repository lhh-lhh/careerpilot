<script setup lang="ts">
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import { computed, ref, shallowRef, watch, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import { useStudentData } from "../../composables/useStudentData";
import { useBusinessAi } from "../../composables/useBusinessAi";
import { matchInWorker } from "../../services/matching-worker";
import {
  DEFAULT_WEIGHTS,
  normalizeWeights,
  whatIf,
} from "../../domain/matching/scoring";
import { fixedClock } from "../../domain/clock";
import { matchingRequestInput } from "../../services/ai-requests";
import { appRepository, onDomainChange } from "../../services/app-services";
import { api } from "../../adapters/repository/http";
import { useSessionStore } from "../../stores/session";
import type { Job, MatchExplanation } from "../../types/entities";
import AppButton from "../../components/base/AppButton.vue";
import AppInput from "../../components/base/AppInput.vue";
import AppSelect from "../../components/base/AppSelect.vue";
import AppIcon from "../../components/base/AppIcon.vue";
import AppDrawer from "../../components/base/AppDrawer.vue";
import AppModal from "../../components/base/AppModal.vue";
import AppSkeleton from "../../components/base/AppSkeleton.vue";
import AiBlock from "../../components/base/AiBlock.vue";
import AiConsentDialog from "../../components/business/AiConsentDialog.vue";
import ScoreRing from "../../components/charts/ScoreRing.vue";
import EntityMark from "../../components/base/EntityMark.vue";
import JobArtwork from "../../components/base/JobArtwork.vue";
import { jobArtworkBatch } from '../../presentation/job-artwork';
import ResumeCard from '../../components/business/ResumeCard.vue';
import { businessNow, isOnline } from "../../services/runtime";
import { filterJobs, salaryError, type JobFilters } from '../../domain/jobs/filtering';
const { data, catalog, jobs, loading, error, label, skillLabel, companyLabel } =
    useStudentData(),
  session = useSessionStore(),
  route = useRoute(),
  ai = useBusinessAi();
const resume = computed(() => data.value?.resumes[0]),
  query = ref(""),
  city = ref(""),
  salary = ref(""),
  salaryMin = ref(''), salaryMax = ref(''),
  weights = ref<number[]>([...DEFAULT_WEIGHTS]);
const results = shallowRef<MatchExplanation[]>([]),
  computing = ref(false),
  selected = ref<Job | null>(null),
  applyJob = ref<Job | null>(null),
  consented = ref(false),
  sending = ref(false),
  notice = ref(""),
  hypotheses = ref<string[]>([]);
const resumeLabel=(id:string)=>catalog.value?.skills.find(s=>s.id===id)?.canonical??label(id);
const keys = ["skill", "major", "degree", "city", "salary", "experience"],
  names: Record<string, string> = {
    skill: "技能",
    major: "专业",
    degree: "学历",
    city: "城市",
    salary: "薪资",
    experience: "经验",
  };
let generation = 0;
watch(
  [resume, jobs, catalog, weights],
  async () => {
    if (!resume.value || !catalog.value) return;
    const id = ++generation;
    computing.value = true;
    try {
      const r = await matchInWorker({
        resume: structuredClone(resume.value),
        jobs: structuredClone(jobs.value),
        skills: structuredClone(catalog.value.skills),
        dictionaries: structuredClone(catalog.value.dictionaries),
        now: businessNow(),
        weights: [...weights.value],
      });
      if (id === generation) results.value = r.results;
    } catch {
      /* 保留最近一次完整匹配结果。 */
    } finally {
      if (id === generation) computing.value = false;
    }
  },
  { deep: true },
);
const normalized = computed(() => normalizeWeights(weights.value));
const bookmarks = ref<string[]>([]), savedOnly = ref(false), bookmarkBusy = ref(false);
async function loadBookmarks() {
  if (!isOnline) return;
  try { bookmarks.value = await api<string[]>("/api/bookmarks"); }
  catch { notice.value = "收藏暂时无法读取，请稍后重试。"; }
}
async function toggleBookmark(jobId: string) {
  if (bookmarkBusy.value) return;
  bookmarkBusy.value = true;
  try { bookmarks.value = await api<string[]>("/api/bookmarks", { jobId, saved: !bookmarks.value.includes(jobId) }); }
  catch { notice.value = "收藏未保存，请检查连接后重试。"; }
  finally { bookmarkBusy.value = false; }
}
onMounted(loadBookmarks);
const unsubscribeBookmarks = onDomainChange(() => void loadBookmarks());
onUnmounted(unsubscribeBookmarks);
const filters=computed<JobFilters>(()=>{
  const f:JobFilters={query:query.value,cityId:city.value};
  if(salary.value==='negotiable')f.negotiableOnly=true;
  else if(salary.value==='custom'){if(String(salaryMin.value).trim())f.salaryMin=Number(salaryMin.value);if(String(salaryMax.value).trim())f.salaryMax=Number(salaryMax.value);}
  else if(salary.value){const [min,max]=salary.value.split('-');if(min)f.salaryMin=Number(min);if(max)f.salaryMax=Number(max);}
  return f;
});
const filterError=computed(()=>salaryError(filters.value));
const filtered = computed(() => filterJobs(jobs.value,filters.value,companyLabel)
  .filter(j=>!savedOnly.value||bookmarks.value.includes(j.id))
  .map(job=>({job,match:results.value.find(m=>m.jobId===job.id)}))
  .sort((a,b)=>(b.match?.total??-1)-(a.match?.total??-1)||a.job.id.localeCompare(b.job.id)));
function clearFilters(){query.value='';city.value='';salary.value='';salaryMin.value='';salaryMax.value='';savedOnly.value=false;}
const selectedMatch = computed(() =>
  results.value.find((m) => m.jobId === selected.value?.id),
);
const comparison = computed(() => {
  if (
    !resume.value ||
    !catalog.value ||
    !selected.value ||
    !hypotheses.value.length
  )
    return null;
  return (
    whatIf(
      resume.value,
      jobs.value,
      [...hypotheses.value],
      weights.value,
      catalog.value.skills,
      catalog.value.dictionaries,
      businessNow(),
    ).find((r) => r.jobId === selected.value!.id) ?? null
  );
});
function explain(job: Job) {
  selected.value = job;
  hypotheses.value = [];
  ai.stop();
  ai.response.value = null;
}
watch(results, () => {
  if (route.query.job && !selected.value) {
    const job = jobs.value.find((j) => j.id === route.query.job);
    if (job) explain(job);
  }
});
const applied = (id: string) =>
  data.value?.applications.some(
    (a) => a.jobId === id && !["withdrawn", "rejected"].includes(a.status),
  );
function openApply(job: Job) {
  applyJob.value = job;
  consented.value = false;
}
async function apply() {
  if (!applyJob.value || !session.actor || !consented.value) return;
  sending.value = true;
  try {
    await appRepository.execute(
      {
        type: "APPLY",
        commandId: crypto.randomUUID(),
        entityId: crypto.randomUUID(),
        expectedRevision: 0,
        payload: { jobId: applyJob.value.id, resumeConsent: true },
      },
      session.actor,
      fixedClock,
    );
    applyJob.value = null;
    notice.value = "投递成功。当前简历快照与匹配依据已固定，可到我的投递查看。";
  } catch {
    notice.value =
      "投递未完成，可能已投递、岗位已关闭或存在签约限制。未重复写入，请刷新核对。";
  } finally {
    sending.value = false;
  }
}
async function generate() {
  if (resume.value && selected.value && selectedMatch.value)
    await ai.generate(
      "A3",
      "explain",
      matchingRequestInput(resume.value, selected.value, selectedMatch.value),
    );
}
const explanation = computed(() => {
  const payload = ai.response.value?.data;
  if (payload?.module !== "A3" || !selectedMatch.value) return "";
  return payload.text
    .replace(/\{\{match:total\}\}/g, String(selectedMatch.value.total))
    .replace(/\{\{dimension:([^}]+)\}\}/g, (_match, key: string) =>
      String(
        selectedMatch.value!.dimensions.find((d) => d.key === key)
          ?.contribution ?? "—",
      ),
    );
});
const money = (job: Job) =>
  job.salaryRange
    ? `${(job.salaryRange.min / 1000).toFixed(0)}–${(job.salaryRange.max / 1000).toFixed(0)}k / 月`
    : "薪资未填写";
</script>
<template>
  <main id="main-content" class="business-page jobs-page ui-scene ui-scene--journey">
    <WorkbenchHeader>
      <template #heading><div>
        <p class="kicker">岗位匹配 · CAREER JOURNEY</p>
        <h1>找到适合你的下一站。</h1>
        <p>岗位事实、规则匹配依据与AI建议分开呈现，选择始终由你作出。</p>
      </div></template>
      <template #actions><RouterLink to="/student/resume" class="inline-link"
        >更新我的简历<AppIcon name="arrow" :size="16"
      /></RouterLink></template>
    </WorkbenchHeader>
    <nav v-if="isOnline" class="external-discovery"><RouterLink to="/student/jobs/matches">进行AI岗位匹配 · 独立结果页</RouterLink></nav>
    <nav v-if="isOnline" class="external-discovery"><RouterLink :to="{path:'/opportunities',query:{source:'external',...(query?{q:query}:{})}}">浏览国家平台机会</RouterLink><RouterLink to="/student/opportunities">我的求职记录</RouterLink></nav>
    <p v-if="notice" class="business-notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <AppSkeleton v-else-if="loading" />
    <div v-else class="jobs-layout">
      <aside class="filter-rail no-print">
        <h2>找到适合的方向</h2>
        <AppInput
          v-model="query"
          label="搜索岗位或企业"
          placeholder="岗位名称、企业或关键词"
        /><AppSelect
          v-model="city"
          label="工作城市"
          :options="[
            { value: '', label: '全部城市' },
            ...(catalog?.dictionaries
              .filter((d) => d.kind === 'city')
              .map((d) => ({ value: d.id, label: d.label })) ?? []),
          ]"
        /><AppSelect
          v-model="salary"
          label="薪资范围"
          :options="[
            { value: '', label: '不限薪资' },
            { value: '0-3000', label: '3k以下' },
            { value: '3000-5000', label: '3–5k / 月' },
            { value: '5000-8000', label: '5–8k / 月' },
            { value: '8000-10000', label: '8–10k / 月' },
            { value: '10000-15000', label: '10–15k / 月' },
            { value: '15000-20000', label: '15–20k / 月' },
            { value: '20000-30000', label: '20–30k / 月' },
            { value: '30000-', label: '30k以上' },
            { value: 'negotiable', label: '面议 / 未披露' },
            { value: 'custom', label: '自定义范围' },
          ]"
        />
        <template v-if="salary==='custom'"><AppInput v-model="salaryMin" label="最低月薪筛选" type="number" placeholder="不限下限" /><AppInput v-model="salaryMax" label="最高月薪筛选" type="number" placeholder="不限上限" /></template>
        <p class="caption">税前元/月；与岗位薪资区间有交集即显示。无金额筛选时包含面议岗位。</p>
        <p v-if="filterError" role="alert">{{ filterError }}</p>
        <label v-if="isOnline"><input v-model="savedOnly" type="checkbox" /> 只看收藏</label>
        <div class="weight-controls">
          <h3>什么对你更重要？</h3>
          <p class="caption">权重自动归一化，总和始终为 100%。</p>
          <label v-for="(key, i) in keys" :key="key"
            ><span
              >{{ names[key]
              }}<strong>{{ (normalized[i]! * 100).toFixed(1) }}%</strong></span
            ><input
              v-model.number="weights[i]"
              type="range"
              min="0"
              max="100"
              step="1"
              :aria-label="`${names[key]}权重`" /></label
          ><AppButton
            variant="secondary"
            size="sm"
            @click="weights = [...DEFAULT_WEIGHTS]"
            >重置权重</AppButton
          >
        </div>
      </aside>
      <section class="job-results" :aria-busy="computing">
        <div class="results-heading">
          <p>
            <strong class="data-number">{{ filtered.length }}</strong>
            个岗位值得了解
          </p>
          <span class="caption">{{
            computing ? "正在重新计算…" : "按真实匹配分排序 · 同分按岗位编号"
          }}</span>
        </div>
        <article v-for="(row, artworkIndex) in filtered" :key="row.job.id" class="job-row">
          <div class="job-row-main">
            <div class="job-visual"><JobArtwork :title="row.job.title" :identity="row.job.id" :src="jobArtworkBatch(filtered.map(row=>({id:row.job.id,title:row.job.title})))[artworkIndex]" /><EntityMark :id="row.job.companyId" :name="companyLabel(row.job.companyId)" /></div>
            <div class="job-title">
              <h2>{{ row.job.title }}</h2>
              <p>
                {{ companyLabel(row.job.companyId) }}<span>·</span
                >{{ label(row.job.cityId) }}
              </p>
            </div>
            <strong class="job-salary">{{ money(row.job) }}</strong>
          </div>
          <p class="job-description">{{ row.job.jdText }}</p>
          <div class="job-skills">
            <span
              v-for="skill in row.job.requiredSkills"
              :key="skill.skillId"
              >{{ skillLabel(skill.skillId) }}</span
            ><span>{{ row.job.minDegree ? label(`degree-${row.job.minDegree}`) : '学历不限' }}</span>
          </div>
          <footer>
            <div class="job-match">
              <ScoreRing
                v-if="row.match" :value="row.match.total"
                :size="64"
                label="匹配"
              /><span
                >{{ row.match ? '规则匹配' : '匹配计算待完成，可先浏览岗位' }}</span
              >
            </div>
            <div class="page-actions">
              <AppButton v-if="isOnline" variant="secondary" :disabled="bookmarkBusy" :aria-pressed="bookmarks.includes(row.job.id)" @click="toggleBookmark(row.job.id)">{{ bookmarks.includes(row.job.id) ? '取消收藏' : '收藏岗位' }}</AppButton>
              <AppButton variant="secondary" @click="explain(row.job)"
                >查看匹配依据</AppButton
              ><AppButton
                :disabled="applied(row.job.id)||!resume?.sections.education.length"
                @click="openApply(row.job)"
                >{{
                  applied(row.job.id) ? "已在投递流程" : !resume?.sections.education.length ? '请先完善教育经历' : "投递岗位"
                }}</AppButton
              >
            </div>
          </footer>
        </article>
        <section v-if="!filtered.length" class="business-empty">
          <AppIcon name="jobs" :size="40" />
          <h2>暂时没有匹配此筛选的岗位</h2>
          <p>试试减少关键词或放宽城市、薪资条件。</p>
          <AppButton
            variant="secondary"
            @click="clearFilters"
            >清空筛选</AppButton
          >
        </section>
      </section>
    </div>
    <AppDrawer data-scene="studio"
      :open="!!selected"
      title="每一分，都有依据"
      @close="
        selected = null;
        ai.stop();
      "
      ><div v-if="selected && selectedMatch" class="explain-content">
        <div class="explain-intro">
          <ScoreRing :value="selectedMatch.total" />
          <div>
            <h3>{{ selected.title }}</h3>
            <p>
              {{ companyLabel(selected.companyId) }} ·
              {{ label(selected.cityId) }}
            </p>
            <p class="caption">
              算法 1.0 · 分数贡献合计 {{ selectedMatch.total }}
            </p>
          </div>
        </div>
        <h3>六维贡献</h3>
        <details
          v-for="d in selectedMatch.dimensions"
          :key="d.key"
          class="contribution"
        >
          <summary>
            <span
              >{{ names[d.key]
              }}<small>权重 {{ (d.weight * 100).toFixed(1) }}%</small></span
            ><strong>+{{ d.contribution.toFixed(1) }}</strong>
          </summary>
          <progress
            :value="d.score * 100"
            max="100"
            :aria-label="`${names[d.key]}得分比例`"
          />
          <p>命中：{{ d.hits.map(skillLabel).join(" / ") || "无命中项" }}</p>
          <p>
            缺失：{{ d.misses.map(skillLabel).join(" / ") || "无缺失项"
            }}{{ d.missingData ? " · 此维存在缺失数据" : "" }}
          </p>
        </details>
        <section class="what-if">
          <h3>如果补齐一项技能？</h3>
          <p>仅作假设试算，不更改简历、原始分数或投递快照。</p>
          <label
            v-for="skill in catalog?.skills.filter(
              (s) => !resume?.sections.skills.some((o) => o.skillId === s.id),
            )"
            :key="skill.id"
            ><input v-model="hypotheses" type="checkbox" :value="skill.id" />{{
              skill.canonical
            }}</label
          >
          <p
            v-if="
              !catalog?.skills.some(
                (s) => !resume?.sections.skills.some((o) => o.skillId === s.id),
              )
            "
            class="caption"
          >
            当前已填写所有示例技能。请仅保留真实掌握的技能。
          </p>
          <div v-if="comparison" class="what-if-result">
            <strong
              >{{ comparison.before.total }} →
              {{ comparison.after.total }}</strong
            ><span
              >排名 {{ comparison.rankBefore }} → {{ comparison.rankAfter }} ·
              预期贡献 +{{ comparison.delta }}</span
            >
          </div>
        </section>
        <AppButton :disabled="ai.busy.value" @click="generate"
          >生成文字解释</AppButton
        ><AppButton v-if="ai.busy.value" variant="secondary" @click="ai.stop"
          >停止生成</AppButton
        >
        <p v-if="ai.busy.value" aria-live="polite">{{ ai.text.value }}</p>
        <AiBlock
          v-if="ai.response.value"
          :mode="ai.response.value.effectiveMode"
          :trace-id="ai.response.value.traceId"
          :provenance="ai.response.value.provenance"
          :origin="ai.response.value.origin"
          :reason="ai.response.value.fallbackReason ?? undefined"
          ><p>{{ explanation }}</p>
          <template #evidence
            >所有数值由上方六维贡献提供，文字解释无权修改匹配分。</template
          ></AiBlock
        >
        <p v-if="ai.error.value" role="alert">{{ ai.error.value }}</p>
      </div></AppDrawer
    >
    <AppModal data-scene="governance"
      :open="!!applyJob"
      title="确认投递当前简历"
      @close="applyJob = null"
      ><div v-if="applyJob" class="apply-copy">
        <h3>{{ applyJob.title }} · {{ companyLabel(applyJob.companyId) }}</h3>
        <p>
          本次提供当前已保存的简历版本
          {{ resume?.versionIds.length }}。之后的简历修改不会覆盖这份投递快照。
        </p>
        <ResumeCard v-if="resume" :sections="{...resume.sections,basic:{...resume.sections.basic,email:'[已脱敏]'}}" :label="resumeLabel" :target-title="applyJob.title" :exportable="false" />
        <label
          ><input
            v-model="consented"
            type="checkbox"
          />同意向该企业提供当前简历快照</label
        >
      </div>
      <template #footer
        ><AppButton variant="secondary" @click="applyJob = null">取消</AppButton
        ><AppButton :disabled="!consented" :loading="sending" @click="apply"
          >确认投递</AppButton
        ></template
      ></AppModal
    >
    <AiConsentDialog
      :open="ai.consentOpen.value"
      :preview="ai.preview.value"
      @close="ai.stop"
      @confirm="ai.confirm"
    />
  </main>
</template>
<style scoped>
.external-discovery{display:flex;gap:24px;flex-wrap:wrap;margin:24px 0;font-size:15px}.external-discovery a{min-height:44px;display:flex;align-items:center}
.jobs-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 32px;
  align-items: start;
}
.filter-rail {
  display: grid;
  gap: 24px;
  position: sticky;
  top: 24px;
}
.filter-rail h2 {
  font-size: 16px;
}
.weight-controls {
  border-top: 1px solid var(--border);
  padding-top: 24px;
  display: grid;
  gap: 20px;
}
.weight-controls label {
  display: grid;
  gap: 8px;
}
.weight-controls label > span {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-2);
}
.weight-controls strong {
  font: 12px var(--font-mono);
}
input[type="range"] {
  accent-color: var(--brand-text);
  width: 100%;
  height: 20px;
}
.results-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  gap: 16px;
  font-size: 14px;
}
.results-heading strong {
  font-size: 20px;
}
.job-row {
  padding: 28px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  margin-bottom: 20px;
  transition: box-shadow var(--t-fast);
}
.job-row:hover {
  box-shadow: var(--sh-2);
}
.job-row-main {
  display: flex;
  align-items: center;
  gap: 16px;
}
.job-company-mark {
  display: grid;
  place-items: center;
  background: var(--brand-soft);
  color: var(--brand-text);
  width: 48px;
  height: 48px;
  font-size: 20px;
  font-weight: 600;
  border-radius: 12px;
  flex: none;
}
.job-title {
  flex: 1;
}
.job-title h2 {
  font-size: 20px;
  line-height: 1.6;
}
.job-title p {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-2);
  margin-top: 4px;
}
.job-salary {
  font: 600 16px var(--font-mono);
  color: var(--brand-text);
  white-space: nowrap;
}
.job-description {
  font-size: 14px;
  color: var(--text-2);
  margin: 24px 0 16px;
  line-height: 1.9;
}
.job-skills {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.job-skills span {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  font-size: 12px;
  color: var(--text-2);
}
.job-row > footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
  gap: 16px;
}
.job-match {
  display: flex;
  align-items: center;
  gap: 12px;
}
.job-match > span {
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.8;
}
.job-match small {
  font-size: 12px;
  color: var(--text-3);
}
.job-match :deep(.score-ring strong) {
  font-size: 20px;
}
.job-match :deep(.score-ring span) {
  font-size: 10px;
}
.explain-content {
  display: grid;
  gap: 24px;
  font-size: 14px;
}
.explain-intro {
  display: flex;
  align-items: center;
  gap: 24px;
}
.explain-intro p {
  margin-top: 8px;
  line-height: 1.8;
  color: var(--text-2);
}
.contribution {
  border-bottom: 1px solid var(--border);
  padding-bottom: 16px;
}
.contribution summary {
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.contribution small {
  color: var(--text-3);
  margin-left: 12px;
  font-size: 12px;
}
.contribution strong {
  font: 16px var(--font-mono);
  color: var(--brand-text);
}
.contribution progress {
  width: 100%;
  height: 6px;
  accent-color: var(--brand-text);
  margin: 12px 0;
}
.contribution p {
  font-size: 12px;
  line-height: 1.8;
  color: var(--text-2);
}
.what-if {
  display: grid;
  gap: 16px;
  background: var(--surface-2);
  padding: 20px;
  border-radius: var(--r-card);
}
.what-if p {
  font-size: 12px;
  line-height: 1.8;
  color: var(--text-2);
}
.what-if label {
  display: flex;
  gap: 12px;
  font-size: 14px;
}
.what-if-result {
  display: grid;
  gap: 12px;
}
.what-if-result strong {
  font: 24px var(--font-mono);
  color: var(--brand-text);
}
.what-if-result span {
  font-size: 12px;
}
.apply-copy {
  display: grid;
  gap: 24px;
  font-size: 14px;
  line-height: 1.8;
}
.apply-copy label {
  display: flex;
  align-items: center;
  gap: 12px;
}
@media (max-width: 1100px) {
  .jobs-layout {
    grid-template-columns: 200px minmax(0, 1fr);
    gap: 24px;
  }
  .job-row {
    padding: 24px;
  }
  .job-row > footer {
    align-items: flex-start;
  }
  .job-row .page-actions {
    justify-content: flex-end;
  }
  .job-salary {
    font-size: 14px;
  }
}
@media (max-width: 767px) {
  .jobs-layout {
    grid-template-columns: 1fr;
  }
  .filter-rail {
    position: static;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .filter-rail > h2,
  .filter-rail > :nth-child(2),
  .weight-controls {
    grid-column: 1/-1;
  }
  .weight-controls {
    grid-template-columns: 1fr 1fr;
  }
  .weight-controls h3,
  .weight-controls > p,
  .weight-controls > .app-button {
    grid-column: 1/-1;
  }
  .job-row {
    padding: 20px;
  }
  .job-row-main {
    flex-wrap: wrap;
  }
  .job-salary {
    margin-left: 64px;
  }
  .job-title h2 {
    font-size: 16px;
  }
  .job-row > footer {
    flex-wrap: wrap;
  }
  .job-row .page-actions {
    width: 100%;
    justify-content: space-between;
  }
  .results-heading {
    align-items: flex-start;
  }
  .results-heading .caption {
    max-width: 130px;
    text-align: right;
  }
  .job-match :deep(.score-ring strong) {
    font-size: 20px;
  }
}
</style>
