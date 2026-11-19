<script setup lang="ts">
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useStudentData } from "../../composables/useStudentData";
import { useBusinessAi } from "../../composables/useBusinessAi";
import { interviewRequestInput } from "../../services/ai-requests";
import { nextFollowUp } from "../../domain/interview/scoring";
import { fixedClock } from "../../domain/clock";
import { isOnline } from "../../services/runtime";
import { appRepository } from "../../services/app-services";
import { useSessionStore } from "../../stores/session";
import type { MockSession } from "../../types/entities";
import AppButton from "../../components/base/AppButton.vue";
import AppIcon from "../../components/base/AppIcon.vue";
import AppModal from "../../components/base/AppModal.vue";
import AppSkeleton from "../../components/base/AppSkeleton.vue";
import AppTag from "../../components/base/AppTag.vue";
import AiBlock from "../../components/base/AiBlock.vue";
import AiConsentDialog from "../../components/business/AiConsentDialog.vue";
import { interviewTemplates } from '../../data/interview-templates';

const { data, catalog, jobs, loading, error, companyLabel, label, load } =
  useStudentData();
const session = useSessionStore();
const router = useRouter();
const selectedJobId = ref("");
const answer = ref("");
const notice = ref("");
const submitting = ref(false);
const finishOpen = ref(false);
const ai = useBusinessAi();
const followAnswer = ref("");
const assistance = ref<{ sessionId: string; revision: number; questionId: string; operation: "question" | "followUp" } | null>(null);

const sessions = computed(() => data.value?.mockSessions ?? []);
const active = computed(
  () =>
    sessions.value
      .filter((item) => ["inProgress", "paused"].includes(item.state))
      .sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
      )[0],
);
const targetJob = computed(() => {
  const id = active.value?.targetJobId ?? selectedJobId.value;
  return jobs.value.find((job) => job.id === id) ?? jobs.value[0];
});
const currentQuestion = computed(() => {
  if (!active.value || !catalog.value) return null;
  return catalog.value.questions.find(
    (question) =>
      question.id === active.value!.questionIds[active.value!.questionIndex],
  );
});
const localCue = computed(() =>
  currentQuestion.value && answer.value.trim()
    ? nextFollowUp(
        currentQuestion.value,
        answer.value.trim(),
        active.value?.followUpCount ?? 0,
      )
    : null,
);
const previousQuestion = computed(() => {
  const current = active.value;
  if (!current || current.followUpCount >= 2) return null;
  const id = current.questionIds[current.questionIndex - 1];
  return current.answers.some(a => a.questionId === id && a.kind === 'answer' && a.text.trim())
    ? catalog.value?.questions.find(q => q.id === id) ?? null : null;
});
const usableAssistance = computed(() => {
  const captured = assistance.value, current = active.value, response = ai.response.value;
  return captured && current?.id === captured.sessionId && current.revision === captured.revision && response?.data.module === 'A2'
    ? response : null;
});
const completed = computed(() =>
  sessions.value
    .filter((item) => item.state === "completed" && item.report)
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id),
    ),
);
const questionType: Record<string, string> = {
  behavior: "经历复盘",
  technical: "能力说明",
  hr: "动机与协作",
};

async function command(
  current: MockSession,
  action: "START" | "PAUSE" | "RESUME" | "SUBMIT_ANSWER" | "SKIP" | "END_EARLY" | "FOLLOW_UP",
  text?: string,
) {
  if (!session.actor) return null;
  return appRepository.execute(
    {
      type: "MOCK_ACTION",
      commandId: crypto.randomUUID(),
      entityId: current.id,
      expectedRevision: current.revision,
      payload: { action, ...(text === undefined ? {} : { text }) },
    },
    session.actor,
    fixedClock,
  );
}

async function generateAssistance(operation: "question" | "followUp") {
  const current = active.value, question = operation === 'question' ? currentQuestion.value : previousQuestion.value;
  if (!current || current.state !== 'inProgress' || !question || !targetJob.value || submitting.value) return;
  assistance.value = { sessionId: current.id, revision: current.revision, questionId: question.id, operation };
  ai.response.value = null;
  followAnswer.value = '';
  await ai.generate('A2', operation, interviewRequestInput(current, question, targetJob.value,
    data.value?.resumes.flatMap(r => [r.sections.basic.name, r.sections.basic.email]) ?? []));
}

