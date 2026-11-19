<script setup lang="ts">
import { computed } from "vue";
import { useSessionStore } from "../stores/session";
import AppTag from "../components/base/AppTag.vue";
import AppIcon from "../components/base/AppIcon.vue";
const session = useSessionStore();
const descriptions = {
  student: "从理解自己的经历开始，让下一步更明确。",
  company: "让校园人才被看见，让招聘流程更清晰。",
  counselor: "看见每一位学生，让支持落在需要的地方。",
  admin: "清晰的边界，是可靠服务的起点。",
};
const description = computed(() =>
  session.actor ? descriptions[session.actor.role] : "",
);
</script>
<template>
  <main id="main-content" class="workspace ui-scene ui-scene--status">
    <AppTag>M1 · 工程基础</AppTag>
    <h1>{{ session.roleLabel }}工作区</h1>
    <p class="workspace-description">{{ description }}</p>
    <div class="workspace-stage">
      <AppIcon name="destination" :size="40" />
      <h2>先把方向与基础做好。</h2>
      <p>
        角色会话、路由边界和灯塔设计系统已接通。业务功能按前置文档分阶段开发，当前尚未启用，不展示虚构的统计或操作结果。
      </p>
      <RouterLink to="/design-system"
        >查看灯塔设计系统<AppIcon name="arrow" :size="18"
      /></RouterLink>
    </div>
    <div class="scope-note">
      <AppIcon name="lock" :size="16" />
      <p>当前为本机教学角色模拟，不是生产身份认证。所有演示数据均为虚构。</p>
    </div>
  </main>
</template>
<style scoped>
.workspace {
  max-width: 1120px;
  margin: 0 auto;
  padding: 48px;
}
.workspace h1 {
  margin-top: 20px;
}
.workspace-description {
  color: var(--text-2);
  margin-top: 16px;
  font-size: 16px;
}
.workspace-stage {
  padding: 64px 0;
  max-width: 600px;
}
.workspace-stage > svg {
  color: var(--brand-text);
  margin-bottom: 24px;
}
.workspace-stage h2 {
  font-size: 24px;
}
.workspace-stage p {
  color: var(--text-2);
  margin-top: 20px;
  font-size: 14px;
  line-height: 1.9;
}
.workspace-stage a {
  display: inline-flex;
  gap: 12px;
  align-items: center;
  margin-top: 28px;
  font-size: 14px;
}
.scope-note {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 24px;
  border-top: 1px solid var(--border);
  color: var(--text-3);
  font-size: 12px;
}
@media (max-width: 767px) {
  .workspace {
    padding: 32px 24px;
  }
  .workspace-stage {
    padding: 40px 0;
  }
}
</style>
