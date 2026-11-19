<script setup lang="ts">
import { useId } from "vue";
defineProps<{
  label: string;
  options: { value: string; label: string }[];
  helper?: string;
  error?: string;
  disabled?: boolean;
}>();
const model = defineModel<string>({ default: "" });
const id = useId();
</script>
<template>
  <div class="field">
    <label :for="id">{{ label }}</label
    ><select
      :id="id"
      v-model="model"
      :disabled="disabled"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="error || helper ? `${id}-hint` : undefined"
    >
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option></select
    ><small v-if="error || helper" :id="`${id}-hint`">{{
      error || helper
    }}</small>
  </div>
</template>
<style scoped>
.field {
  min-width: 0;
  display: grid;
  gap: 8px;
  font-size: 14px;
}
.field label {
  font-weight: 600;
}
.field select {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 10px 12px;
  color: var(--text-1);
  background: var(--surface);
  border: 1px solid var(--border-control);
  border-radius: var(--r-control);
  transition: border-color var(--t-fast), box-shadow var(--t-fast);
}
.field select:hover:not(:disabled):not([aria-invalid="true"]) { border-color: var(--brand-text); }
.field select:focus-visible { border-color: var(--brand-text); box-shadow: 0 0 0 3px var(--brand-soft); }
.field select[aria-invalid="true"] { border: 2px solid var(--danger-text); padding: 9px 11px; }
.field select[aria-invalid="true"] + small { color: var(--danger-text); }
.field select:disabled { background: var(--disabled-bg); color: var(--disabled-fg); }
.field small {
  color: var(--text-2);
}
</style>
