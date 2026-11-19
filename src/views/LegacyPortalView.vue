<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import BrandMark from "../components/base/BrandMark.vue";
import AppIcon from "../components/base/AppIcon.vue";
import EntityMark from "../components/base/EntityMark.vue";
import ThemeToggle from "../components/base/ThemeToggle.vue";
import { isOnline } from "../services/runtime";
import OfficialResources from '../components/business/OfficialResources.vue';
type PublicJob = { id: string; title: string; companyId: string; cityId: string; salaryRange: { min: number; max: number } | null };
const jobs = ref<PublicJob[]>([]), companies = ref<{ id: string; name: string }[]>([]), cities = ref<{ id: string; label: string }[]>([]);
const query = ref(""), error = ref(false);
const sceneSource = ref("/media/campus-ai.jpg");
function recoverScene() { sceneSource.value = sceneSource.value === "/media/campus-ai.jpg" ? "/media/campus.jpg" : ""; }
const filtered = computed(() => jobs.value.filter((job) => `${job.title} ${company(job.companyId)}`.includes(query.value.trim())).slice(0, 4));
const company = (id: string) => companies.value.find((c) => c.id === id)?.name ?? "企业";
const city = (id: string) => cities.value.find((c) => c.id === id)?.label ?? "";
const target = (path: string) => ({ path: "/login", query: { redirect: path } });
function jump(id: string) { document.getElementById(id)?.scrollIntoView({ behavior: "auto", block: "start" }); }
async function load() {
  error.value = false;
  try {
    if (isOnline) {
      const response = await fetch("/api/public/jobs"); if (!response.ok) throw Error("UNAVAILABLE");
      const data = await response.json(); jobs.value = data.jobs; companies.value = data.companies; cities.value = data.cities;
    } else {
      const { createSeedPack } = await import("../data/seed/seed");
      const seed = createSeedPack(); jobs.value = seed.jobs.filter((j) => j.status === "published"); companies.value = seed.companies;
      cities.value = seed.dictionaries.filter((d) => d.kind === "city");
    }
  } catch { error.value = true; }
}
onMounted(load);
</script>
<template>
  <div class="portal ui-portal">
    <a class="skip-link" href="#portal-main" @click.prevent="jump('portal-main')">跳到主要内容</a>
    <header class="portal-header">
      <RouterLink to="/" aria-label="路鸣职引首页"><BrandMark :size="64" /></RouterLink>
      <p class="public-brand-slogan">闻鸣知路，循引赴职。</p>
      <nav aria-label="公共导航"><a href="#opportunities" @click.prevent="jump('opportunities')">岗位机会</a><a href="#services" @click.prevent="jump('services')">求职服务</a></nav>
      <div class="portal-tools"><ThemeToggle /><RouterLink class="portal-button" to="/login">登录工作台</RouterLink></div>
    </header>
    <main id="portal-main">
      <section class="portal-hero ui-scene ui-scene--campus">
        <div class="hero-copy"><h1>让下一步，<br />更有方向。</h1><p>从校园出发，连接值得奔赴的未来。</p>
          <div class="hero-actions"><a class="portal-button" href="#opportunities" @click.prevent="jump('opportunities')">探索岗位<AppIcon name="arrow" :size="18" /></a><RouterLink class="portal-button secondary" to="/login">进入工作台</RouterLink></div>
        </div>
        <figure class="campus-frame"><img v-if="sceneSource" :src="sceneSource" width="1200" height="800" alt="校园建筑与绿地，职业旅程从这里出发" fetchpriority="high" @error="recoverScene" /><div v-else class="campus-placeholder" role="img" aria-label="校园场景暂不可用" /><figcaption>从这里，走向更广阔的未来。</figcaption></figure>
      </section>
      <section id="services" class="service-route ui-scene ui-scene--paper" aria-label="求职服务">
        <RouterLink v-for="(item, index) in [{ title: '梳理经历', path: '/student/resume' }, { title: '发现机会', path: '/student/jobs' }, { title: '从容赴职', path: '/student/mock' }]" :key="item.path" :to="target(item.path)"><img class="editorial-thumb" :src="['/media/editorial/paper.webp', '/media/editorial/journey.webp', '/media/editorial/studio.webp'][index]" alt="" width="512" height="341" loading="lazy" /><span>0{{ index + 1 }}</span><strong>{{ item.title }}</strong><AppIcon name="arrow" :size="20" /></RouterLink>
      </section>
      <section id="opportunities" class="opportunities ui-scene ui-scene--campus">
        <div class="opportunity-heading"><div><h2>发现新的可能</h2><p v-if="!isOnline" class="caption">以下为虚构演示岗位</p></div><label class="portal-search"><AppIcon name="search" :size="18" /><input v-model="query" aria-label="搜索公开岗位" placeholder="搜索岗位或企业" /></label></div>
        <p v-if="error" role="alert">岗位暂时无法加载。<button @click="load">重新加载</button></p>
        <RouterLink v-for="job in filtered" :key="job.id" :to="target(`/student/jobs?job=${job.id}`)" class="public-job">
          <EntityMark :id="job.companyId" :name="company(job.companyId)" /><div><h3>{{ job.title }}</h3><p>{{ company(job.companyId) }}</p></div><span class="job-city">{{ city(job.cityId) }}</span><strong class="public-pay">{{ job.salaryRange ? `${job.salaryRange.min / 1000}–${job.salaryRange.max / 1000}K / 月` : '薪资面议' }}</strong><AppIcon name="chevron" :size="18" />
        </RouterLink>
        <p v-if="!error && !filtered.length" class="portal-empty">暂时没有符合条件的岗位，试试其他关键词。</p>
      </section>
      <OfficialResources v-if="isOnline" :query="query" />
      <section class="role-band ui-scene ui-scene--pipeline"><div><h2>面向你的每一种角色</h2><p>学生的成长，企业的发现，老师的支持。</p></div><RouterLink class="portal-button" to="/login">开启职业旅程<AppIcon name="arrow" :size="18" /></RouterLink></section>
    </main>
    <footer class="portal-footer"><BrandMark :size="24" /><span>闻鸣知路，循引赴职。</span><RouterLink to="/login">工作台入口</RouterLink></footer>
  </div>
