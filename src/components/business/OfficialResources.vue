<script setup lang="ts">
import {computed,onMounted,ref} from 'vue';
import {api} from '../../adapters/repository/http';
import type {PublicResource} from '../../../server/public-resources';
const props=defineProps<{query?:string}>(),rows=ref<PublicResource[]>([]),error=ref(false);
const jobs=computed(()=>rows.value.filter(r=>r.kind==='job'&&`${r.title} ${r.employer} ${r.location}`.includes(props.query?.trim()??'')));
const services=computed(()=>rows.value.filter(r=>r.kind!=='job'));
async function load(){error.value=false;try{rows.value=(await api<{resources:PublicResource[]}>('/api/public/resources')).resources;}catch{error.value=true;}}
onMounted(load);
</script>
<template>
  <section class="official-resources" aria-label="国家平台公开资源"><h2>国家平台机会</h2><p class="caption">来源：国家大学生就业服务平台 · 详情与申请以原站为准。</p>
    <p v-if="error" role="alert">公开资源暂不可用。<button @click="load">重试</button></p>
    <a v-for="job in jobs" :key="job.id" :href="job.url" target="_blank" rel="noopener noreferrer" class="official-job"><div><h3>{{ job.title }}</h3><p>{{ job.employer }} · {{ job.location }}</p></div><span>原站查看 ↗</span></a>
    <p v-if="!error && !jobs.length">暂无符合关键词的外部岗位。</p>
    <nav aria-label="官方就业服务"><a v-for="item in services" :key="item.id" :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.title }} ↗</a></nav>
    <small v-if="rows[0]">信息核对日期 {{ rows[0].observedAt.slice(0,10) }}；截止日期未提供，请在原站确认是否仍在招聘。</small>
  </section>
</template>
<style scoped>
.official-resources{margin:28px 0;padding:24px 0;border-top:1px solid var(--border)}.official-resources h2{font-size:24px;margin-bottom:10px}.official-job{display:flex;gap:20px;align-items:center;justify-content:space-between;border:1px solid var(--border);border-radius:10px;padding:18px 22px;margin-top:12px;color:var(--text-1)}.official-job:hover{border-color:var(--brand);background:var(--brand-soft);text-decoration:none}.official-job h3{font-size:17px}.official-job p{color:var(--text-2);font-size:14px;margin-top:8px}.official-job span{white-space:nowrap;font-size:14px;color:var(--brand-text)}.official-resources nav{display:flex;gap:20px;flex-wrap:wrap;margin:24px 0 16px}.official-resources small{color:var(--text-2);font-size:12px;line-height:1.7;display:block}@media(max-width:600px){.official-job{padding:16px;align-items:flex-start}.official-job span{font-size:12px}}
</style>
