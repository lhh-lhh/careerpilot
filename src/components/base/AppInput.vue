<script setup lang="ts">
import { useId } from "vue";
withDefaults(
  defineProps<{
    label: string;
    helper?: string;
    error?: string;
    disabled?: boolean;
    placeholder?: string;
    type?: string;
    required?: boolean;
  }>(),
  { type: "text", helper: "", error: "", placeholder: "" },
);
const model = defineModel<string>({ default: "" });
const id = useId();
</script>
<template>
  <div class="field">
    <label :for="id"
      >{{ label }}<span v-if="required" class="required"> *</span></label
    ><input
      :id="id"
      v-model="model"
      :type="type"
      :disabled="disabled"
      :placeholder="placeholder"
      :required="required"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="error || helper ? `${id}-hint` : undefined"
    /><small
      v-if="error || helper"
      :id="`${id}-hint`"
      :class="{ 'field-error': error }"
      >{{ error || helper }}</small
    >
  </div>
</template>
<style scoped>
.field {
  display: grid;
  gap: 8px;
}
.field label {
  color: var(--text-1);
  font-weight: 600;
  font-size: 14px;
}
.field input {
  min-width: 0;
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--border-control);
  border-radius: var(--r-control);
  background: var(--surface);
  color: var(--text-1);
  transition: border-color var(--t-fast), box-shadow var(--t-fast);
}
.field input:hover:not(:disabled):not([aria-invalid="true"]) { border-color: var(--brand-text); }
.field input:focus-visible { border-color: var(--brand-text); box-shadow: 0 0 0 3px var(--brand-soft); }
.field input::placeholder {
  color: var(--text-3);
}
.field input[aria-invalid="true"] {
  border-color: var(--danger-text);
  border-width: 2px;
  padding: 9px 11px;
}
.field input:disabled {
  background: var(--disabled-bg);
  color: var(--disabled-fg);
}
.field small {
  color: var(--text-2);
  line-height: 1.5;
}
.field .field-error,
.required {
  color: var(--danger-text);
}
</style>
