<script setup lang="ts">
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import { computed, ref, onMounted, onBeforeUnmount, watch } from "vue";
import {
  useRoute,
  useRouter,
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
} from "vue-router";
import { aiFetch, workbench } from "../../adapters/repository/http";
import {
  recordAnswer,
  speakQuestion,
  type AnswerRecording,
} from "../../services/interview-audio";
import { shouldConfirmVoiceLeave } from "../../services/workbench-state";
import type { VoiceSession, WorkbenchStatus } from "../../types/ai-workbench";
import AppButton from "../../components/base/AppButton.vue";
import { aiConsent } from "../../services/ai-consent";
import AiProvenance from "../../components/business/AiProvenance.vue";
import { consumePracticeStart } from "../../services/interview-entry";
const route = useRoute(),
  router = useRouter();
const voiceFirst = computed(() => route.path === "/student/mock/voice"),
  roomPath = computed(() =>
    voiceFirst.value
      ? "/student/mock/voice"
      : route.path === "/student/mock/text"
        ? "/student/mock/text"
        : "/student/mock",
  ),
  reportPath = computed(() =>
    voiceFirst.value ? "/student/mock/voice/report" : "/student/mock/feedback",
  );
const title = ref(
    typeof route.query.title === "string"
      ? route.query.title.slice(0, 160)
      : "",
  ),
  requirements = ref(
    typeof route.query.requirements === "string"
      ? route.query.requirements.slice(0, 10000)
      : "",
  ),
  sourceUrl = ref(
    typeof route.query.sourceUrl === "string" ? route.query.sourceUrl : "",
  ),
  consent = aiConsent,
  natural = ref(voiceFirst.value),
  autoVoice = ref(voiceFirst.value);
const session = ref<VoiceSession | null>(null),
  history = ref<VoiceSession[]>([]),
  status = ref("准备开始"),
  busy = ref(false),
  speaking = ref(false),
  recording = ref(false),
  seconds = ref(0),
  level = ref(0),
  transcript = ref(""),
  notice = ref(""),
  paused = ref(true),
  available = ref(false),
  review = ref(false);
let recorder: AnswerRecording | undefined,
  controller: AbortController | undefined,
  operation = 0,
  submitTimer: ReturnType<typeof setTimeout> | undefined;
let mounted = true,
  initialCancelled = false;
const initialSessionId =
  typeof route.query.id === "string" ? route.query.id : undefined;
const practiceStart = initialSessionId
  ? consumePracticeStart(initialSessionId)
  : false;
const turn = computed(() => session.value?.turns.at(-1)),
  canAnswer = computed(
    () => session.value?.state === "active" && turn.value?.answer === null,
  );
const voiceSupported =
  typeof navigator.mediaDevices?.getUserMedia === "function" &&
  window.isSecureContext;
