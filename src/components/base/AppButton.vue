<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md" | "lg";
    loading?: boolean;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
  }>(),
  { variant: "primary", size: "md", type: "button" },
);
</script>
<template>
  <button
    :type="type"
    :class="['app-button', `button-${variant}`, `button-${size}`]"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <span v-if="loading" class="button-spinner" aria-hidden="true"></span
    ><slot />
  </button>
</template>
<style scoped>
.app-button {
  align-self: center;
  justify-self: start;
  flex-shrink: 0;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 10px 20px;
  border: 1px solid transparent;
  border-radius: var(--r-control);
  font-size: 14px;
  line-height: 1.4;
  font-weight: 600;
  transition:
    background var(--t-fast),
    transform var(--t-fast),
    box-shadow var(--t-fast);
  white-space: nowrap;
}
.button-primary {
  background: var(--brand);
  color: var(--on-brand);
}
.button-primary:hover:not(:disabled) {
  background: var(--brand-700);
  box-shadow: var(--sh-2);
}
.button-secondary {
  background: var(--surface);
  color: var(--text-1);
  border-color: var(--border-control);
}
.button-secondary:hover:not(:disabled) {
  background: var(--surface-2);
}
.button-ghost {
  color: var(--text-2);
  background: transparent;
}
.button-ghost:hover:not(:disabled) {
  color: var(--brand-text);
  background: var(--brand-soft);
}
.button-danger {
  background: var(--danger-soft);
  color: var(--danger-text);
  border-color: var(--danger-text);
}
.button-danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--danger-text) 12%, var(--danger-soft));
  box-shadow: var(--sh-1);
}
.button-sm {
  min-height: 34px;
  padding: 6px 12px;
  font-size: 13px;
}
.button-lg {
  min-height: 52px;
  padding: 14px 24px;
  font-size: 16px;
}
.app-button:active:not(:disabled) {
  transform: translateY(1px);
}
.app-button:disabled {
  background: var(--disabled-bg);
  color: var(--disabled-fg);
  border-color: var(--border);
  box-shadow: none;
}
.button-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: rotate 900ms linear infinite;
}
@keyframes rotate {
  to {
    transform: rotate(360deg);
  }
}
</style>
