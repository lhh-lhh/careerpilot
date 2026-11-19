<script setup lang="ts">
import AppIcon from "../components/base/AppIcon.vue";
import { useSessionStore } from "../stores/session";
import { roleHome } from "../types/identity";
const session = useSessionStore();
withDefaults(defineProps<{ forbidden?: boolean }>(), { forbidden: false });
</script>
<template>
  <main class="status-page ui-scene ui-scene--status" :class="{ 'feature-forbidden': forbidden }">
    <img class="status-art" :src="forbidden ? '/media/workbench/student-b-10.webp' : '/media/workbench/student-b-11.webp'" alt="" width="384" height="341" />
    <AppIcon :name="forbidden ? 'lock' : 'destination'" :size="48" /><span
      class="numeric"
      >{{ forbidden ? "403 / FORBIDDEN" : "404 / NOT FOUND" }}</span
    >
    <h1>{{ forbidden ? "暂无访问权限" : "这段路径还没有方向" }}</h1>
    <p>
      {{
        forbidden
          ? "当前账号无权访问这个工作区，请返回自己的页面。"
          : "页面可能已移动，或这不是一个有效的应用地址。"
      }}
    </p>
    <RouterLink :to="session.actor ? roleHome[session.actor.role] : '/login'"
      >{{ session.actor ? "返回我的工作台" : "返回登录" }}
      <AppIcon name="arrow" :size="18"
    /></RouterLink>
  </main>
</template>
<style scoped>
.status-page {
  min-height: 65vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 24px;
  padding: 48px 24px;
}
.status-page > svg {
  color: var(--brand-text);
}
.status-page > span {
  font-size: 12px;
  color: var(--text-3);
  letter-spacing: 0;
}
.status-page p {
  color: var(--text-2);
  font-size: 14px;
}
.status-page a {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 14px;
}
</style>
