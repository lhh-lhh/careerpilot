<script setup lang="ts">
import { computed } from "vue";
import AppTag from "./AppTag.vue";
import AppButton from "./AppButton.vue";
import AiProvenance from '../business/AiProvenance.vue';
import type { AiProvenance as Provenance } from '../../types/ai-workbench';
defineEmits<{ cancel: [] }>();
const props = defineProps<{
  mode: "LIVE" | "REPLAY" | "RULE";
  origin: "MODEL" | "CURATED" | "RULE";
  loading?: boolean;
  reason?: string;
  traceId?: string;
  provenance?: Provenance;
}>();
const label = computed(
  () =>
    ({ MODEL: "模型生成", CURATED: "人工审校示例", RULE: "本地规则" })[
      props.origin
    ],
);
</script>
<template>
  <section class="ai-block" :aria-busy="loading || undefined">
    <header>
      <AppTag tone="ai">{{ mode }} · {{ label }}</AppTag
      ><AppButton
        v-if="loading"
        variant="ghost"
        size="sm"
        @click="$emit('cancel')"
        >停止生成</AppButton
      >
    </header>
    <AiProvenance v-if="mode==='LIVE'&&origin==='MODEL'&&provenance" :value="provenance" />
    <small v-else-if="mode==='LIVE'&&origin==='MODEL'&&traceId">DeepSeek 实时生成 · 请求 {{ traceId }}</small>
    <slot />
    <details v-if="$slots.evidence || reason">
      <summary>查看依据与来源</summary>
      <p v-if="reason">{{ reason }}</p>
      <slot name="evidence" />
    </details>
    <footer>请核实 · 可驳回</footer>
  </section>
</template>
<style scoped>
.ai-block {
  position: relative;
  padding: 20px 24px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  font-size: 14px;
  overflow: hidden;
}
.ai-block::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 2px;
  background: var(--ai-grad);
}
.ai-block header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.ai-block footer {
  color: var(--text-3);
  font-size: 12px;
  margin-top: 16px;
}
.ai-block details {
  margin-top: 16px;
  color: var(--text-2);
}
.ai-block summary {
  cursor: pointer;
  color: var(--ai-text);
}
.ai-block details p {
  margin-top: 8px;
}
</style>
