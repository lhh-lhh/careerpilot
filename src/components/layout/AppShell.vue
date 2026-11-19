<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from "vue";
import { isOnline } from "../../services/runtime";
import { api } from "../../adapters/repository/http";
import { useRoute, useRouter } from "vue-router";
import BrandMark from "../base/BrandMark.vue";
import AppIcon from "../base/AppIcon.vue";
import AppButton from "../base/AppButton.vue";
import AppDrawer from "../base/AppDrawer.vue";
import AppModal from "../base/AppModal.vue";
import AppTag from "../base/AppTag.vue";
import ThemeToggle from "../base/ThemeToggle.vue";
import { useSessionStore } from "../../stores/session";
import { roleHome } from "../../types/identity";
import AiConnectionDialog from "../business/AiConnectionDialog.vue";
import { appRepository } from "../../services/app-services";
import WorkspaceMedia from "../business/WorkspaceMedia.vue";
import { aiConsent, setAiConsent } from "../../services/ai-consent";
const connectionOpen = ref(false);
const session = useSessionStore(),
  route = useRoute(),
  router = useRouter();
const mobileNav = ref(false),
  help = ref(false),
  clearOpen = ref(false),
  clearConfirmed = ref(false),
  clearing = ref(false),
  clearError = ref("");
const synced = ref(true),
  noticesOpen = ref(false);
const profileOpen = ref(false),
  profileSrc = ref("");
const onlineAiAvailable = ref(false);
function skipToMain() {
  const main = document.getElementById("main-content");
  if (main) {
    main.setAttribute("tabindex", "-1");
    main.focus();
    main.scrollIntoView({ block: "start" });
  }
}
watch(
  () => session.actor,
  (actor) => {
    if (isOnline && !actor)
      void router.replace({
        path: "/login",
        query: { redirect: route.fullPath },
      });
  },
);
const notices = ref<
  { id: string; title: string; createdAt: string; readAt: string | null }[]