</template>
<style scoped>
.portal { background: var(--surface); min-height: 100dvh; color: var(--text-1); }
.portal-header, .portal main, .portal-footer { max-width: 1440px; padding-inline: 56px; margin: auto; }
.portal-header { min-height: 96px; display: flex; align-items: center; gap: 52px; border-bottom: 1px solid var(--border); }
.portal-header nav { display: flex; gap: 32px; font-size: 15px; font-weight: 600; }
.portal-header nav a { color: var(--text-2); }
.portal-tools { margin-left: auto; display: flex; gap: 20px; align-items: center; }
.portal-button { display: inline-flex; align-items: center; justify-content: center; gap: 12px; min-height: 46px; padding: 12px 22px; color: white; background: var(--brand); border-radius: 9px; font-size: 15px; font-weight: 600; text-decoration: none; flex: none; }
.portal-button:hover { background: var(--brand-700); text-decoration: none; }
.portal-button.secondary { background: transparent; border: 1px solid var(--brand); color: var(--brand-text); }
.portal-hero { display: grid; grid-template-columns: 0.95fr 1.05fr; gap: 48px; align-items: center; padding: 52px 0 40px; }
.hero-copy h1 { font-size: clamp(36px, 4vw, 60px); line-height: 1.28; letter-spacing: -1.5px; font-weight: 750; }
.hero-copy p { font-size: 18px; color: var(--text-2); margin: 24px 0 32px; line-height: 1.8; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 16px; }
.campus-frame { margin: 0; min-width: 0; position: relative; }
.campus-frame img { width: 100%; aspect-ratio: 1.5; height: auto; object-fit: cover; border-radius: 18px; background: var(--surface-2); display: block; }
.campus-placeholder { aspect-ratio: 1.5; border-radius: 18px; background: linear-gradient(140deg, var(--brand-soft), var(--surface-2)); }
.campus-frame figcaption { font-size: 12px; color: var(--text-3); margin-top: 12px; text-align: right; }
.service-route { display: flex; justify-content: space-between; padding: 18px 0 40px; gap: 32px; scroll-margin-top: 24px; }
.service-route a { display: flex; flex: 1; align-items: center; gap: 22px; color: var(--text-1); }
.service-route a:not(:last-child)::after { content: ''; height: 1px; background: var(--border); flex: 1; }
.service-route span { font: 600 36px var(--font-mono); color: var(--brand-text); opacity: .65; }
.service-route strong { font-size: 19px; white-space: nowrap; }
.service-route svg { display: none; }
.opportunities { padding: 20px 0 44px; scroll-margin-top: 24px; }
.opportunity-heading { display: flex; justify-content: space-between; align-items: center; gap: 24px; margin-bottom: 20px; }
.opportunity-heading h2 { font-size: 27px; border-left: 5px solid var(--teal); padding-left: 15px; }
.opportunity-heading .caption { padding-left: 20px; margin-top: 8px; }
.portal-search { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--border-control); padding: 10px 0; color: var(--text-2); }
.portal-search input { width: 180px; border: 0; background: transparent; color: var(--text-1); font: 14px var(--font-sans); outline-offset: 5px; }
.public-job { display: flex; gap: 20px; align-items: center; padding: 18px 22px; margin-top: 10px; border: 1px solid var(--border); border-radius: 12px; color: var(--text-1); transition: border-color var(--t-fast), background var(--t-fast); }
.public-job:hover { text-decoration: none; background: var(--brand-soft); border-color: var(--brand); }
.public-job > div { flex: 1; min-width: 0; }
.public-job h3 { font-size: 16px; line-height: 1.6; }
.public-job p { font-size: 12px; color: var(--text-2); margin-top: 5px; }
.job-city { width: 17%; font-size: 14px; color: var(--text-2); }
.public-pay { width: 22%; font-size: 17px; color: var(--brand-text); }
.portal-empty { padding: 32px; color: var(--text-2); text-align: center; }
.role-band { display: flex; justify-content: space-between; align-items: center; gap: 32px; background: #162747; border-radius: 16px; padding: 32px 40px; margin-bottom: 32px; color: white; }
.role-band h2 { font-size: 26px; }
.role-band p { color: #becce4; font-size: 14px; margin-top: 12px; }
.portal-footer { display: flex; align-items: center; gap: 24px; padding-top: 24px; padding-bottom: 28px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-3); }
.portal-footer > a { margin-left: auto; }
@media(min-width: 1500px) { .hero-copy h1 br { display: none; } }
@media(max-width: 650px) { .hero-copy h1 { text-wrap: balance; } }
@media(max-width: 1000px) { .portal-header, .portal main, .portal-footer { padding-inline: 28px; } .portal-header { gap: 28px; } .portal-hero { gap: 28px; } .hero-copy h1 { font-size: 40px; } .hero-copy p { font-size: 15px; } .service-route { gap: 20px; } .service-route a { gap: 14px; } }
@media(max-width: 650px) { .portal-header, .portal main, .portal-footer { padding-inline: 20px; } .portal-header { min-height: 76px; gap: 12px; } .portal-header nav, .portal-tools :deep(.theme-toggle), .portal-footer > span { display: none; } .portal-header :deep(.brand-wordmark strong) { font-size: 20px; } .portal-header :deep(.brand-wordmark small) { display: none; } .portal-tools { gap: 0; } .portal-button { padding: 11px 16px; font-size: 13px; min-height: 42px; } .portal-hero { grid-template-columns: 1fr; gap: 28px; padding-top: 32px; } .hero-copy h1 { font-size: 40px; } .hero-copy h1 br { display: none; } .hero-copy p { margin: 18px 0 24px; font-size: 14px; } .campus-frame img { aspect-ratio: 1.7; } .service-route { padding-top: 0; padding-bottom: 24px; gap: 16px; } .service-route a { display: grid; gap: 8px; } .service-route span { font-size: 28px; } .service-route strong { font-size: 15px; } .service-route a::after { display: none; } .opportunity-heading { align-items: flex-start; flex-direction: column; gap: 16px; } .opportunity-heading h2 { font-size: 23px; } .portal-search { width: 100%; } .portal-search input { width: 100%; } .public-job { gap: 12px; padding: 16px 12px; flex-wrap: wrap; } .public-job > div { flex-basis: calc(100% - 70px); } .public-job > svg { display: none; } .job-city { margin-left: 56px; width: auto; } .public-pay { margin-left: auto; width: auto; font-size: 15px; } .role-band { padding: 24px; flex-direction: column; align-items: flex-start; gap: 24px; } .role-band h2 { font-size: 22px; } }
</style>
