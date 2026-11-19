<script setup lang="ts">
withDefaults(defineProps<{ value: number; label?: string; size?: number }>(), {
  label: "分",
  size: 112,
});
</script>
<template>
  <div
    class="score-ring"
    :style="{ width: `${size}px`, height: `${size}px`, '--score-font': `${Math.max(16, Math.round(size * .285))}px`, '--score-label': `${size < 80 ? 10 : 12}px` }"
    :aria-label="`${value}${label}`"
  >
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle class="track" cx="60" cy="60" r="51" />
      <circle
        class="value"
        cx="60"
        cy="60"
        r="51"
        :stroke-dasharray="`${Math.min(100, Math.max(0, value)) * 3.2044} 320.44`"
      />
    </svg>
    <div>
      <strong>{{ value }}</strong
      ><span>{{ label }}</span>
    </div>
  </div>
</template>
<style scoped>
.score-ring {
  position: relative;
  flex: none;
}
.score-ring svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
circle {
  fill: none;
  stroke-width: 7;
}
.track {
  stroke: var(--surface-2);
}
.value {
  stroke: var(--brand-text);
  stroke-linecap: round;
}
.score-ring > div {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}
.score-ring strong {
  font: 600 var(--score-font) var(--font-mono);
  letter-spacing: 0;
}
.score-ring span {
  font-size: var(--score-label);
  color: var(--text-2);
}
</style>
