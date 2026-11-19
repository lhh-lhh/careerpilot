<script setup lang="ts">
import { useThemeStore } from "./stores/theme";
import { useAiConnectionStore } from "./stores/aiConnection";
import { onMounted, onBeforeUnmount } from "vue";
import { routeLoadFailed, dismissRouteLoadError } from './router';
import GlobalAssistant from './components/business/GlobalAssistant.vue';
function refreshPage() { window.location.reload(); }
const connection = useAiConnectionStore();
const invalidate = () => connection.disableLive();
onMounted(() => window.addEventListener("careerpilot-invalidate", invalidate));
onBeforeUnmount(() =>
  window.removeEventListener("careerpilot-invalidate", invalidate),
);
useThemeStore();
</script>
<template>
  <aside v-if="routeLoadFailed" class="route-load-error" role="alert"><p>页面资源加载失败，可能正在更新或网络中断。当前输入未被自动刷新；请先保存或复制未保存内容。</p><div><button type="button" @click="refreshPage">刷新页面</button><button type="button" @click="dismissRouteLoadError">暂不刷新</button></div></aside>
  <RouterView />
  <GlobalAssistant />
</template>
<style scoped>
.route-load-error { position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2000;background:var(--surface);color:var(--text-1);border:2px solid var(--brand-text);border-radius:12px;padding:16px;width:min(580px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;box-shadow:var(--sh-3);font-size:14px; }
.route-load-error div { display:flex;flex-wrap:wrap;gap:12px;margin-top:12px; }.route-load-error button { min-height:44px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);color:var(--text-1); }
</style>