>([]);
async function loadNotices() {
  if (isOnline)
    try {
      notices.value = await api("/api/notifications");
    } catch {
      /* Session handler owns authentication failures. */
    }
}
async function readNotice(id: string) {
  try {
    notices.value = await api("/api/notifications", { id });
  } catch {
    synced.value = false;
  }
}
function sync(event: Event) {
  synced.value = (event as CustomEvent<boolean>).detail;
  if (synced.value) void loadNotices();
}
onMounted(() => {
  window.addEventListener("careerpilot-sync", sync);
  void loadNotices();
  if (isOnline)
    void api<{ enabled: boolean }>("/api/ai/status")
      .then((s) => {
        onlineAiAvailable.value = s.enabled;
      })
      .catch(() => {});
});
onUnmounted(() => window.removeEventListener("careerpilot-sync", sync));
const home = computed(() =>
  session.actor ? roleHome[session.actor.role] : "/login",
);
const interviewNav = [
  { to: "/student/mock/voice", name: "仿真语音面试" },
  { to: "/student/mock/text", name: "文字输入法面试" },
  { to: "/student/mock/practice", name: "题库练习" },
];
function interviewActive(to: string) {
  return (
    route.path === to ||
    (to === "/student/mock/text" &&
      ["/student/mock", "/student/mock/feedback"].includes(route.path)) ||
    (to === "/student/mock/voice" &&
      route.path === "/student/mock/voice/report")
  );
}
const navItems = computed(() => {
  if (session.actor?.role === "student")
    return [
      { to: "/student", name: "生涯概览", icon: "home", exact: true },
      { to: "/student/resume", name: "简历工作台", icon: "resume" },
      { to: "/student/jobs", name: "岗位匹配", icon: "jobs" },
      ...(isOnline
        ? [
            {
              to: "/student/opportunities",
              name: "我的求职记录",
              icon: "timeline",
            },
          ]
        : []),
      { to: "/student/mock", name: "模拟面试", icon: "interview" },
      { to: "/student/applications", name: "我的投递", icon: "timeline" },
      { to: "/student/destination", name: "协议与去向", icon: "destination" },
      {
        to: "/design-system",
        name: "灯塔设计系统",
        icon: "design",
        utility: true,
      },
      {
        to: "/student/data-check",
        name: "本机数据检查",
        icon: "settings",
        utility: true,
      },
    ];
  if (session.actor?.role === "company")
    return [
      { to: "/company", name: "招聘概览", icon: "home", exact: true },
      { to: "/company/jobs", name: "岗位管理", icon: "jobs" },
      { to: "/company/candidates", name: "候选人流程", icon: "people" },
      { to: "/company/schedule", name: "面试日程", icon: "interview" },
      { to: "/company/agreements", name: "就业协议", icon: "agreement" },
      {
        to: "/design-system",
        name: "灯塔设计系统",
        icon: "design",
        utility: true,
      },
      {
        to: "/company/data-check",
        name: "本机数据检查",
        icon: "settings",
        utility: true,
      },
    ];
  if (session.actor?.role === "counselor")
    return [
      { to: "/counselor", name: "学生名册", icon: "people", exact: true },
      { to: "/counselor/review", name: "去向审核", icon: "agreement" },
      { to: "/counselor/support", name: "帮扶跟进", icon: "people" },
      { to: "/counselor/dashboard", name: "就业驾驶舱", icon: "chart" },
      {
        to: "/design-system",
        name: "灯塔设计系统",
        icon: "design",
        utility: true,
      },
      {
        to: "/counselor/data-check",
        name: "本机数据检查",
        icon: "settings",
        utility: true,
      },
    ];
  return [
    ...(isOnline
      ? [
          { to: "/admin/accounts", name: "账号审核", icon: "people" },
          { to: "/admin/admission", name: "准入与岗位审核", icon: "jobs" },
          { to: "/admin/opportunities", name: "机会来源管理", icon: "jobs" },
        ]
      : []),
    {
      to: home.value,
      name: "管理控制台",
      icon: session.actor?.role ?? "home",
      exact: true,
    },
    {
      to: "/design-system",
      name: "灯塔设计系统",
      icon: "design",
      utility: true,
    },
    {
      to: `${home.value}/data-check`,
      name: "本机数据检查",
      icon: "settings",
      utility: true,
    },
  ];
});
const nav = computed(() =>
  isOnline
    ? [
        ...navItems.value.filter((item) => !item.utility),
        {
          to: `/${session.actor?.role}/service`,
          name: "站内服务",
          icon: "people",
        },
        { to: "/account", name: "我的账号", icon: "settings" },
      ]
    : navItems.value,
);
function isActive(item: { to: string; exact?: boolean }) {
  return item.exact
    ? route.path === item.to
    : route.path === item.to || route.path.startsWith(`${item.to}/`);
}
async function logout() {
  mobileNav.value = false;
  try {
    await session.logout();
  } catch {
    synced.value = false;
    return;
  }
  await router.push("/login");
}
function openClearData() {
  help.value = false;
  clearConfirmed.value = false;
  clearError.value = "";
  clearOpen.value = true;
}
async function clearMyData() {
  if (!session.actor || session.actor.role !== "student") return;
  clearing.value = true;
  clearError.value = "";
  try {
    await appRepository.clearMyData(session.actor, clearConfirmed.value);
    clearOpen.value = false;
    await session.logout();
    await router.push("/login");
  } catch {
    clearError.value = "本机数据未清除，请重新确认后再试。";
  } finally {
    clearing.value = false;
  }
}
</script>
<template>
  <div class="app-shell">
    <a href="#main-content" class="skip-link" @click.prevent="skipToMain"
      >跳到主要内容</a
    >
    <aside class="sidebar">
      <RouterLink class="shell-brand" :to="home"
        ><BrandMark :size="44"
      /></RouterLink>
      <p class="nav-caption">工作空间</p>
      <nav aria-label="主导航">
        <template v-for="item in nav" :key="item.to"
          ><RouterLink
            :to="item.to"
            :class="{ active: isActive(item), utility: item.utility }"
            :title="item.name"
            ><AppIcon :name="item.icon" :size="20" /><span>{{ item.name }}</span
            ><span v-if="isActive(item)" class="nav-selected"></span
          ></RouterLink>
          <nav
            v-if="item.to === '/student/mock' && isOnline"
            class="interview-subnav"
            aria-label="模拟面试子导航"
          >
            <RouterLink
              v-for="child in interviewNav"
              :key="child.to"
              :to="child.to"
              :class="{ active: interviewActive(child.to) }"
              :aria-current="interviewActive(child.to) ? 'page' : undefined"
              >{{ child.name }}</RouterLink
            >
          </nav></template
        >
      </nav>
      <div class="sidebar-bottom">
        <button title="帮助与说明" @click="help = true">
          <AppIcon name="help" :size="20" /><span>帮助与说明</span>
        </button>
        <div class="sidebar-note">
          <AppIcon name="lock" :size="14" /><span>{{
            isOnline ? "账号保护 · 权限隔离" : "本机演示 · 隐私优先"
          }}</span>
        </div>
      </div>
    </aside>
    <div class="app-main">
      <header class="topbar">
        <div class="topbar-start">
          <button
            class="mobile-menu"
            aria-label="打开导航"
            @click="mobileNav = true"
          >
            <AppIcon name="menu" :size="20" /></button
          ><span>{{ session.roleLabel }}工作空间</span
          ><AppIcon name="chevron" :size="12" /><strong>{{
            route.meta.title ?? "页面"
          }}</strong>
        </div>
        <div class="topbar-actions">
          <AppButton
            v-if="!isOnline"
            variant="ghost"
            size="sm"
            aria-label="本机AI连接"
            @click="connectionOpen = true"
            ><AppIcon name="lock" :size="16" /><span
              >本机AI连接</span
            ></AppButton
          >
          <AppButton
            v-if="isOnline"
            variant="ghost"
            size="sm"
            @click="noticesOpen = true"
            >消息<span
              v-if="notices.some((n) => !n.readAt)"
              class="unread-dot"
            ></span
          ></AppButton>
          <button
            class="ai-consent-switch"
            role="switch"
            aria-label="AI默认授权"
            :aria-checked="aiConsent"
            title="点击AI功能会将必要内容脱敏后发往DeepSeek，可能产生费用；关闭会停止未完成请求"
            @click="setAiConsent(!aiConsent)"
          >
            AI {{ aiConsent ? "已开启" : "已关闭" }}
          </button>
          <AppTag tone="ai">{{
            isOnline
              ? onlineAiAvailable
                ? "DeepSeek 可用"
                : "DeepSeek 不可用"
              : "AI需在线服务"
          }}</AppTag><ThemeToggle /><button
            v-if="isOnline"
            class="profile-button"
            aria-label="工作区形象设置"
            @click="profileOpen = true"
          >
            <img
              v-if="profileSrc"
              :src="profileSrc"
              alt=""
              width="28"
              height="28"
            /><AppIcon v-else name="people" :size="20" /></button
          ><span class="actor-badge"
            ><AppIcon
              :name="session.actor?.role ?? 'student'"
              :size="16"
            /><span>{{
              isOnline ? session.displayName : `${session.roleLabel}演示账号`
            }}</span></span
          ><AppButton variant="ghost" size="sm" @click="logout"
            ><AppIcon name="logout" :size="16" /><span>{{
              isOnline ? "退出登录" : "退出演示"
            }}</span></AppButton
          >
        </div>
      </header>
      <p v-if="isOnline && !synced" class="session-warning" role="status">
        连接暂时中断，正在重连。未提交的内容仍保留在当前页面。
      </p>
      <p v-if="session.storageWarning" class="session-warning" role="status">
        {{ session.storageWarning }}
      </p>
      <RouterView v-slot="{ Component }"
        ><component
          :is="Component"
          :key="
            route.path.startsWith('/student/mock') ? route.path : undefined
          "
      /></RouterView>
    </div>
    <AppDrawer data-scene="journey" :open="mobileNav" title="工作空间" @close="mobileNav = false"
      ><nav aria-label="移动导航" class="mobile-nav">
        <template v-for="item in nav" :key="item.to"
          ><RouterLink :to="item.to" @click="mobileNav = false"
            ><AppIcon :name="item.icon" :size="20" />{{ item.name }}</RouterLink
          >
          <div
            v-if="item.to === '/student/mock' && isOnline"
            class="interview-subnav"
          >
            <RouterLink
              v-for="child in interviewNav"
              :key="child.to"
              :to="child.to"
              :class="{ active: interviewActive(child.to) }"
              :aria-current="interviewActive(child.to) ? 'page' : undefined"
              @click="mobileNav = false"
              >{{ child.name }}</RouterLink
            >
          </div></template
        >
      </nav>
      <template #footer
        ><AppButton variant="secondary" @click="logout">{{
          isOnline ? "退出登录" : "退出演示"
        }}</AppButton></template
      ></AppDrawer
    ><AppDrawer data-scene="service" :open="help" title="帮助与说明" @close="help = false"
      ><div class="help-copy">
        <h3>闻鸣知路，循引赴职</h3>
        <p v-if="!isOnline">
          这是路鸣职引 CareerPilot
          的本机教学环境。角色用于模拟高校就业工作流，不代表生产身份认证。
        </p>
        <p v-else>数据按账号权限读取和保存，未经授权不向其他角色开放。</p>
        <h3>数据与隐私</h3>
        <p v-if="!isOnline">
          正式业务数据仅保存在当前浏览器的
          IndexedDB。演示数据全部虚构，不应填写真实个人信息。数据检查页可初始化和验证本机数据库。
        </p>
        <p v-else>
          业务数据保存在服务端。请在共享设备上退出登录；隐私和数据保留问题请联系平台管理员。
        </p>
        <h3>智能内容来源</h3>
        <p>
          正式服务的AI生成强制调用DeepSeek
          API，失败不会用回放或本地规则代答。离线演示不提供AI生成。统计、完整度与规则匹配参考分属于确定性计算，不是模型生成。AI授权开启后，点击生成才将必要内容脱敏后外发，可能产生费用，受平台额度限制；不会在打开页面时自动调用。可用顶部开关随时关闭并停止未完成请求，已发送的内容无法撤回。
        </p>
        <h3>键盘操作</h3>
        <p>
          Tab 切换焦点，Enter 激活操作，Esc
          关闭弹窗或抽屉。关闭后焦点回到原操作。
        </p>
        <template v-if="!isOnline && session.actor?.role === 'student'">
          <h3>本人数据</h3>
          <p>
            可删除当前学生在此浏览器中的简历、投递、去向、附件、练习与相关审计记录。此操作不可撤销。
          </p>
          <AppButton variant="danger" @click="openClearData"
            >清除我的本机数据</AppButton
          >
        </template>
      </div></AppDrawer
    >
    <AppModal data-scene="governance"
      :open="clearOpen"
      title="清除我的本机数据"
      @close="clearOpen = false"
    >
      <div class="clear-data-copy">
        <p>
          将删除当前学生在本机浏览器中的全部个人业务数据，并退出当前身份。其他演示角色与其他学生数据不会被清除。
        </p>
        <p v-if="clearError" class="clear-error" role="alert">
          {{ clearError }}
        </p>
        <label
          ><input
            v-model="clearConfirmed"
            type="checkbox"
          />我理解该学生的本机数据将被删除</label
        >
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="clearOpen = false"
          >取消</AppButton
        >
        <AppButton
          variant="danger"
          :disabled="!clearConfirmed"
          :loading="clearing"
          @click="clearMyData"
          >确认清除</AppButton
        >
      </template>
    </AppModal>
    <AiConnectionDialog
      v-if="!isOnline"
      :open="connectionOpen"
      @close="connectionOpen = false"
    />
    <AppDrawer data-scene="service"
      :open="noticesOpen"
      title="消息中心"
      @close="noticesOpen = false"
    >
      <div v-if="!notices.length" class="business-empty">
        <h3>暂无新消息</h3>
        <p>招聘和去向审核进展会在这里通知你。</p>
      </div>
      <div v-for="notice in notices" :key="notice.id" class="notice-row">
        <div>
          <strong>{{ notice.title }}</strong>
          <p class="caption">
            {{ new Date(notice.createdAt).toLocaleString("zh-CN") }}
          </p>
        </div>
        <AppButton
          v-if="!notice.readAt"
          variant="secondary"
          size="sm"
          @click="readNotice(notice.id)"
          >标为已读</AppButton
        ><span v-else class="caption">已读</span>
      </div>
    </AppDrawer>
    <AppDrawer data-scene="service"
      :open="profileOpen"
      title="工作区形象设置"
      @close="profileOpen = false"
    >
      <WorkspaceMedia
        v-if="isOnline"
        :open="profileOpen"
        @saved="profileSrc = $event"
      />
    </AppDrawer>
  </div>
