<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { isOnline } from "../services/runtime";
import LegacyPortal from "./LegacyPortalView.vue";
import PublicHeader from "../components/public/PublicHeader.vue";
import OpportunityRows from "../components/public/OpportunityRows.vue";
import BrandMark from "../components/base/BrandMark.vue";
import AppIcon from "../components/base/AppIcon.vue";
import { api } from "../adapters/repository/http";
import type { OpportunityPage } from "../types/opportunities";
const router = useRouter(),
  query = ref(""),
  page = ref<OpportunityPage | null>(null),
  loading = ref(true),
  error = ref(false),
  scene = ref("/media/campus-ai.jpg");
const resources = [
  ["专场招聘", "https://www.ncss.cn/student/jobfair/index.html"],
  ["实习岗位", "https://www.ncss.cn/student/shixi.html"],
  ["就业指导", "https://www.ncss.cn/zdxw"],
  ["就业政策", "https://www.ncss.cn/zcxw"],
  ["求职风险提示", "https://www.ncss.cn/jyfxts"],
];
function recoverScene() {
  scene.value =
    scene.value === "/media/campus-ai.jpg" ? "/media/campus.jpg" : "";
}
async function load() {
  if (!isOnline) return;
  error.value = false;
  try {
    page.value = await api("/api/public/opportunities?pageSize=6");
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
function search() {
  void router.push({
    path: "/opportunities",
    query: query.value.trim() ? { q: query.value.trim() } : undefined,
  });
}
function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({ block: "start" });
}
onMounted(() => {
  void load();
  window.addEventListener("focus", load);
});
onUnmounted(() => window.removeEventListener("focus", load));
</script>
<template>
  <LegacyPortal v-if="!isOnline" />
  <div v-else class="public-page ui-portal">
    <a
      class="skip-link"
      href="#portal-main"
      @click.prevent="jump('portal-main')"
      >跳到主要内容</a
    ><PublicHeader />
    <main id="portal-main" class="public-container">
      <section class="portal-hero-new ui-scene ui-scene--campus">
        <div>
          <h1>让下一步，<span>更有方向。</span></h1>
          <p>发现新的可能<br />就业服务，触手可及。</p>
          <form class="public-search" role="search" @submit.prevent="search">
            <AppIcon name="search" :size="20" /><input
              v-model="query"
              aria-label="搜索公开岗位"
              placeholder="岗位、企业或专业"
              maxlength="200"
            /><button class="public-button" type="submit">搜索</button>
          </form>
          <a
            class="hero-preparation"
            href="#preparation"
            @click.prevent="jump('preparation')"
            >做好求职准备<AppIcon name="arrow" :size="17"
          /></a>
        </div>
        <figure class="portal-scene">
          <img
            v-if="scene"
            :src="scene"
            width="1200"
            height="800"
            alt="校园建筑与绿地，职业旅程从这里出发"
            fetchpriority="high"
            @error="recoverScene"
          />
        </figure>
      </section>
      <section class="public-section portal-opportunities ui-scene ui-scene--campus">
        <div class="public-heading">
          <h2>发现新的可能</h2>
          <RouterLink to="/opportunities"
            >查看全部<AppIcon name="chevron" :size="16"
          /></RouterLink>
        </div>
        <p v-if="error" role="alert" class="public-error">
          岗位暂时无法加载。<button
            class="public-button secondary"
            @click="load"
          >
            重新加载
          </button>
        </p>
        <p v-else-if="loading" role="status" class="public-empty">
          正在读取岗位…
        </p>
        <OpportunityRows v-else-if="page?.items.length" :items="page.items" />
        <p v-else class="public-empty">
          岗位信息正在整理，欢迎先完善求职准备。
        </p>
      </section>
      <section id="services" class="portal-services ui-scene ui-scene--service">
        <div>
          <h2>就业服务，触手可及。</h2>
          <p class="public-caption">国家大学生就业服务平台</p>
        </div>
        <nav aria-label="国家平台就业服务">
          <a
            v-for="[title, url] in resources"
            :key="url"
            :href="url"
            target="_blank"
            rel="noopener noreferrer"
            >{{ title }}<AppIcon name="arrow" :size="16"
          /></a>
        </nav>
      </section>
      <section id="preparation" class="public-section ui-scene ui-scene--paper">
        <div class="public-heading"><h2>为下一步，做好准备。</h2></div>
        <div class="preparation-links">
          <RouterLink
            v-for="(item, i) in [
              {
                title: '简历工作台',
                copy: '梳理经历，写出你的优势。',
                path: '/student/resume',
              },
              {
                title: '岗位匹配',
                copy: '了解要求，找到适合的方向。',
                path: '/student/jobs',
              },
              {
                title: '面试练习',
                copy: '把想法说清楚，从容面对机会。',
                path: '/student/mock',
              },
            ]"
            :key="item.path"
            :to="{ path: '/login', query: { redirect: item.path } }"
            ><img class="editorial-thumb" :src="['/media/editorial/paper.webp', '/media/editorial/journey.webp', '/media/editorial/studio.webp'][i]" alt="" width="512" height="341" loading="lazy" /><span class="preparation-number">0{{ i + 1 }}</span>
            <div>
              <h3>{{ item.title }}</h3>
              <p>{{ item.copy }}</p>
            </div>
            <AppIcon name="arrow" :size="20"
          /></RouterLink>
        </div>
      </section>
      <section class="portal-role-band ui-scene ui-scene--pipeline">
        <div>
          <h2>在同一条路上，让机会相遇。</h2>
          <p>学生的成长，企业的发现，学校的支持。</p>
        </div>
        <div>
          <RouterLink to="/register?role=student">学生注册</RouterLink
          ><RouterLink to="/register?role=company">企业入驻</RouterLink
          ><RouterLink to="/login">学校工作台</RouterLink>
        </div>
      </section>
    </main>
    <footer class="public-footer public-container">
      <BrandMark :size="26" /><span>闻鸣知路，循引赴职。</span
      ><RouterLink to="/login">工作台入口</RouterLink>
    </footer>
  </div>