function stop() {
  operation++;
  controller?.abort();
  recorder?.cancel();
  recorder = undefined;
  recording.value = false;
  speaking.value = false;
  busy.value = false;
  paused.value = true;
  clearTimeout(submitTimer);
  status.value = "已暂停";
}
async function refresh() {
  try {
    history.value = (
      await workbench<{ sessions: VoiceSession[] }>("/sessions")
    ).sessions;
  } catch {
    notice.value = "读取历史失败，请检查在线服务。";
  }
}
async function openSession(id: string) {
  stop();
  const current = operation;
  controller = new AbortController();
  busy.value = true;
  try {
    const value = await workbench<{ session: VoiceSession }>(
      `/sessions/${encodeURIComponent(id)}`,
      undefined,
      controller.signal,
    );
    if (current !== operation) return;
    session.value = value.session;
    transcript.value = "";
    review.value = false;
    status.value = "已载入，请点击继续";
  } catch {
    if (current === operation) notice.value = "记录不存在或无权限。";
  } finally {
    if (current === operation) busy.value = false;
  }
}
async function start() {
  if (
    busy.value ||
    !available.value ||
    !consent.value ||
    !title.value.trim() ||
    !requirements.value.trim()
  )
    return;
  stop();
  busy.value = true;
  status.value = "面试官正在准备开场";
  controller = new AbortController();
  const current = operation;
  try {
    const value = await workbench<{ session: VoiceSession }>(
      "/sessions",
      {
        target: {
          title: title.value,
          requirements: requirements.value,
          sourceUrl: sourceUrl.value,
        },
        consent: true,
      },
      controller.signal,
    );
    if (current !== operation) return;
    session.value = value.session;
    await router.replace({
      path: roomPath.value,
      query: { id: session.value.id },
    });
    await refresh();
    busy.value = false;
    paused.value = false;
    if (autoVoice.value) await play();
    else status.value = "题目已准备，请输入回答";
  } catch {
    if (current === operation) {
      notice.value = "开场生成未完成，请检查服务或额度后重试。";
      status.value = "准备开始";
    }
  } finally {
    if (current === operation) busy.value = false;
  }
}
async function play() {
  if (!turn.value || busy.value) return;
  if (!consent.value) {
    notice.value = "请先确认本场语音外发授权。";
    return;
  }
  controller?.abort();
  controller = new AbortController();
  const current = ++operation;
  speaking.value = true;
  paused.value = false;
  notice.value = "";
  status.value = "面试官正在提问";
  try {
    await speakQuestion(turn.value.question, controller.signal);
    if (current !== operation) return;
    speaking.value = false;
    if (canAnswer.value && autoVoice.value && voiceSupported) await listen();
    else status.value = "请开始回答";
  } catch {
    if (current === operation) {
      speaking.value = false;
      paused.value = true;
      notice.value = "语音播放未完成。可重新播放，或直接回答屏幕上的题目。";
      status.value = "播放已停止";
    }
  }
}
async function listen() {
  if (!canAnswer.value || busy.value || !consent.value) return;
  stop();
  const current = operation;
  paused.value = false;
  status.value = "正在聆听 · 说完停顿后自动识别";
  seconds.value = 0;
  level.value = 0;
  try {
    const active = await recordAnswer(
      () => {
        if (current === operation) void finishRecording();
      },
      (s, l) => {
        if (current === operation) {
          seconds.value = s;
          level.value = l;
        }
      },
    );
    if (current !== operation) {
      active.cancel();
      return;
    }
    recorder = active;
    recording.value = true;
  } catch {
    if (current === operation) {
      paused.value = true;
      notice.value = "无法使用麦克风：请检查权限和设备；也可切换为文字回答。";
      status.value = "麦克风不可用";
    }
  }
}
async function finishRecording() {
  if (!consent.value) {
    stop();
    return;
  }
  if (!recorder || busy.value) return;
  const audio = recorder.stop();
  recorder = undefined;
  recording.value = false;
  busy.value = true;
  status.value = "正在识别你的回答";
  notice.value = "";
  controller = new AbortController();
  const signal = window.AbortSignal.any([
    controller.signal,
    window.AbortSignal.timeout(120_000),
  ]);
  const current = operation;
  try {
    const res = await aiFetch("/speech/asr", {
      method: "POST",
      headers: { "Content-Type": "audio/wav", "X-AI-Consent": "true" },
      body: audio,
      signal,
    });
    const data = await res.json();
    if (current !== operation) return;
    if (typeof data?.text !== "string") throw Error("INVALID_TRANSCRIPT");
    if (!data.text.trim()) {
      notice.value = "没有识别到有效回答，请重新录音。";
      paused.value = true;
      status.value = "未识别到回答";
      return;
    }
    transcript.value = data.text;
    review.value = true;
    status.value = "转写已完成";
    if (natural.value) {
      notice.value = "2秒后自动提交；如识别有误，点击纠错编辑。";
      submitTimer = setTimeout(() => {
        if (current === operation) void submit();
      }, 2000);
    } else notice.value = "请核对转写后提交，可编辑或重新录音。";
  } catch {
    if (current === operation) {
      const timedOut = signal.aborted && signal.reason?.name === "TimeoutError";
      notice.value = timedOut
        ? "识别超时，回答未提交。可重新录音或改用文字。"
        : "转写失败，回答未提交。可重新录音或改用文字。";
      paused.value = true;
      status.value = timedOut ? "识别已超时" : "识别未完成";
    }
  } finally {
    if (current === operation) busy.value = false;
  }
}
function edit() {
  clearTimeout(submitTimer);
  paused.value = true;
  review.value = true;
  notice.value = "自动提交已取消，核对文字后提交。";
}
async function submit() {
  if (
    !session.value ||
    !transcript.value.trim() ||
    busy.value ||
    !canAnswer.value ||
    !consent.value
  )
    return;
  clearTimeout(submitTimer);
  controller?.abort();
  controller = new AbortController();
  const current = ++operation;
  busy.value = true;
  review.value = false;
  status.value = "面试官正在准备追问与评价";
  notice.value = "";
  try {
    const value = await workbench<{ session: VoiceSession }>(
      `/sessions/${session.value.id}`,
      {
        expectedRevision: session.value.revision,
        action: "answer",
        text: transcript.value,
        consent: true,
      },
      controller.signal,
    );
    if (current !== operation) return;
    session.value = value.session;
    transcript.value = "";
    busy.value = false;
    await refresh();
    if (session.value.state === "completed") {
      paused.value = true;
      status.value = "面试完成";
      await router.push({
        path: reportPath.value,
        query: { id: session.value.id },
      });
    } else if (session.value.error) {
      paused.value = true;
      status.value = "本轮已保存";
      notice.value = session.value.error;
    } else if (autoVoice.value && !paused.value) await play();
    else status.value = "下一题已准备，可继续";
  } catch {
    if (current === operation) {
      notice.value =
        "提交未完成。文字保留，请先重新读取记录核对是否已保存，避免重复提交。";
      paused.value = true;
      status.value = "等待核对";
    }
  } finally {
    if (current === operation) busy.value = false;
  }
}
async function next() {
  if (!session.value || busy.value || !consent.value) return;
  stop();
  controller = new AbortController();
  const current = operation;
  busy.value = true;
  try {
    const value = await workbench<{ session: VoiceSession }>(
      `/sessions/${session.value.id}`,
      {
        expectedRevision: session.value.revision,
        action: "next",
        consent: true,
      },
      controller.signal,
    );
    if (current !== operation) return;
    session.value = value.session;
    notice.value = "";
    busy.value = false;
    paused.value = false;
    if (autoVoice.value) await play();
    else status.value = "下一题已准备，请输入回答";
  } catch {
    if (current === operation)
      notice.value = "下一题仍未完成，本轮回答保持已保存，可结束查看反馈。";
  } finally {
    if (current === operation) busy.value = false;
  }
}
async function complete() {
  if (
    !session.value ||
    !window.confirm(
      "结束本场练习并查看已提交回答的反馈？当前未提交内容不会计分。",
    )
  )
    return;
  stop();
  busy.value = true;
  try {
    session.value = (
      await workbench<{ session: VoiceSession }>(
        `/sessions/${session.value.id}`,
        { expectedRevision: session.value.revision, action: "complete" },
      )
    ).session;
    await router.push({
      path: reportPath.value,
      query: { id: session.value.id },
    });
  } catch {
    notice.value = "结束未完成，请重新读取状态。";
  } finally {
    busy.value = false;
  }
}
async function remove(item: VoiceSession) {
  if (!window.confirm("永久删除此练习及其转写和评分？")) return;
  try {
    await aiFetch(`/sessions/${item.id}`, { method: "DELETE" });
    if (session.value?.id === item.id) {
      stop();
      session.value = null;
    }
    await refresh();
  } catch {
    notice.value = "删除未完成。";
  }
}
onMounted(async () => {
  try {
    available.value = (await workbench<WorkbenchStatus>("/status")).enabled;
  } catch {
    /* Offline remains unavailable. */
  }
  if (!mounted) return;
  await refresh();
  if (!mounted || route.query.id !== initialSessionId) return;
  if (initialSessionId) {
    await openSession(initialSessionId);
    if (
      mounted &&
      !initialCancelled &&
      practiceStart &&
      voiceFirst.value &&
      session.value?.id === initialSessionId &&
      available.value &&
      consent.value
    )
      await play();
  }
});
watch(
  () => route.query.id,
  (id) => {
    if (typeof id === "string" && session.value?.id !== id)
      void openSession(id);
    else if (!id) {
      stop();
      session.value = null;
      transcript.value = "";
      title.value =
        typeof route.query.title === "string"
          ? route.query.title.slice(0, 160)
          : "";
      requirements.value =
        typeof route.query.requirements === "string"
          ? route.query.requirements.slice(0, 10000)
          : "";
      sourceUrl.value =
        typeof route.query.sourceUrl === "string" ? route.query.sourceUrl : "";
    }
  },
);
watch(voiceFirst, (value) => {
  stop();
  autoVoice.value = value;
  natural.value = value;
});
watch(
  consent,
  (value) => {
    if (!value) {
      initialCancelled = true;
      stop();
      notice.value =
        "已撤销本场授权，录音、播放和未完成请求已停止。已发出的内容无法撤回，已保存记录可删除。";
    }
  },
  { flush: "sync" },
);
function confirmLeave() {
  if (
    shouldConfirmVoiceLeave(
      session.value?.state,
      recording.value || speaking.value,
      busy.value,
      transcript.value,
    ) &&
    !window.confirm(
      "当前正在面试，离开会停止录音与请求。已提交记录保留，继续？",
    )
  )
    return false;
  initialCancelled = true;
  stop();
  return true;
}
onBeforeUnmount(() => {
  mounted = false;
  stop();
});
onBeforeRouteLeave(confirmLeave);
onBeforeRouteUpdate((to) => {
  if (to.query.id === session.value?.id) return true;
  return confirmLeave();
});
</script>
<template>
  <main id="main-content" class="business-page voice-page ui-scene ui-scene--studio" :class="{ 'feature-text': !voiceFirst }">
    <WorkbenchHeader>
      <template #heading><div>
        <p class="kicker">
          {{ voiceFirst ? "仿真语音面试" : "文字输入法面试" }} · INTERVIEW ROOM
        </p>
        <h1>
          {{
            voiceFirst
              ? "像面试一样，开口练习。"
              : "认真组织语言，从容表达自己。"
          }}
        </h1>
        <p>
          DeepSeek根据目标岗位动态提问、追问与评价。{{
            voiceFirst
              ? "整段语音识别有等待，不是双工实时通话。"
              : "默认文字作答，不自动调用语音合成或识别。"
          }}
        </p>
      </div></template>
      <template #actions><div class="page-actions">
        <RouterLink
          :to="voiceFirst ? '/student/mock/text' : '/student/mock/voice'"
          class="inline-link"
          >{{ voiceFirst ? "切换文字面试" : "进入语音面试" }}</RouterLink
        ><RouterLink to="/student/mock/practice" class="inline-link"
          >题库快速练习</RouterLink
        ><RouterLink to="/student/mock/report" class="inline-link"
          >查看旧规则练习报告</RouterLink
        >
      </div></template>
    </WorkbenchHeader>
    <p v-if="notice" class="business-notice" role="status">{{ notice }}</p>
    <section class="panel consent-panel">
      <p class="muted">
        {{
          consent ? "AI默认授权已开启" : "AI已关闭，请在顶部开启"
        }}。点击开始会将岗位要求与回答发送DeepSeek；只有主动启用语音功能才发送音频。音频临时处理不落盘，保存文字与评分供本人查看，可删除。最多6轮；文字约12次生成调用，语音另增加TTS/ASR，可能产生费用，受共享日额度限制。顶部开关可停止未完成请求，但不能撤回已发送资料或已产生的费用。
      </p>
      <label class="check"
        ><input
          v-model="autoVoice"
          type="checkbox"
        />语音主模式：自动播放问题并开始收音</label
      ><label class="check"
        ><input
          v-model="natural"
          type="checkbox"
        />自然轮换：转写后2秒自动提交，可随时纠错暂停</label
      >
      <p v-if="!voiceSupported" class="muted">
        此环境无法安全录音，可使用HTTPS/localhost及支持麦克风的浏览器；文字回答仍可使用。
      </p>
    </section>
    <div class="workbench-split interview-workspace">
    <div class="interview-main">
    <section v-if="!session" class="panel setup">
      <h2>准备这场面试</h2>
      <label
        >目标岗位<input
          v-model="title"
          maxlength="160"
          placeholder="例如：前端开发工程师" /></label
      ><label
        >岗位要求与希望考察的能力<textarea
          v-model="requirements"
          rows="6"
          maxlength="10000"
          placeholder="粘贴已核实的岗位要求，如Vue、组件设计、测试方法…"
        ></textarea></label
      ><label
        >来源链接（可选，仅保留来源，不自动抓取）<input
          v-model="sourceUrl"
          maxlength="2048" /></label
      ><AppButton
        :loading="busy"
        :disabled="
          !available || !consent || !title.trim() || !requirements.trim()
        "
        @click="start"
        >{{ voiceFirst ? "进入语音面试房间" : "开始文字面试" }}</AppButton
      >
      <p v-if="!available" class="muted">
        真实DeepSeek服务暂不可用，无法开始AI面试。不会改用预设题库或本地评分。
      </p>
    </section>
    <section v-else class="room panel">
      <div class="room-top">
        <span class="badge">{{ session.target.title }}</span
        ><span>{{
          session.state === "completed"
            ? "已结束"
            : `第${session.turns.length}轮 / 最多6轮`
        }}</span>
      </div>
      <div class="interviewer">
        <div class="avatar">✦</div>
        <span>{{ status }}</span>
        <h2>{{ turn?.question }}</h2>
      </div>
      <div v-if="recording" class="meter" aria-label="正在录音">
        <i :style="{ width: `${Math.min(100, level * 500)}%` }"></i>
      </div>
      <p v-if="recording" class="record-status">
        录音 {{ Math.floor(seconds) }} / 120秒 ·
        连续停顿约1.6秒后识别；长回答会在上限自动结束，请核对转写。
      </p>
      <div class="page-actions room-controls">
        <AppButton
          :disabled="busy || !consent || recording || speaking || !canAnswer"
          @click="play"
          >{{ paused ? "继续 / 重播问题" : "重播问题" }}</AppButton
        ><AppButton
          variant="secondary"
          :disabled="busy || !consent || recording || !canAnswer"
          @click="listen"
          >开始语音回答</AppButton
        ><AppButton v-if="recording" @click="finishRecording"
          >我已回答完毕</AppButton
        ><AppButton
          v-if="recording || speaking || busy"
          variant="secondary"
          @click="stop"
          >暂停 / 打断</AppButton
        ><AppButton v-if="session.error" :loading="busy" @click="next"
          >重试下一题</AppButton
        ><AppButton
          variant="ghost"
          :disabled="busy"
          @click="openSession(session.id)"
          >重新读取记录</AppButton
        >
      </div>
      <AiProvenance :value="turn?.questionProvenance" />
      <section v-if="canAnswer" class="answer-panel">
        <h3>{{ review ? "核对回答 / 转写" : "输入你的回答" }}</h3>
        <textarea
          v-model="transcript"
          rows="5"
          maxlength="12000"
          :disabled="busy || recording"
          aria-label="面试回答与转写"
          placeholder="直接输入回答；使用语音时，识别结果也会显示在这里。"
          @focus="edit"
        ></textarea>
        <div class="page-actions">
          <AppButton v-if="review" variant="secondary" @click="edit"
            >纠错编辑 / 暂停自动提交</AppButton
          ><AppButton
            :disabled="busy || !transcript.trim() || !consent"
            :loading="busy"
            @click="submit"
            >确认并提交回答</AppButton
          >
        </div>
      </section>
      <div class="page-actions">
        <AppButton variant="secondary" :disabled="busy" @click="complete"
          >结束并查看AI反馈</AppButton
        ><RouterLink
          :to="{ path: reportPath, query: { id: session.id } }"
          class="inline-link"
          >查看已保存逐轮反馈</RouterLink
        >
      </div>
      <p class="muted">
        评分仅为AI练习参考，不评价口音、音色或未提供的声音特征，不用于招聘决策。
      </p>
    </section>
    <section v-if="history.length" class="panel">
      <h2>我的AI面试记录（文字 / 语音共用）</h2>
      <article v-for="item in history" :key="item.id" class="history-row">
        <div>
          <strong>{{ item.target.title }}</strong>
          <p class="muted">
            {{ new Date(item.updatedAt).toLocaleString() }} ·
            {{ item.turns.filter((t) => t.answer !== null).length }}轮回答 ·
            {{ item.state === "completed" ? "已完成" : "可继续" }}
          </p>
        </div>
        <div class="page-actions">
          <AppButton variant="secondary" size="sm" @click="openSession(item.id)"
            >继续 / 查看</AppButton
          ><RouterLink :to="{ path: reportPath, query: { id: item.id } }"
            >反馈报告</RouterLink
          ><AppButton
            variant="ghost"
            size="sm"
            :disabled="busy"
            @click="remove(item)"
            >删除</AppButton
          >
        </div>
      </article>
    </section>
    </div>
    <aside class="workbench-guide interview-guide">
      <h2>先准备，再开口。</h2>
      <p>围绕真实经历与目标岗位组织回答。练习中的问题、逐轮评价和已保存记录分别呈现。</p>
      <ol>
        <li><strong>文字与语音可切换</strong><p>相应入口在标题下操作带中，文字作答始终可用。</p></li>
        <li><strong>题库快速练习</strong><p>不想准备岗位时，从练习主题开始。</p></li>
        <li><strong>旧规则练习报告</strong><p>保留独立入口，不与AI报告混淆。</p></li>
      </ol>
    </aside>
    </div>
  </main>
