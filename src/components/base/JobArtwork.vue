<script setup lang="ts">
import { jobArtwork } from '../../presentation/job-artwork';
defineProps<{title: string; identity: string; index?: number; src?: string}>();
</script>
<template>
  <span class="job-artwork" aria-hidden="true"><img :src="src || jobArtwork(title, identity, index)" alt="" loading="lazy" width="160" height="110" /></span>
</template>
<style scoped>
.job-artwork { display:block; width:106px; height:72px; flex:none; border-radius:10px; overflow:hidden; background:#eaf4ff; }
img { width:100%;height:100%;object-fit:cover; }
</style>