</template>
<style scoped>
.portal-hero-new {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 64px;
  align-items: center;
  padding: 56px 0 24px;
}
.portal-hero-new h1 {
  font-size: clamp(40px, 4.3vw, 60px);
  line-height: 1.3;
  max-width: 530px;
  text-wrap: balance;
}
.portal-hero-new p {
  font-size: 18px;
  color: var(--text-2);
  margin: 24px 0 32px;
}
.portal-scene {
  margin: 0;
  min-width: 0;
}
.portal-scene img {
  width: 100%;
  height: auto;
  aspect-ratio: 1.5;
  object-fit: cover;
  border-radius: 18px;
  display: block;
}
.hero-preparation {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-top: 22px;
  font-size: 15px;
}
.portal-opportunities {
  padding-top: 36px;
}
.public-heading > a {
  display: flex;
  align-items: center;
  gap: 8px;
}
.portal-services {
  padding: 32px;
  background: var(--surface-2);
  border-radius: 14px;
  display: flex;
  align-items: center;
  gap: 40px;
}
.portal-services h2 {
  font-size: 22px;
}
.portal-services .public-caption {
  margin-top: 8px;
}
.portal-services nav {
  display: flex;
  flex-wrap: wrap;
  gap: 18px 28px;
  flex: 1;
  justify-content: flex-end;
}
.portal-services a {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  min-height: 44px;
}
.preparation-links {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 36px;
}
.preparation-links > a {
  display: flex;
  align-items: center;
  gap: 20px;
  color: var(--text-1);
  padding: 24px 0;
  border-top: 1px solid var(--border);
}
.preparation-number {
  font: 500 32px var(--font-mono);
  color: var(--brand-text);
}
.preparation-links h3 {
  font-size: 19px;
}
.preparation-links p {
  font-size: 14px;
  color: var(--text-2);
  margin-top: 8px;
}
.preparation-links svg {
  margin-left: auto;
  flex: none;
}
.portal-role-band {
  background: #162747;
  color: #fff;
  border-radius: 14px;
  padding: 40px;
  margin-bottom: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
}
.portal-role-band h2 {
  font-size: 26px;
}
.portal-role-band p {
  font-size: 15px;
  color: #c4d0e6;
  margin-top: 12px;
}
.portal-role-band > div:last-child {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}
.portal-role-band a {
  color: #fff;
  font-size: 15px;
  min-height: 44px;
  display: flex;
  align-items: center;
}
@media (max-width: 1000px) {
  .portal-hero-new {
    gap: 32px;
  }
  .portal-hero-new h1 {
    font-size: 44px;
  }
  .portal-services {
    align-items: flex-start;
    flex-direction: column;
    gap: 20px;
  }
  .portal-services nav {
    justify-content: flex-start;
  }
  .preparation-links {
    gap: 20px;
  }
  .preparation-links > a {
    gap: 12px;
  }
  .preparation-number {
    font-size: 26px;
  }
  .preparation-links svg {
    display: none;
  }
  .portal-role-band {
    align-items: flex-start;
    flex-direction: column;
  }
}
@media (max-width: 650px) {
  .portal-hero-new {
    grid-template-columns: 1fr;
    padding-top: 32px;
    gap: 28px;
  }
  .portal-hero-new h1 {
    font-size: 40px;
    max-width: 340px;
    line-height: 1.35;
  }
  .portal-hero-new p {
    font-size: 16px;
    margin: 18px 0 24px;
  }
  .portal-scene img {
    aspect-ratio: 1.75;
  }
  .portal-services {
    padding: 24px;
  }
  .portal-services nav {
    gap: 8px 24px;
  }
  .preparation-links {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .preparation-links > a {
    padding: 24px 0;
    gap: 20px;
  }
  .preparation-links svg {
    display: block;
  }
  .portal-role-band {
    padding: 28px 24px;
  }
  .portal-role-band h2 {
    font-size: 23px;
  }
  .portal-role-band > div:last-child {
    gap: 24px;
  }
}
</style>
