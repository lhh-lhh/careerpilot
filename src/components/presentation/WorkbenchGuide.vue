<script setup lang="ts">
defineProps<{ title: string; copy: string; image?: string }>();
</script>
<template>
  <aside class="workbench-guide" :class="{ 'workbench-visual-guide': image }">
    <img v-if="image" :src="image" alt="" width="384" height="341" loading="lazy" />
    <div class="workbench-guide-content"><p class="workbench-insight-mark">CAREERPILOT / 阅读指引</p><h2>{{ title }}</h2><div class="workbench-guide-rule" aria-hidden="true"></div><p>{{ copy }}</p><slot /></div>
  </aside>
</template>
