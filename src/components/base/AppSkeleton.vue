<script setup lang="ts">
withDefaults(defineProps<{ width?: string; height?: string }>(), {
  width: "100%",
  height: "16px",
});
</script>
<template>
  <div class="skeleton" :style="{ width, height }" aria-hidden="true"></div>
</template>
<style scoped>
.skeleton {
  border-radius: 6px;
  background: var(--surface-2);
  animation: breathe 1.5s ease-in-out infinite;
}
@keyframes breathe {
  50% {
    opacity: 0.45;
  }
}
</style>
