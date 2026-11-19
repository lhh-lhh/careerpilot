<script setup lang="ts">
import type { Opportunity } from "../../types/opportunities";
import AppIcon from "../base/AppIcon.vue";
import JobArtwork from "../base/JobArtwork.vue";
import { jobArtworkBatch } from '../../presentation/job-artwork';
defineProps<{ items: Opportunity[] }>();
</script>
<template>
  <div class="opportunity-rows">
    <article v-for="(job, i) in items" :key="job.id" class="opportunity-row">
      <JobArtwork class="opportunity-identity" :title="job.title" :identity="job.id" :src="jobArtworkBatch(items)[i]" />
      <div class="opportunity-name">
        <RouterLink
          :to="{
            path: `/opportunities/${encodeURIComponent(job.id)}`,
            query: { from: $route.fullPath },
          }"
          >{{ job.title }}</RouterLink
        >
        <p>{{ job.employer }}</p>
      </div>
      <div class="opportunity-meta">
        <span>{{ job.location || "地点待确认" }}</span
        ><span>{{ job.degree || "学历见原站" }}</span
        ><span v-if="job.freshness === 'needsUpdate'" class="public-warning"
          >信息待更新</span
        >
      </div>
      <strong class="opportunity-pay">{{ job.salaryText }}</strong>
      <span
        class="opportunity-source"
        :class="{ external: job.kind === 'external' }"
        >{{ job.kind === "local" ? "本站办理" : "原站申请" }}</span
      >
      <AppIcon name="chevron" :size="18" />
    </article>
  </div>
</template>
