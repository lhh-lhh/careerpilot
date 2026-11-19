<script setup lang="ts">
import { computed, ref, watch } from "vue";
const props = withDefaults(defineProps<{ id: string; name?: string; size?: number; src?: string }>(), { name: "企业", size: 44, src: "" });
const failed = ref(false);
watch(() => props.src, () => { failed.value = false; });
const variant = computed(() => [...props.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 5);
const colors = ["#2f55c8", "#0b8179", "#7852b5", "#bc681e", "#37679c"];
</script>
<template>
  <span class="entity-mark" :style="{ width: `${size}px`, height: `${size}px`, '--entity-color': colors[variant] }" :title="name" aria-hidden="true">
    <img v-if="src && !failed" :src="src" alt="" @error="failed = true" />
    <svg v-else viewBox="0 0 40 40" fill="none">
      <template v-if="variant === 0"><path d="M8 29V11h7l5 10 5-10h7v18h-6V20l-6 10-6-10v9Z" fill="currentColor" /></template>
      <template v-else-if="variant === 1"><path d="m20 6 13 8v13l-13 8-13-8V14Z" stroke="currentColor" stroke-width="3" /><path d="m8 14 12 8 12-8M20 22v12" stroke="currentColor" stroke-width="3" /></template>
      <template v-else-if="variant === 2"><path d="M7 30 20 7l13 23H7Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round" /><path d="M14 30 26 18M10 24h20" stroke="currentColor" stroke-width="3" /></template>
      <template v-else-if="variant === 3"><path d="M9 28V12h7v10h8V12h7v16H9Z" fill="currentColor" /><circle cx="20" cy="10" r="3" fill="currentColor" /></template>
      <template v-else><path d="M8 28V12h9l6 8h9v8H8Z" fill="currentColor" /><path d="m15 12 7-5 10 13" stroke="currentColor" stroke-width="3" stroke-linejoin="round" /></template>
    </svg>
  </span>
</template>
<style scoped>
.entity-mark { display: inline-grid; place-items: center; flex: none; color: var(--entity-color); background: color-mix(in srgb, var(--entity-color) 8%, var(--surface)); border: 1px solid color-mix(in srgb, var(--entity-color) 12%, var(--border)); border-radius: 11px; overflow: hidden; }
svg { width: 78%; height: 78%; }
img { width: 100%; height: 100%; object-fit: contain; padding: 4px; }
</style>
