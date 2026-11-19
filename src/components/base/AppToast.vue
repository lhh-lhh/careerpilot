<script setup lang="ts">
import AppIcon from "./AppIcon.vue";
defineProps<{ message: string }>();
defineEmits<{ close: [] }>();
</script>
<template>
  <Teleport to="body"><div v-if="message" class="toast no-print" role="status">
    <AppIcon name="check" :size="18" /><span>{{ message }}</span
    ><button aria-label="关闭提示" @click="$emit('close')">
      <AppIcon name="close" :size="16" />
    </button>
  </div></Teleport>
</template>
<style scoped>
.toast {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--text-1);
  color: var(--surface);
  padding: 14px 16px;
  border-radius: var(--r-control);
  box-shadow: var(--sh-3);
  max-width: calc(100vw - 32px);
  z-index: 1500;
  font-size: 14px;
  width: max-content;
  border: 1px solid var(--border-control);
  border-left: 4px solid var(--teal);
}
.toast > span { min-width: 0; overflow-wrap: anywhere; }
.toast button {
  display: flex;
  padding: 4px;
  background: none;
  border: none;
  color: inherit;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  flex: none;
  border-radius: 8px;
}
.toast button:hover { background: color-mix(in srgb, currentColor 15%, transparent); }
</style>
