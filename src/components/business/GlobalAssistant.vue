<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import { useSessionStore } from "../../stores/session";
import { aiFetch, workbench } from "../../adapters/repository/http";
import { parseEventStream } from "../../services/workbench-stream";
import { LatestOperation } from "../../services/workbench-state";
import type { Conversation, WorkbenchStatus } from "../../types/ai-workbench";
import { isOnline } from "../../services/runtime";
import AppButton from "../base/AppButton.vue";
import AssistantPetLauncher from "./AssistantPetLauncher.vue";
import AiProvenance from "./AiProvenance.vue";
import { aiConsent } from "../../services/ai-consent";
const session = useSessionStore(),
  route = useRoute(),
  open = ref(false),
  busy = ref(false),
  consent = aiConsent,
  web = ref(false),
  message = ref(""),
  notice = ref(""),
  draft = ref(""),
  conversationId = ref(""),
  history = ref<Conversation[]>([]),
  messages = ref<NonNullable<Conversation["messages"]>>([]),
  enabled = ref(false);
let controller: AbortController | undefined,
  generation = 0;
const selection = new LatestOperation(),
  refreshes = new LatestOperation();
const allowed = computed(
  () => !!session.actor && session.accountStatus === "approved",
);
const composing = ref(false);
const canSend = computed(
  () =>
    isOnline &&
    allowed.value &&
    enabled.value &&
    consent.value &&
    !busy.value &&
    !!message.value.trim(),
);
const pageTitle = computed(() =>
  route.path === "/forbidden"
    ? "工作区权限提示页"
    : (route.meta.title ?? "平台页面"),
);
function messageKeydown(event: KeyboardEvent) {
  if (
    event.key !== "Enter" ||
    event.shiftKey ||
    event.isComposing ||
    composing.value ||
    event.keyCode === 229
  )
    return;
  event.preventDefault();
  if (!event.repeat && canSend.value) void send();
}
const actions = computed(() =>
  session.actor?.role === "student"
    ? [
        { path: "/student/resume/optimize", label: "AI优化简历" },
        { path: "/student/jobs/matches", label: "进行AI岗位匹配" },
        { path: "/student/mock/voice", label: "进入语音面试" },
      ]
    : [
        {
          path: `/${session.actor?.role ?? "student"}/service`,
          label: "站内服务与操作帮助",
        },
      ],
);
async function refresh() {
  if (!isOnline || !allowed.value) return;
  const token = refreshes.begin(),
    owner = session.actor?.userId,
    epoch = session.epoch;
  try {
    const [status, list] = await Promise.all([
      workbench<WorkbenchStatus>("/status"),
      workbench<{ conversations: Conversation[] }>("/conversations"),
    ]);
    if (
      !refreshes.isCurrent(token) ||
      session.actor?.userId !== owner ||
      session.epoch !== epoch
    )
      return;
    enabled.value = status.enabled;
    history.value = list.conversations;
  } catch {
    if (refreshes.isCurrent(token))
      notice.value = "助手暂不可用，请检查在线服务。";
  }
}
watch(open, (v) => {
  if (v) void refresh();
});
function stop() {
  generation++;
  selection.invalidate();
  controller?.abort();
  busy.value = false;
  if (draft.value) notice.value = "已停止，未完成内容未保存到会话。";
  draft.value = "";
}
watch(
  consent,
  (value) => {
    if (!value) stop();
  },
  { flush: "sync" },
);
function fresh() {
  stop();
  refreshes.invalidate();
  messages.value = [];
  conversationId.value = "";
  notice.value = "";
}
watch(
  () => session.epoch,
  () => {
    fresh();
    open.value = false;
    history.value = [];
  },
);
watch(
  () => session.actor?.userId,
  () => {
    fresh();
    open.value = false;
    history.value = [];
  },
);
async function select(item: Conversation) {
  stop();
  const token = selection.begin();
  controller = new AbortController();
  busy.value = true;
  try {
    const value = await workbench<{ conversation: Conversation }>(
      `/conversations/${encodeURIComponent(item.id)}`,
      undefined,
      controller.signal,
    );
    if (!selection.isCurrent(token)) return;
    conversationId.value = item.id;
    messages.value = value.conversation.messages ?? [];
  } catch {
    if (selection.isCurrent(token)) notice.value = "会话已不可用。";
  } finally {
    if (selection.isCurrent(token)) busy.value = false;
  }
}
async function remove(item: Conversation) {
  if (!window.confirm("删除此会话及其消息？此操作无法恢复。")) return;
  try {
    await aiFetch(`/conversations/${encodeURIComponent(item.id)}`, {
      method: "DELETE",
    });
    if (conversationId.value === item.id) fresh();
    await refresh();
  } catch {
    notice.value = "删除未完成，请重试。";
  }
}
async function send() {
  if (!canSend.value) return;
  const current = ++generation;
  controller = new AbortController();
  busy.value = true;
  notice.value = "";
  draft.value = "";
  const prompt = message.value.trim();
  message.value = "";
  try {
    const response = await aiFetch("/chat", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(conversationId.value
          ? { conversationId: conversationId.value }
          : {}),
        message: prompt,
        page: route.path,
        consent: true,
        web: web.value,
      }),
    });
    if (!response.body) throw Error();
    let done = false;
    await parseEventStream(response.body, (event, data) => {
      if (current !== generation) return;
      if (event === "delta") draft.value += String(data.text ?? "");
      if (event === "refusal") draft.value = "";
      if (event === "error") {
        draft.value = "";
        throw Error(String(data.error));
      }
      if (event === "done") {
        done = true;
        conversationId.value = String(data.conversationId);
        messages.value.push(
          { role: "user", content: prompt },
          {
            role: "assistant",
            content: draft.value,
            provenance: data.provenance as NonNullable<
              Conversation["messages"]
            >[number]["provenance"],
          },
        );
        draft.value = "";
      }
    });
    if (!done && current === generation) throw Error("INCOMPLETE");
    if (current === generation) await refresh();
  } catch {
    if (current === generation) {
      draft.value = "";
      message.value = prompt;
      notice.value =
        "本次回复未完成或被安全审核拒绝，未保存。请检查额度、网络或修改问题后重试。";
    }
  } finally {
    if (current === generation) busy.value = false;
  }
}
onBeforeUnmount(stop);
</script>
<template>
  <div v-if="allowed" class="global-ai no-print">
    <AssistantPetLauncher
      :open="open"
      :busy="busy"
      :responding="!!draft"
      :error="/失败|拒绝|不可用/.test(notice)"
      @toggle="open = !open"
    />
    <section
      v-if="open"
      id="global-assistant"
      class="assistant-panel"
      role="dialog"
      aria-label="全局AI助手"
    >
      <header>
        <div>
          <small>CAREERPILOT AI</small>
          <h2>随时问，接着做。</h2>
        </div>
        <button aria-label="收起AI助手" @click="open = false">×</button>
      </header>
      <p class="context">
        当前：{{ pageTitle }} · {{ session.roleLabel }} ·
        {{ enabled ? "DeepSeek LIVE" : "真实AI暂不可用" }}
      </p>
      <nav class="quick-actions" aria-label="助手快捷导航">
        <RouterLink
          v-for="action in actions"
          :key="action.path"
          :to="action.path"
          >{{ action.label }}</RouterLink
        >
      </nav>
      <details>
        <summary>历史会话（{{ history.length }}）</summary>
        <div v-for="item in history" :key="item.id" class="history-item">
          <button @click="select(item)">{{ item.title }}</button
          ><button
            :disabled="busy"
            aria-label="删除历史会话"
            @click="remove(item)"
          >
            删除
          </button>
        </div>
      </details>
      <div class="messages" aria-live="polite">
        <p v-if="!messages.length && !draft" class="empty">
          可以问：这条建议为什么适合我？下一步应该做什么？<br />助手只会解释和引导，不会自动提交或覆盖数据。
        </p>
        <article v-for="(entry, i) in messages" :key="i" :class="entry.role">
          <small>{{ entry.role === "user" ? "你" : "AI助手" }}</small>
          <p>{{ entry.content }}</p>
          <AiProvenance
            v-if="entry.role === 'assistant'"
            :value="entry.provenance"
            :historical="true"
          />
        </article>
        <article v-if="draft" class="assistant">
          <small>正在生成 · 安全审核未结束</small>
          <p>{{ draft }}</p>
        </article>
      </div>
      <p v-if="notice" role="status" class="notice">{{ notice }}</p>
      <div v-if="!isOnline" class="notice">
        离线演示请使用现有规则功能；助手需在线服务。
      </div>
      <p class="context">
        {{
          consent ? "AI默认授权已开启" : "AI已关闭，请在顶部开启"
        }}；点击发送会将消息和必要上下文脱敏后发送DeepSeek，可能产生费用，可随时在顶部关闭。
      </p>
      <label class="check"
        ><input
          v-model="web"
          type="checkbox"
        />联网补充资料（额外工具调用，结果需核实）</label
      >
      <form @submit.prevent="send">
        <textarea
          v-model="message"
          rows="3"
          maxlength="4000"
          aria-label="向AI助手提问"
          aria-describedby="assistant-keyboard-hint"
          placeholder="说说你想解决的问题…"
          :disabled="busy"
          @keydown="messageKeydown"
          @compositionstart="composing = true"
          @compositionend="composing = false"
        ></textarea
        ><small id="assistant-keyboard-hint"
          >Enter 发送 · Shift+Enter 换行</small
        >
        <div class="footer">
          <AppButton variant="ghost" size="sm" @click="fresh">新对话</AppButton
          ><AppButton v-if="busy" size="sm" variant="secondary" @click="stop"
            >停止</AppButton
          ><AppButton v-else type="submit" size="sm" :disabled="!canSend"
            >发送</AppButton
          >
        </div>
      </form>
      <small class="disclaimer"
        >AI可能出错。涉及简历保存、投递或审核，请在业务页面核对确认。</small
      >
    </section>
  </div>