</template>
<style scoped>
.voice-page {
  max-width: 1100px;
}
.kicker {
  font-size: 12px;
  color: var(--brand-text);
  letter-spacing: 0.1em;
}
.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 28px;
  margin: 22px 0;
}
.check {
  display: flex;
  gap: 10px;
  line-height: 1.8;
  font-size: 13px;
  margin: 8px 0;
}
.setup label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 18px 0;
}
input:not([type="checkbox"]),
textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 12px;
  border: 1px solid var(--border-control);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text-1);
  font: inherit;
  line-height: 1.7;
}
textarea {
  resize: vertical;
}
.room-top,
.history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.badge {
  color: var(--brand-text);
  background: var(--brand-soft);
  border-radius: 20px;
  padding: 8px 14px;
}
.interviewer {
  text-align: center;
  padding: 32px 12px;
}
.interviewer .avatar {
  width: 76px;
  height: 76px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--brand-soft);
  color: var(--brand-text);
  font-size: 36px;
  margin: 0 auto 16px;
}
.interviewer span {
  font-size: 13px;
  color: var(--text-2);
}
.interviewer h2 {
  line-height: 1.8;
  font-size: 25px;
  max-width: 760px;
  margin: 22px auto;
}
.room-controls {
  justify-content: center;
}
.meter {
  height: 8px;
  border-radius: 5px;
  background: var(--surface-2);
  overflow: hidden;
}
.meter i {
  height: 100%;
  display: block;
  background: var(--brand);
  transition: width 0.15s;
}
.record-status {
  text-align: center;
  font-size: 13px;
}
.answer-panel {
  margin: 26px 0;
  padding: 20px;
  background: var(--surface-2);
  border-radius: 14px;
}
.muted {
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.8;
}
.history-row {
  border-bottom: 1px solid var(--border);
  padding: 16px 0;
}
@media (max-width: 650px) {
  .panel {
    padding: 18px;
  }
  .history-row,
  .room-top {
    align-items: flex-start;
    flex-direction: column;
  }
  .interviewer h2 {
    font-size: 21px;
  }
}
</style>
