<script setup lang="ts">
import { useThemeStore } from "../../stores/theme";
import AppIcon from "./AppIcon.vue";
const theme = useThemeStore();
</script>
<template>
  <button
    class="theme-toggle"
    :aria-label="theme.theme === 'light' ? '切换到深色主题' : '切换到浅色主题'"
    @click="theme.toggle"
  >
    <AppIcon :name="theme.theme === 'light' ? 'moon' : 'sun'" :size="18" />
  </button>
</template>
<style scoped>
.theme-toggle {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--border);
  border-radius: 50%;
  color: var(--text-2);
  background: var(--surface);
}
.theme-toggle:hover {
  border-color: var(--border-control);
  color: var(--brand-text);
}
</style>