</template>
<style scoped>
.global-ai {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1100;
}
.ai-launch {
  border: 0;
  border-radius: 28px;
  background: var(--brand);
  color: var(--on-brand);
  padding: 15px 22px;
  box-shadow: var(--sh-2);
  font-weight: 700;
  font-size: 15px;
}
.assistant-panel {
  position: absolute;
  right: 0;
  bottom: 66px;
  width: min(440px, calc(100vw - 32px));
  height: min(750px, calc(100dvh - 120px));
  background: var(--surface);
  color: var(--text-1);
  border: 1px solid var(--border);
  border-radius: 20px;
  box-shadow: var(--sh-2);
  display: flex;
  flex-direction: column;
  padding: 20px;
  box-sizing: border-box;
  gap: 10px;
}
.assistant-panel header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.assistant-panel h2 {
  font-size: 21px;
  margin: 5px 0;
}
.assistant-panel header button {
  border: 0;
  background: transparent;
  font-size: 28px;
  color: var(--text-2);
}
small,
.context,
.disclaimer {
  color: var(--text-2);
  font-size: 12px;
}
.context {
  margin: 0;
}
.quick-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.quick-actions a {
  padding: 6px 10px;
  background: var(--brand-soft);
  border-radius: 18px;
  color: var(--brand-text);
  font-size: 12px;
}
.messages {
  flex: 1;
  overflow: auto;
  min-height: 100px;
}
.messages article {
  padding: 12px;
  border-radius: 12px;
  background: var(--surface-2);
  margin: 10px 0;
}
.messages article.user {
  margin-left: 35px;
  background: var(--brand-soft);
}
.messages p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
  font-size: 14px;
  margin: 6px 0;
}
.empty {
  color: var(--text-2);
  padding: 20px 4px;
}
.check {
  font-size: 12px;
  display: flex;
  gap: 7px;
  line-height: 1.6;
}
textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-control);
  border-radius: 12px;
  font: inherit;
  color: var(--text-1);
  background: var(--surface);
  resize: vertical;
}
.footer {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
}
.history-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.history-item button {
  border: 0;
  background: transparent;
  color: var(--text-2);
  padding: 8px;
  text-align: left;
}
.notice {
  font-size: 12px;
  color: var(--danger-text);
}
details {
  font-size: 12px;
  max-height: 130px;
  overflow: auto;
}
@media (max-width: 600px) {
  .global-ai {
    right: 14px;
    bottom: 14px;
  }
  .assistant-panel {
    bottom: 62px;
    padding: 16px;
  }
  .ai-launch {
    padding: 12px 18px;
  }
}
</style>
<style scoped>
.global-ai {
  position: static;
}
.assistant-panel {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 1103;
  max-height: calc(100dvh - 40px);
  height: min(750px, calc(100dvh - 40px));
  overflow: auto;
}
.messages {
  min-height: 70px;
}
.assistant-panel > header {
  flex-shrink: 0;
}
@media (max-width: 600px) {
  .assistant-panel {
    right: 12px;
    bottom: 12px;
    width: calc(100vw - 24px);
    height: min(750px, calc(100dvh - 24px));
    max-height: calc(100dvh - 24px);
    padding: 16px;
  }
}
</style>
