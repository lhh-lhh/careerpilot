<script setup lang="ts">
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import { interviewTemplates } from "../../data/interview-templates";
import { aiConsent } from "../../services/ai-consent";
import { workbench } from "../../adapters/repository/http";
import { isOnline } from "../../services/runtime";
import { rememberPracticeStart } from "../../services/interview-entry";
import type { VoiceSession, WorkbenchStatus } from "../../types/ai-workbench";
import AppButton from "../../components/base/AppButton.vue";
const router = useRouter(),
  cards = ref<typeof interviewTemplates>([]),
  available = ref(false),
  checking = ref(true),
  busy = ref(false),
  notice = ref(""),
  starting = ref("");
let controller: AbortController | undefined,
  generation = 0;
function shuffle() {
  if (busy.value) return;
  const pool = [...interviewTemplates];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  cards.value = pool.slice(0, 3);
}
function stop() {
  generation++;
  controller?.abort();
  busy.value = false;
}
watch(
  aiConsent,
  (enabled) => {
    if (!enabled) {
      const pending = busy.value;
      stop();
      if (pending)
        notice.value =
          "已停止本次练习准备。已发出的资料与费用无法撤回，可重新开启后手动开始。";
    }
  },
  { flush: "sync" },
);
async function start(
  item: (typeof interviewTemplates)[number],
  mode: "text" | "voice",
) {
  if (busy.value || !available.value || !aiConsent.value) return;
  const current = ++generation;
  controller = new AbortController();
  busy.value = true;
  notice.value = "";
  starting.value = `${item.title} · ${mode === "voice" ? "语音" : "文字"}练习`;
  try {
    const { session } = await workbench<{ session: VoiceSession }>(
      "/sessions",
      {
        target: { title: item.title, requirements: item.requirements },
        consent: true,
      },
      controller.signal,
    );
    if (current !== generation) return;
    rememberPracticeStart(session.id);
    busy.value = false;
    await router.push({
      path: `/student/mock/${mode}`,
      query: { id: session.id },
    });
  } catch {
    if (current === generation)
      notice.value =
        "开场生成未完成，请检查服务或额度后再试；未使用预设问题代替。";
  } finally {
    if (current === generation) busy.value = false;
  }
}
onMounted(async () => {
  shuffle();
  if (isOnline)
    try {
      available.value = (await workbench<WorkbenchStatus>("/status")).enabled;
    } catch {
      /* Disabled until verified. */
    }
  checking.value = false;
});
onBeforeRouteLeave(() => {
  if (
    busy.value &&
    !window.confirm(
      "正在准备练习，离开会停止未完成请求，已产生的费用无法撤回。继续离开？",
    )
  )
    return false;
  stop();
  return true;
});
onBeforeUnmount(stop);
</script>
<template>
  <main id="main-content" class="business-page practice-page ui-scene ui-scene--studio">
    <WorkbenchHeader>
      <template #heading><div>
        <h1>选一个方向，<em>先练起来。</em></h1>
        <p>
          常见岗位能力练习，无需填写准备表单。选择文字或语音，直接进入面试房间。
        </p>
      </div></template>
      <template #actions><AppButton variant="secondary" :disabled="busy" @click="shuffle"
        >换一组</AppButton
      ></template>
    </WorkbenchHeader>
    <section class="practice-notice">
      <p>
        以下是练习主题，不是可投递岗位，也不代表实时招聘热度排行。点击任一练习按钮后，才将主题与后续回答发送至DeepSeek生成问题和反馈，可能产生费用；打开页面或换一组不产生生成调用。
      </p>
      <p>
        语音练习会播放问题并申请麦克风权限，另有语音合成与识别调用；可随时暂停或改用文字。最多6轮，练习记录仅本人可见。
      </p>
    </section>
    <p v-if="notice" role="status" class="business-error">{{ notice }}</p>
    <p v-if="busy" role="status" class="business-notice">
      正在准备 {{ starting }}，请稍候…
    </p>
    <p v-if="checking" class="muted">正在检查在线服务…</p>
    <p v-else-if="!available" class="muted">
      在线练习暂不可用，请检查DeepSeek服务与额度。不会改用预设答案或本地评分。
    </p>
    <p v-if="!aiConsent" class="muted">AI已关闭，请在顶部开启后再开始练习。</p>
    <section class="practice-grid" aria-label="常见面试练习">
      <article v-for="item in cards" :key="item.id" class="practice-card" :class="`practice-card--${item.id}`">
        <div class="practice-cover" aria-hidden="true"></div>
        <span class="practice-tag">岗位能力练习 · 最多6轮</span>
        <h2>{{ item.title }}</h2>
        <p>{{ item.requirements }}</p>
        <div class="practice-actions">
          <AppButton
            :disabled="busy || !available || !aiConsent"
            @click="start(item, 'text')"
            >文字练习</AppButton
          ><AppButton
            variant="secondary"
            :disabled="busy || !available || !aiConsent"
            @click="start(item, 'voice')"
            >语音练习</AppButton
          >
        </div>
      </article>
    </section>
    <section class="practice-journey" aria-label="练习进阶指引"><div><h2>你的职业进阶之路</h2><p>从练习开始，迈向更好的职业未来</p></div><ol><li><strong>选择方向</strong><span>开启练习</span></li><li><strong>提升能力</strong><span>积累经验</span></li><li><strong>自信应对</strong><span>迎接机会</span></li></ol><span>岗位能力练习 · 最多6轮</span></section>
  </main>
</template>
<style scoped>
.practice-page {
  max-width: 1200px;
}
.kicker {
  font-size: 12px;
  color: var(--brand-text);
  letter-spacing: 0.1em;
}
.practice-notice {
  padding: 20px 24px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.9;
  margin: 24px 0;
}
.practice-notice p + p {
  margin-top: 8px;
}
.practice-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  margin-top: 24px;
}
.practice-card {
  display: flex;
  flex-direction: column;
  padding: 26px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface);
  min-width: 0;
}
.practice-tag {
  font-size: 12px;
  color: var(--brand-text);
}
.practice-card h2 {
  font-size: 21px;
  margin: 20px 0 14px;
}
.practice-card > p {
  color: var(--text-2);
  font-size: 14px;
  line-height: 1.9;
  margin-bottom: 28px;
}
.practice-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: auto;
}
.muted {
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.8;
}
@media (max-width: 1200px) {
  .practice-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 700px) {
  .practice-grid {
    grid-template-columns: 1fr;
  }
  .practice-card {
    padding: 22px;
  }
  .practice-notice {
    padding: 18px;
  }
  .practice-actions > * {
    flex: 1;
  }
}
</style>
