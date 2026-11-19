<script setup lang="ts">
import { ref, watch } from "vue";
import AppModal from "../base/AppModal.vue";
import AppButton from "../base/AppButton.vue";
import AppInput from "../base/AppInput.vue";
import AppIcon from "../base/AppIcon.vue";
import { useAiConnectionStore } from "../../stores/aiConnection";
const props = defineProps<{ open: boolean }>();
defineEmits<{ close: [] }>();
const connection = useAiConnectionStore(),
  code = ref(""),
  paid = ref(false),
  error = ref("");
watch(
  () => props.open,
  () => {
    code.value = "";
    paid.value = false;
    error.value = "";
  },
);
const messages: Record<string, string> = {
  PAIRING_FAILED: "配对失败。请核对本机终端中的有效配对码。",
  PAIRING_REQUIRED: "配对已失效，请重启网关取得新码。",
  PROVIDER_DISABLED: "网关尚未启用或未配置。请按本机说明设置并重启。",
  NETWORK_ERROR: "无法连接本机网关，请确认 8787 服务已启动。",
  AUTH_FAILED: "供应商认证失败，请在本机检查配置后重启。",
  QUOTA_EXCEEDED: "供应商额度不足。请先使用本地回放。",
  RATE_LIMITED: "请求频率已到限制，不会自动重试。",
  TIMEOUT: "本次请求超时，可能已产生费用，不会自动重试。",
  BUDGET_EXCEEDED: "本机进程预算已达软限制，请使用本地回放。",
};
async function perform(action: () => void | Promise<void>) {
  error.value = "";
  try {
    await action();
    code.value = "";
  } catch (e) {
    const key = e instanceof Error ? e.message : "UPSTREAM_ERROR";
    error.value = messages[key] ?? `连接操作失败（${key}），没有自动重试。`;
  }
}
</script>
<template>
  <AppModal data-scene="studio" :open="open" title="本机 AI 连接" @close="$emit('close')">
    <div class="connection-intro">
      <span class="connection-symbol"><AppIcon name="lock" :size="23" /></span>
      <div>
        <h3>增强表达，决定权留给你。</h3>
        <p>本机网关连接 DeepSeek；离线回放与本地规则始终可用。</p>
      </div>
    </div>
    <p class="connection-status" role="status">
      <span :class="{ ready: connection.paired }"></span
      >{{ connection.stateLabel }}
    </p>
    <ol class="connection-steps">
      <li>
        <span class="step-number">1</span>
        <section>
          <h3>配对本机网关</h3>
          <p>
            在启动终端查看 8 位配对码，5 分钟内有效。网页不会读取或保存你的 API
            Key。
          </p>
          <form
            v-if="!connection.paired"
            @submit.prevent="perform(() => connection.pair(code))"
          >
            <AppInput
              v-model="code"
              label="一次性配对码"
              placeholder="输入终端中的 8 位数字"
              :disabled="connection.busy"
            /><AppButton
              type="submit"
              :loading="connection.busy"
              :disabled="!/^\d{8}$/.test(code)"
              >配对本机网关</AppButton
            >
          </form>
          <dl v-else>
            <div>
              <dt>供应商</dt>
              <dd>DeepSeek 官方 API</dd>
            </div>
            <div>
              <dt>配置模型</dt>
              <dd>{{ connection.model }}</dd>
            </div>
          </dl>
        </section>
      </li>
      <li :class="{ inactive: !connection.paired }">
        <span class="step-number">2</span>
        <section>
          <h3>确认费用，再测试</h3>
          <p>仅发送固定连接测试，不发送业务数据。失败不会自动重试。</p>
          <label class="paid-consent"
            ><input
              v-model="paid"
              type="checkbox"
              :disabled="!connection.paired || connection.busy"
            />我理解本次测试将调用供应商 API，可能产生费用</label
          ><AppButton
            variant="secondary"
            :disabled="
              !paid ||
              !connection.paired ||
              !connection.configured ||
              !connection.gatewayEnabled
            "
            :loading="connection.busy"
            @click="perform(() => connection.testConnection(paid))"
            >执行付费连接测试</AppButton
          >
        </section>
      </li>
      <li :class="{ inactive: !connection.tested }">
        <span class="step-number">3</span>
        <section>
          <h3>手动启用本次会话</h3>
          <p>
            启用后，每次业务外发仍需预览并确认。刷新后配对失效；切角色会撤销外发同意。
          </p>
          <AppButton
            v-if="!connection.enabled"
            :disabled="!connection.tested || connection.busy"
            @click="perform(() => connection.enableLive())"
            >启用本次 LIVE</AppButton
          ><AppButton
            v-else
            variant="secondary"
            @click="connection.disableLive()"
            >停用 LIVE 并解除配对</AppButton
          >
        </section>
      </li>
    </ol>
    <p v-if="error" class="connection-error" role="alert">{{ error }}</p>
    <p class="budget-note">
      进程最多 20 次上游尝试；累计 10000 tokens
      为软停止阈值，不是硬费用保证。网关重启会清本机计数。请使用供应商控制台管理实际余额。
    </p>
    <template #footer
      ><AppButton
        v-if="connection.paired && !connection.enabled"
        variant="ghost"
        @click="connection.unpair()"
        >解除配对</AppButton
      ><AppButton variant="secondary" @click="$emit('close')"
        >完成</AppButton
      ></template
    >
  </AppModal>
</template>
<style scoped>
.connection-intro {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.connection-symbol {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  background: var(--brand-soft);
  color: var(--brand-text);
  border-radius: 12px;
}
.connection-intro h3 {
  font-size: 17px;
  line-height: 1.5;
}
.connection-intro p,
.connection-steps p {
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-2);
  margin-top: 5px;
}
.connection-status {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 14px 0 20px;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
}
.connection-status > span {
  width: 7px;
  height: 7px;
  background: var(--text-3);
  border-radius: 50%;
}
.connection-status > .ready {
  background: var(--brand);
}
.connection-steps {
  padding: 0;
  margin: 24px 0;
  display: grid;
  gap: 24px;
  list-style: none;
}
.connection-steps li {
  display: flex;
  gap: 14px;
}
.step-number {
  width: 25px;
  height: 25px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: 1px solid var(--border-control);
  border-radius: 50%;
  color: var(--brand-text);
  font-size: 12px;
  font-weight: 700;
}
.connection-steps section {
  min-width: 0;
  flex: 1;
}
.connection-steps h3 {
  font-size: 14px;
  line-height: 25px;
}
.connection-steps form {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}
.connection-steps .app-button {
  margin-top: 12px;
  width: 100%;
  white-space: normal;
}
.connection-steps form .app-button {
  margin: 0;
}
.connection-steps dl {
  font-size: 13px;
  padding: 12px 0 0;
  display: grid;
  gap: 5px;
}
.connection-steps dl > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.connection-steps dt {
  color: var(--text-3);
}
.connection-steps dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.paid-consent {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  line-height: 1.7;
  margin-top: 12px;
  color: var(--text-2);
}
.paid-consent input {
  margin: 4px 0 0;
  accent-color: var(--brand);
}
.inactive h3 {
  color: var(--text-2);
}
.budget-note {
  font-size: 11px;
  line-height: 1.8;
  color: var(--text-3);
  padding-top: 18px;
  border-top: 1px solid var(--border);
}
.connection-error {
  font-size: 13px;
  color: var(--danger-text);
  line-height: 1.7;
  margin-bottom: 16px;
}
</style>