async function submitFollowUp() {
  const current = active.value, captured = assistance.value;
  if (!current || current.state !== 'inProgress' || !captured || captured.operation !== 'followUp' || !usableAssistance.value || !followAnswer.value.trim() || submitting.value) return;
  submitting.value = true; notice.value = '';
  try {
    await command({ ...current, revision: captured.revision }, 'FOLLOW_UP', followAnswer.value);
    followAnswer.value = ''; assistance.value = null;
    await load(); notice.value = '补充回答已保存。';
  } catch { notice.value = '补充回答未保存，请刷新核对练习进度；输入仍保留。'; }
  finally { submitting.value = false; }
}

async function start() {
  if (!session.actor || !targetJob.value || submitting.value) return;
  submitting.value = true;
  notice.value = "";
  try {
    let ready = sessions.value.find(
      (item) =>
        item.state === "ready" && item.targetJobId === targetJob.value!.id,
    );
    if (!ready) {
      const id = crypto.randomUUID();
      await appRepository.execute(
        {
          type: "CREATE_MOCK",
          commandId: crypto.randomUUID(),
          entityId: id,
          expectedRevision: 0,
          payload: { targetJobId: targetJob.value.id },
        },
        session.actor,
        fixedClock,
      );
      ready = {
        id,
        revision: 1,
        createdAt: fixedClock.now(),
        updatedAt: fixedClock.now(),
        studentId: data.value!.students[0]!.id,
        targetJobId: targetJob.value.id,
        resumeVersionId: data.value!.resumes[0]!.versionIds.at(-1)!,
        state: "ready",
        questionIds: [],
        questionIndex: 0,
        answers: [],
        followUpCount: 0,
        report: null,
        rubricVersion: "1.0",
      };
    }
    await command(ready, "START");
    answer.value = "";
    await load();
  } catch {
    notice.value = "练习未能开始。可能有其他页面更新了进度，请刷新后重试。";
  } finally {
    submitting.value = false;
  }
}

async function resume() {
  if (!active.value) return;
  submitting.value = true;
  try {
    await command(active.value, "RESUME");
    await load();
  } catch {
    notice.value = "练习状态已变化，请刷新后继续。";
  } finally {
    submitting.value = false;
  }
}

async function submit(action: "SUBMIT_ANSWER" | "SKIP") {
  if (!active.value || submitting.value) return;
  const current = active.value;
  submitting.value = true;
  notice.value = "";
  try {
    const result = await command(
      current,
      action,
      action === "SUBMIT_ANSWER" ? answer.value : undefined,
    );
    answer.value = "";
    if (
      result &&
      typeof result === "object" &&
      !Array.isArray(result) &&
      result.state === "completed"
    ) {
      await router.push(`/student/mock/report?id=${current.id}`);
      return;
    }
    await load();
  } catch {
    notice.value = "本题未提交。进度没有重复写入，请刷新后核对。";
  } finally {
    submitting.value = false;
  }
}

async function pause() {
  if (!active.value) return;
  submitting.value = true;
  try {
    await command(active.value, "PAUSE");
    answer.value = "";
    await load();
    notice.value = "练习已暂停，已提交的回答已保存。";
  } catch {
    notice.value = "暂停未完成，请刷新后核对当前状态。";
  } finally {
    submitting.value = false;
  }
}

