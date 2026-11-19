<script setup lang="ts">
withDefaults(
  defineProps<{ size?: number; wordmark?: boolean; vertical?: boolean }>(),
  {
    size: 40,
    wordmark: true,
    vertical: false,
  },
);
</script>
<template>
  <div class="brand-mark" :class="{ 'brand-vertical': vertical }">
    <svg
      :width="size"
      :height="size"
      viewBox="0 0 40 40"
      role="img"
      aria-label="路鸣职引徽记"
    >
      <circle
        cx="20"
        cy="20"
        r="19"
        fill="none"
        stroke="currentColor"
        stroke-opacity=".18"
      />
      <path
        d="M8 31 C13 27 13 22 18 19 S27 13 31 9"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-dasharray="2.5 3"
        stroke-linecap="round"
      />
      <path
        v-if="size > 16"
        d="M10 15 Q13 11 16 15 M12 19 Q16 14 20 19"
        fill="none"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linecap="round"
        opacity=".75"
      />
      <circle cx="31" cy="9" r="2.6" class="brand-star" />
      <path
        d="M28 6 L28 3 M33 12 L36 12"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
        opacity=".6"
      />
      <image href="/media/career/brand.webp" x="0" y="0" width="40" height="40" />
    </svg>
    <div v-if="wordmark" class="brand-wordmark">
      <strong>路鸣职引</strong><span>CareerPilot</span>
    </div>
    <span v-if="vertical" class="brand-slogan">闻鸣知路，循引赴职</span>
  </div>
</template>
<style scoped>
.brand-mark {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--brand-text);
  flex-shrink: 0;
}
.brand-mark > svg {
  background: var(--brand-soft);
  border: 1px solid color-mix(in srgb, var(--brand-text) 28%, var(--surface));
  border-radius: 28%;
  padding: 3px;
}
.brand-star {
  fill: var(--ai);
}
.brand-vertical {
  flex-direction: column;
  text-align: center;
  gap: 12px;
}
.brand-vertical .brand-wordmark strong {
  font-size: 24px;
}
.brand-slogan {
  font-family: serif;
  font-size: 13px;
  color: var(--text-3);
}
.brand-wordmark {
  display: flex;
  flex-direction: column;
}
.brand-wordmark strong {
  color: var(--brand-text);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: 1.2px;
}
.brand-wordmark span {
  color: var(--text-3);
  font-size: 12px;
  letter-spacing: 1.5px;
}
</style>
