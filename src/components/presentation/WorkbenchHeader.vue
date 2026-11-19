<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useSessionStore } from '../../stores/session';
import { isOnline } from '../../services/runtime';
import { workbenchDesign } from '../../presentation/workbench-design';
const route = useRoute(), session = useSessionStore();
const design = computed(() => workbenchDesign(route.path, session.actor?.role ?? 'shared', isOnline));
</script>
<template>
  <section class="workbench-header" :data-design="design.id" :data-layout="design.type">
    <header class="workbench-hero">
      <div class="workbench-hero-copy"><slot name="heading" :design="design" /></div>
      <div class="workbench-hero-art" aria-hidden="true">
        <img :src="design.type === 'practice' ? '/media/career/practice-banner.webp' : `/media/workbench/${design.art}.webp`" alt="" width="384" height="341" fetchpriority="high" />
      </div>
    </header>
    <div v-if="$slots.actions" class="workbench-action-rail"><span class="workbench-rail-label">本页操作 / 相关入口</span><slot name="actions" /></div>
  </section>
</template>
