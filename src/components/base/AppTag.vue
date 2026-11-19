<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: "brand" | "success" | "warn" | "danger" | "ai" | "neutral";
  }>(),
  { tone: "neutral" },
);
</script>
<template>
  <span :class="['tag', `tag-${tone}`]"
    ><span class="tag-dot" aria-hidden="true"></span><slot
  /></span>
</template>
<style scoped>
.tag {
  align-self: center;
  justify-self: start;
  flex-shrink: 1;
  min-width: 0;
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: var(--r-sm);
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
  background: var(--surface-2);
  white-space: normal;
  overflow-wrap: anywhere;
}
.tag-dot {
  flex: none;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}
.tag-brand {
  color: var(--brand-text);
  background: var(--brand-soft);
}
.tag-success {
  color: var(--success-text);
  background: var(--success-soft);
}
.tag-warn {
  color: var(--warn-text);
  background: var(--warn-soft);
}
.tag-danger {
  color: var(--danger-text);
  background: var(--danger-soft);
}
.tag-ai {
  color: var(--ai-text);
  background: var(--ai-soft);
}
</style>