</template>
<style scoped>
.ai-consent-switch {
  flex: none;
  border: 1px solid var(--border-control);
  border-radius: 20px;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-2);
  background: var(--surface-2);
  white-space: nowrap;
}
.ai-consent-switch[aria-checked="true"] {
  color: var(--brand-text);
  background: var(--brand-soft);
  border-color: var(--brand);
}
.profile-button {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  background: transparent;
  color: var(--text-2);
  border: 1px solid var(--border);
  border-radius: 50%;
  flex: none;
}
.profile-button img {
  border-radius: 50%;
  object-fit: cover;
}
.unread-dot {
  width: 6px;
  height: 6px;
  background: var(--brand);
  border-radius: 50%;
}
.notice-row {
  padding: 20px 0;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 14px;
}
.notice-row p {
  margin-top: 10px;
}
.app-shell {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  min-height: 100dvh;
}
.sidebar {
  position: sticky;
  top: 0;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 28px 16px 20px;
  border-right: 1px solid var(--border);
  background: var(--surface);
}
.shell-brand {
  padding: 0 8px;
  margin-bottom: 48px;
  display: block;
}
.shell-brand:hover {
  text-decoration: none;
}
.nav-caption {
  font-size: 11px;
  color: var(--text-3);
  letter-spacing: 0;
  margin: 0 12px 16px;
}
.sidebar nav {
  display: grid;
  gap: 8px;
}
.sidebar > nav {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-bottom: 16px;
}
.sidebar .interview-subnav,
.interview-subnav {
  display: grid;
  gap: 4px;
  margin: -2px 0 6px 22px;
  padding-left: 12px;
  border-left: 1px solid var(--border);
}
.sidebar .interview-subnav > a,
.mobile-nav .interview-subnav > a {
  font-size: 13px;
  padding: 9px 10px;
  min-height: 38px;
  border-radius: 8px;
  color: var(--text-2);
}
.interview-subnav > a.active {
  background: var(--brand-soft);
  color: var(--brand-text);
  font-weight: 600;
}
.sidebar-bottom {
  flex-shrink: 0;
}
.sidebar nav > a {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border-radius: var(--r-control);
  color: var(--text-2);
  font-size: 14px;
  position: relative;
  min-height: 44px;
}
.sidebar nav > a:hover {
  background: var(--surface-2);
  text-decoration: none;
}
.sidebar nav > a.active {
  background: var(--brand-soft);
  color: var(--brand-text);
  font-weight: 600;
}
.sidebar nav > a.utility {
  border-top: 1px solid var(--border);
  border-radius: 0 0 var(--r-control) var(--r-control);
  margin-top: 8px;
  padding-top: 16px;
}
.sidebar nav > a.utility + a.utility {
  border-top: 0;
  margin-top: 0;
  padding-top: 12px;
  border-radius: var(--r-control);
}
.nav-selected {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  margin-left: auto;
}
.sidebar-bottom {
  margin-top: auto;
  display: grid;
  gap: 24px;
}
.sidebar-bottom > button {
  background: transparent;
  border: none;
  color: var(--text-2);
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  text-align: left;
  border-radius: var(--r-control);
}
.sidebar-bottom > button:hover {
  background: var(--surface-2);
}
.sidebar-note {
  color: var(--text-3);
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 11px;
  padding: 0 12px;
}
.app-main {
  min-width: 0;
}
.topbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 32px;
  border-bottom: 1px solid var(--border);
  min-height: 76px;
  background: var(--surface);
}
.topbar-start {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--text-3);
}
.topbar-start strong {
  color: var(--text-1);
  font-weight: 500;
}
.topbar-actions {
  display: flex;
  align-items: center;
  gap: 20px;
}
.actor-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-2);
  font-size: 12px;
  padding-left: 20px;
  border-left: 1px solid var(--border);
}
.mobile-menu {
  display: none;
  border: none;
  padding: 8px;
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text-1);
}
.mobile-nav {
  display: grid;
  gap: 12px;
}
.mobile-nav a {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--r-control);
  font-size: 14px;
}
.mobile-nav a:hover {
  background: var(--surface-2);
}
.help-copy {
  display: grid;
  gap: 16px;
}
.help-copy h3 {
  font-size: 16px;
  margin-top: 12px;
}
.help-copy p {
  color: var(--text-2);
  font-size: 14px;
  line-height: 1.8;
}
.clear-data-copy {
  display: grid;
  gap: 20px;
  font-size: 14px;
  line-height: 1.8;
}
.clear-data-copy label {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.clear-data-copy input {
  margin-top: 6px;
}
.clear-error {
  color: var(--danger-text);
}
.session-warning {
  padding: 12px 24px;
  color: var(--warn-text);
  font-size: 13px;
}
@media (max-width: 1439px) and (min-width: 768px) {
  .app-shell {
    grid-template-columns: 208px minmax(0, 1fr);
  }
  .sidebar {
    padding: 24px 12px;
    align-items: stretch;
  }
  .shell-brand {
    padding: 0;
  }
  .shell-brand :deep(.brand-wordmark) {
    display: block;
  }
  .sidebar-note {
    font-size: 11px;
  }
  .sidebar nav > a {
    padding: 12px;
  }
  .sidebar-bottom > button {
    padding: 12px;
  }
  .topbar {
    padding: 16px 24px;
  }
}
@media (max-width: 1023px) {
  .actor-badge {
    display: none;
  }
  .topbar-start > span,
  .topbar-start > svg {
    display: none;
  }
  .topbar-actions {
    gap: 12px;
  }
}
@media (max-width: 767px) {
  .app-shell {
    display: block;
  }
  .sidebar {
    display: none;
  }
  .topbar {
    padding: 12px 16px;
    gap: 12px;
    min-height: 64px;
  }
  .mobile-menu {
    display: flex;
  }
  .topbar-start {
    gap: 8px;
  }
  .topbar-start strong {
    font-size: 13px;
  }
  .topbar-actions {
    gap: 8px;
  }
  .topbar-actions > .tag {
    display: none;
  }
  .topbar-actions .app-button {
    padding: 8px;
    font-size: 12px;
  }
  .topbar-actions .app-button svg {
    display: none;
  }
}
</style>
