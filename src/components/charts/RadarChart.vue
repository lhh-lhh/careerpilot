<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{
  values: { label: string; value: number }[];
  title: string;
}>();
const point = (i: number, radius: number) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / props.values.length;
  return `${160 + Math.cos(a) * radius},${130 + Math.sin(a) * radius}`;
};
const shape = computed(() =>
  props.values
    .map((v, i) => point(i, Math.min(100, Math.max(0, v.value)) * 0.82))
    .join(" "),
);
</script>
<template>
  <figure class="radar">
    <svg viewBox="0 0 320 260" role="img" :aria-label="title">
      <polygon
        v-for="r in [20, 40, 60, 82]"
        :key="r"
        :points="values.map((_, i) => point(i, r)).join(' ')"
        class="grid"
      />
      <line
        v-for="(_, i) in values"
        :key="i"
        x1="160"
        y1="130"
        :x2="point(i, 82).split(',')[0]"
        :y2="point(i, 82).split(',')[1]"
        class="grid"
      />
      <polygon :points="shape" class="area" />
      <text
        v-for="(v, i) in values"
        :key="v.label"
        :x="point(i, 112).split(',')[0]"
        :y="Number(point(i, 112).split(',')[1]) + 4"
        text-anchor="middle"
      >
        {{ v.label }}
      </text>
    </svg>
    <figcaption class="sr-only">
      {{ values.map((v) => `${v.label} ${v.value}分`).join("，") }}
    </figcaption>
  </figure>
</template>
<style scoped>
.radar {
  margin: 0;
}
.radar svg {
  width: 100%;
  max-height: 260px;
}
.grid {
  fill: none;
  stroke: var(--border);
  stroke-width: 1;
}
.area {
  fill: var(--brand-soft);
  stroke: var(--brand-text);
  stroke-width: 1.5;
}
.radar text {
  font: 12px var(--font-sans);
  fill: var(--text-2);
}
</style>