async function finishEarly() {
  if (!active.value) return;
  submitting.value = true;
  try {
    const id = active.value.id;
    await command(active.value, "END_EARLY");
    finishOpen.value = false;
    await router.push(`/student/mock/report?id=${id}`);
  } catch {
    notice.value = "本次练习状态已变化，请刷新后核对。";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main id="main-content" class="business-page mock-page ui-scene ui-scene--studio">
    <AiConsentDialog :open="ai.consentOpen.value" :preview="ai.preview.value" @close="ai.stop" @confirm="ai.confirm" />
    <WorkbenchHeader>
      <template #heading><div>
        <h1>先练习，再从容表达。</h1>
        <p>
          三道题完成练习，按固定规则评分；生成式文字不参与数值计算。
        </p>
      </div></template>
      <template #actions><RouterLink
        v-if="completed.length"
        class="inline-link"
        :to="`/student/mock/report?id=${completed[0]!.id}`"
        >查看最近报告<AppIcon name="arrow" :size="16"
      /></RouterLink></template>
    </WorkbenchHeader>
    <section v-if="isOnline" class="business-notice"><strong>语音面试新模式</strong><p>按岗位动态提问与追问，自动收音，逐轮AI参考评分。下方保留原规则文字练习。</p><RouterLink to="/student/mock/voice" class="inline-link">进入语音模拟面试 →</RouterLink></section>
    <section class="practice-templates surface" aria-label="岗位面试练习模板">
      <h2>先选一个方向，开始练习</h2><p class="caption">练习模板，不是可投递岗位。没有站内岗位也可阅读问题和答题提示；不写入招聘记录。</p>
      <div class="template-grid"><article v-for="item in interviewTemplates" :key="item.id"><p class="eyebrow">岗位能力练习</p><h3>{{ item.title }}</h3><p>{{ item.requirements }}</p><details><summary>查看示例问题</summary><ol><li v-for="question in item.questions" :key="question">{{ question }}</li></ol><p>{{ item.hint }}</p></details><RouterLink v-if="isOnline" :to="{path:'/student/mock/voice',query:{title:item.title,requirements:item.requirements}}" class="inline-link">以此模板开始语音练习 →</RouterLink></article></div>
    </section>

    <p v-if="notice" class="business-notice" role="status">{{ notice }}</p>
    <p v-if="error" class="business-notice business-error" role="alert">
      {{ error }}
    </p>
    <AppSkeleton v-else-if="loading" height="420px" />

    <template v-else-if="active && currentQuestion && targetJob">
      <section class="practice-header">
        <div>
          <AppTag :tone="active.state === 'paused' ? 'warn' : 'success'">
            {{ active.state === "paused" ? "已暂停" : "练习进行中" }}
          </AppTag>
          <span
            >{{ targetJob.title }} ·
            {{ companyLabel(targetJob.companyId) }}</span
          >
        </div>
        <strong
          >第 {{ active.questionIndex + 1 }} /
          {{ active.questionIds.length }} 题</strong
        >
      </section>
      <div
        class="question-progress"
        role="progressbar"
        :aria-valuenow="active.questionIndex + 1"
        :aria-valuemax="active.questionIds.length"
      >
        <span
          :style="{
            width: `${((active.questionIndex + 1) / active.questionIds.length) * 100}%`,
          }"
        ></span>
      </div>

      <div class="practice-layout">
        <section class="question-stage">
          <div class="question-meta">
            <span>{{ questionType[currentQuestion.type] }}</span>
            <span>{{
              currentQuestion.difficulty === "basic" ? "基础" : "进阶"
            }}</span>
          </div>
          <h2>{{ currentQuestion.text }}</h2>
          <div class="practice-actions assistance-actions no-print">
            <AppButton variant="secondary" :disabled="active.state === 'paused' || submitting || ai.busy.value" @click="generateAssistance('question')">生成题目辅助</AppButton>
            <AppButton v-if="previousQuestion" variant="secondary" :disabled="active.state === 'paused' || submitting || ai.busy.value" @click="generateAssistance('followUp')">生成上一题追问</AppButton>
            <AppButton v-if="ai.busy.value" variant="ghost" @click="ai.stop">停止生成</AppButton>
          </div>
          <p v-if="ai.error.value" class="business-notice business-error" role="alert">{{ ai.error.value }}</p>
          <AiBlock v-if="usableAssistance" :mode="usableAssistance.effectiveMode" :origin="usableAssistance.origin" :reason="usableAssistance.fallbackReason ?? undefined">
            <p>{{ usableAssistance.data.module === 'A2' ? usableAssistance.data.text : '' }}</p>
            <template #evidence>辅助文案不替换原题、不参与数值评分，刷新后不保留。追问仅引用上一题已提交的回答。</template>
          </AiBlock>
          <div v-if="usableAssistance && assistance?.operation === 'followUp'" class="follow-answer">
            <label class="answer-field"><span>上一题补充回答</span><textarea v-model="followAnswer" maxlength="4000" :disabled="active.state === 'paused' || submitting"></textarea></label>
            <AppButton :disabled="active.state === 'paused' || !followAnswer.trim()" :loading="submitting" @click="submitFollowUp">提交补充回答</AppButton>
          </div>
          <div class="answer-guide" aria-label="回答结构提示">
            <span><b>S</b> 场景</span><span><b>T</b> 任务</span
            ><span><b>A</b> 行动</span><span><b>R</b> 结果</span>
          </div>
          <label class="answer-field">
            <span>我的回答</span>
            <textarea
              v-model="answer"
              :disabled="active.state === 'paused' || submitting"
              maxlength="4000"
              placeholder="如实说明你的经历。可以先写背景，再写本人承担的任务、具体行动和可核实结果。"
            ></textarea>
          </label>
          <div class="answer-status">
            <p v-if="localCue && active.state !== 'paused'">
              <AppIcon name="sparkle" :size="16" />{{ localCue }}
            </p>
            <span>{{ answer.length }} / 4000</span>
          </div>
          <div class="practice-actions no-print">
            <AppButton
              :disabled="active.state === 'paused' || !answer.trim()"
              :loading="submitting"
              @click="submit('SUBMIT_ANSWER')"
              >提交回答<AppIcon name="arrow" :size="16"
            /></AppButton>
            <AppButton
              variant="secondary"
              :disabled="active.state === 'paused' || submitting"
              @click="submit('SKIP')"
              >暂时跳过</AppButton
            >
          </div>
        </section>

        <aside class="practice-notes">
          <section>
            <span class="note-index">01</span>
            <div>
              <h3>先讲事实</h3>
              <p>没有数据时可以如实说明，不需要补写无法核实的成果。</p>
            </div>
          </section>
          <section>
            <span class="note-index">02</span>
            <div>
              <h3>说清本人行动</h3>
              <p>区分团队成果与个人贡献，能让表达更可信。</p>
            </div>
          </section>
          <section>
            <span class="note-index">03</span>
            <div>
              <h3>评分保持透明</h3>
              <p>相关性、STAR、证据、技能、结构和一致性共同构成分数。</p>
            </div>
          </section>
          <div class="session-controls no-print">
            <AppButton
              v-if="active.state === 'paused'"
              :loading="submitting"
              @click="resume"
              >继续练习</AppButton
            >
            <AppButton
              v-else
              variant="secondary"
              :disabled="submitting"
              @click="pause"
              >暂停并保存</AppButton
            >
            <AppButton variant="ghost" @click="finishOpen = true"
              >提前结束</AppButton
            >
          </div>
        </aside>
      </div>
    </template>

    <template v-else-if="targetJob">
      <div class="mock-welcome">
        <section class="welcome-copy">
          <span class="eyebrow">MOCK INTERVIEW · LOCAL FIRST</span>
          <h2>用一轮短练习，<br />找到表达的着力点。</h2>
          <p>
            题目覆盖经历、能力和协作。每次提交都会原子保存，刷新后可以从下一题继续。
          </p>
          <label>
            <span>本次目标岗位</span>
            <select v-model="selectedJobId">
              <option value="">
                {{ targetJob.title }} · {{ companyLabel(targetJob.companyId) }}
              </option>
              <option v-for="job in jobs" :key="job.id" :value="job.id">
                {{ job.title }} · {{ companyLabel(job.companyId) }} ·
                {{ label(job.cityId) }}
              </option>
            </select>
          </label>
          <AppButton size="lg" :loading="submitting" @click="start">
            开始新练习<AppIcon name="arrow" :size="18" />
          </AppButton>
        </section>
        <section class="welcome-visual" aria-label="三题练习流程">
          <div class="orbit orbit-one"></div>
          <div class="orbit orbit-two"></div>
          <div class="center-mark"><AppIcon name="interview" :size="42" /></div>
          <div class="stage-label stage-one">
            <span>01</span><strong>经历</strong>
          </div>
          <div class="stage-label stage-two">
            <span>02</span><strong>能力</strong>
          </div>
          <div class="stage-label stage-three">
            <span>03</span><strong>协作</strong>
          </div>
        </section>
      </div>

      <section v-if="completed.length" class="history-strip">
        <div>
          <h2>练习记录</h2>
          <p>报告只比较同岗位、同量规、同题本的练习。</p>
        </div>
        <RouterLink
          v-for="item in completed.slice(0, 3)"
          :key="item.id"
          :to="`/student/mock/report?id=${item.id}`"
        >
          <span>{{
            jobs.find((job) => job.id === item.targetJobId)?.title ?? "历史岗位"
          }}</span>
          <strong>{{ item.report!.overall }}</strong>
          <small>查看报告</small>
        </RouterLink>
      </section>
    </template>

    <section v-else class="business-empty">
      <AppIcon name="interview" :size="40" />
      <h2>暂无可用的练习岗位</h2>
      <p>请确认简历和岗位状态后重试，已有数据不会被自动覆盖。</p>
      <RouterLink to="/student/data-check" class="inline-link"
        >检查本机数据</RouterLink
      >
    </section>

    <AppModal data-scene="governance"
      :open="finishOpen"
      title="提前结束本次练习"
      @close="finishOpen = false"
    >
      <p class="finish-copy">
        已提交的题目会生成部分报告，未回答题目不计分；完成度会明确显示，不会把部分练习伪装成完整成绩。
      </p>
      <template #footer>
        <AppButton variant="secondary" @click="finishOpen = false"
          >继续作答</AppButton
        >
        <AppButton :loading="submitting" @click="finishEarly"
          >生成部分报告</AppButton
        >
      </template>
    </AppModal>
    <footer class="business-footer">
      {{ isOnline ? "回答与评分保存在服务端" : "回答与评分保存在当前浏览器" }} · 生成式文字不参与数值评分
    </footer>
  </main>
</template>

<style scoped>
.practice-templates{padding:24px;margin-bottom:24px}.template-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}.template-grid article{padding:20px;border:1px solid var(--border);border-radius:var(--r-control);background:var(--surface-2)}.template-grid p,.template-grid li{font-size:13px;line-height:1.7}.template-grid summary{cursor:pointer;margin:12px 0;color:var(--accent-text);font-weight:600}.template-grid ol{padding-left:22px}@media(max-width:900px){.template-grid{grid-template-columns:1fr}}
.mock-page {
  max-width: 1320px;
}
.practice-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 20px 0;
}
.practice-header > div {
  display: flex;
  gap: 16px;
  align-items: center;
  font-size: 14px;
  color: var(--text-2);
}
.practice-header > strong {
  font: 600 18px var(--font-mono);
}
.question-progress {
  height: 4px;
  background: var(--surface-2);
  overflow: hidden;
  margin-bottom: 32px;
}
.question-progress span {
  display: block;
  height: 100%;
  background: var(--brand-text);
  transition: width var(--t-state) var(--ease);
}
.practice-layout {
  display: grid;
  grid-template-columns: minmax(0, 8fr) minmax(280px, 3fr);
  gap: 40px;
  align-items: start;
}
.question-stage {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  padding: 40px;
}
.question-meta {
  display: flex;
  gap: 12px;
  color: var(--brand-text);
  font-size: 12px;
  margin-bottom: 28px;
}
.question-meta span {
  padding: 5px 10px;
  background: var(--brand-soft);
  border-radius: var(--r-sm);
}
.question-stage h2 {
  font-size: 28px;
  line-height: 1.65;
  max-width: 820px;
  margin-bottom: 28px;
}
.answer-guide {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.answer-guide span {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  font-size: 12px;
  color: var(--text-2);
}
.answer-guide b {
  color: var(--brand-text);
}
.answer-field {
  display: grid;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
}
.answer-field textarea {
  width: 100%;
  min-height: 230px;
  resize: vertical;
  border: 1px solid var(--border-control);
  border-radius: var(--r-control);
  padding: 18px;
  background: var(--bg-base);
  color: var(--text-1);
  font: 400 15px/1.9 var(--font-sans);
}
.answer-field textarea:focus {
  background: var(--surface);
}
.answer-field textarea:disabled {
  background: var(--disabled-bg);
}
.answer-status {
  min-height: 40px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  color: var(--text-3);
  font-size: 12px;
}
.answer-status p {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--ai-text);
}
.answer-status span {
  margin-left: auto;
  white-space: nowrap;
  font-family: var(--font-mono);
}
.practice-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}
.assistance-actions { flex-wrap: wrap; margin-bottom: 20px; }
.follow-answer { display: grid; gap: 12px; margin: 20px 0; }
.practice-notes {
  display: grid;
  gap: 0;
  border-top: 1px solid var(--border);
}
.practice-notes > section {
  display: flex;
  gap: 18px;
  padding: 24px 0;
  border-bottom: 1px solid var(--border);
}
.note-index {
  font: 12px var(--font-mono);
  color: var(--brand-text);
  padding-top: 2px;
}
.practice-notes h3 {
  font-size: 14px;
  margin-bottom: 8px;
}
.practice-notes p {
  font-size: 12px;
  color: var(--text-2);
}
.session-controls {
  display: grid;
  gap: 10px;
  margin-top: 24px;
}
.mock-welcome {
  display: grid;
  grid-template-columns: minmax(0, 6fr) minmax(420px, 5fr);
  min-height: 530px;
  background: var(--navy);
  color: var(--on-navy);
  border-radius: var(--r-panel);
  overflow: hidden;
}
.welcome-copy {
  padding: 64px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
}
.eyebrow {
  font: 11px var(--font-mono);
  color: #91a9ff;
  margin-bottom: 28px;
}
.welcome-copy h2 {
  font-size: 38px;
  line-height: 1.45;
  margin-bottom: 24px;
}
.welcome-copy > p {
  max-width: 520px;
  color: var(--on-navy-muted);
  font-size: 14px;
  margin-bottom: 32px;
}
.welcome-copy label {
  display: grid;
  gap: 10px;
  width: min(100%, 520px);
  font-size: 12px;
  color: var(--on-navy-muted);
  margin-bottom: 24px;
}
.welcome-copy select {
  width: 100%;
  padding: 12px;
  border: 1px solid #42506a;
  border-radius: var(--r-control);
  background: var(--navy-2);
  color: var(--on-navy);
  font: 14px var(--font-sans);
}
.welcome-visual {
  position: relative;
  min-height: 460px;
  background: linear-gradient(145deg, var(--navy-2), #10192d);
  overflow: hidden;
}
.orbit {
  position: absolute;
  left: 50%;
  top: 50%;
  border: 1px solid #394867;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}
.orbit-one {
  width: 230px;
  height: 230px;
}
.orbit-two {
  width: 390px;
  height: 390px;
  border-style: dashed;
}
.center-mark {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 108px;
  height: 108px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #a9baff;
  background: #1f2d4c;
  box-shadow: 0 0 0 16px rgba(47, 85, 200, 0.12);
}
.stage-label {
  position: absolute;
  display: grid;
  gap: 5px;
  color: var(--on-navy);
}
.stage-label span {
  font: 11px var(--font-mono);
  color: #91a9ff;
}
.stage-label strong {
  font-size: 15px;
}
.stage-one {
  left: 12%;
  top: 24%;
}
.stage-two {
  right: 12%;
  top: 26%;
}
.stage-three {
  left: 48%;
  bottom: 10%;
}
.history-strip {
  display: grid;
  grid-template-columns: 2fr repeat(3, 1fr);
  gap: 1px;
  background: var(--border);
  margin-top: 32px;
  border: 1px solid var(--border);
}
.history-strip > div,
.history-strip > a {
  background: var(--surface);
  padding: 24px;
}
.history-strip h2 {
  font-size: 18px;
}
.history-strip p {
  font-size: 12px;
  color: var(--text-2);
  margin-top: 8px;
}
.history-strip > a {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  color: var(--text-1);
}
.history-strip > a:hover {
  text-decoration: none;
  background: var(--brand-soft);
}
.history-strip > a span {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-strip > a strong {
  grid-row: 1/3;
  grid-column: 2;
  font: 28px var(--font-mono);
  color: var(--brand-text);
}
.history-strip > a small {
  font-size: 11px;
  color: var(--text-3);
}
.finish-copy {
  font-size: 14px;
  color: var(--text-2);
  line-height: 1.9;
}
@media (max-width: 1050px) {
  .practice-layout {
    grid-template-columns: minmax(0, 1fr) 240px;
    gap: 24px;
  }
  .question-stage {
    padding: 32px;
  }
  .mock-welcome {
    grid-template-columns: 1fr 380px;
  }
  .welcome-copy {
    padding: 48px 40px;
  }
  .history-strip {
    grid-template-columns: 1fr 1fr;
  }
  .history-strip > div {
    grid-column: 1/-1;
  }
}
@media (max-width: 767px) {
  .practice-header {
    align-items: flex-start;
  }
  .practice-header > div {
    display: grid;
    gap: 10px;
  }
  .practice-layout {
    grid-template-columns: 1fr;
  }
  .question-stage {
    padding: 24px 20px;
  }
  .question-stage h2 {
    font-size: 21px;
  }
  .practice-notes {
    grid-template-columns: 1fr;
  }
  .practice-actions {
    display: grid;
  }
  .mock-welcome {
    grid-template-columns: 1fr;
    min-height: 0;
  }
  .welcome-copy {
    padding: 40px 24px;
  }
  .welcome-copy h2 {
    font-size: 28px;
  }
  .welcome-visual {
    min-height: 330px;
  }
  .orbit-two {
    width: 300px;
    height: 300px;
  }
  .history-strip {
    grid-template-columns: 1fr;
  }
  .history-strip > div {
    grid-column: auto;
  }
  .answer-field textarea {
    min-height: 210px;
  }
  .stage-three {
    bottom: 7%;
  }
}
</style>
