<script setup lang="ts">
import BrandMark from "../base/BrandMark.vue";
import ThemeToggle from "../base/ThemeToggle.vue";
import { useSessionStore } from "../../stores/session";
import { roleHome } from "../../types/identity";
const session = useSessionStore();
</script>
<template>
  <header class="public-header public-container">
    <RouterLink to="/" aria-label="路鸣职引首页"
      ><BrandMark :size="64"
    /></RouterLink>
    <p class="public-brand-slogan">闻鸣知路，循引赴职。</p>
    <nav aria-label="公共导航">
      <RouterLink to="/">首页</RouterLink>
      <RouterLink to="/opportunities">岗位机会</RouterLink
      ><RouterLink :to="{ path: '/', hash: '#services' }">就业服务</RouterLink><RouterLink :to="{path:'/',hash:'#preparation'}">职业发展</RouterLink><a href="https://www.ncss.cn/zcxw" target="_blank" rel="noopener noreferrer">政策资讯</a>
    </nav>
    <div class="public-tools">
      <ThemeToggle /><RouterLink
        class="public-button"
        :to="session.actor ? roleHome[session.actor.role] : '/login'"
        >{{ session.actor ? "进入工作台" : "登录工作台" }}</RouterLink
      >
    </div>
  </header>
</template>
