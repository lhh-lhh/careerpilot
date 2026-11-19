<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { isOnline } from "../services/runtime";
import BrandMark from "../components/base/BrandMark.vue";
import AppIcon from "../components/base/AppIcon.vue";
import AppButton from "../components/base/AppButton.vue";
import ThemeToggle from "../components/base/ThemeToggle.vue";
import { useSessionStore } from "../stores/session";
import { roleLabels } from "../types/identity";
import type { Role } from "../types/identity";
import { loginDestination } from "../domain/policy/routes";
const selected = ref<Role>("student");
const session = useSessionStore();
const router = useRouter();
const route = useRoute();
const loginName = ref(""),
  password = ref(""),
  submitting = ref(false),
  loginError = ref("");
async function signIn() {
  submitting.value = true;
  loginError.value = "";
  try {
    await session.login(loginName.value, password.value);
    password.value = "";
    const redirect = loginDestination(
      session.actor!.role,
      route.query.redirect,
    );
    await router.push(redirect);
  } catch {
    loginError.value = "登录未成功，请核对账号密码或稍后再试。";
  } finally {
    submitting.value = false;
  }
}
const entries: { role: Role; description: string; caption: string }[] = [
  {
    role: "student",
    description: "完善简历，发现适合自己的机会",
    caption: "探索你的可能",
  },
  {
    role: "company",
    description: "连接校园人才，推进招聘流程",
    caption: "遇见新生力量",
  },
  {
    role: "counselor",
    description: "看见每位学生，提供精准支持",
    caption: "让支持更有方向",
  },
  {
    role: "admin",
    description: "管理演示环境，守护数据边界",
    caption: "让服务稳健运行",
  },
];
const action = computed(() => `以${roleLabels[selected.value]}身份进入`);
async function enter() {
  session.enter(selected.value);
  const redirect = loginDestination(selected.value, route.query.redirect);
  await router.push(redirect);
}
function moveRole(event: KeyboardEvent, index: number) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key))
    return;
  event.preventDefault();
  const next =
    (index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? 3 : 1)) %
    entries.length;
  selected.value = entries[next]!.role;
  document.getElementById(`role-${selected.value}`)?.focus();
}
</script>
<template>
  <main class="login-page ui-scene ui-scene--campus">
    <section class="login-story" aria-label="闻鸣知路，循引赴职">
      <div class="story-top">
        <BrandMark :size="44" />
        <p class="slogan">闻鸣知路，循引赴职</p>
      </div>
      <div class="story-copy">
        <span class="story-rule"></span>
        <h2>每一段探索，<br />都有方向。</h2>
        <p>把成长写进简历，<br />让每一步，靠近心中的远方。</p>
      </div>
      <div class="route-art" aria-hidden="true">
        <svg viewBox="0 0 600 480" fill="none">
          <ellipse
            cx="320"
            cy="250"
            rx="240"
            ry="170"
            stroke="currentColor"
            stroke-opacity=".1"
          />
          <ellipse
            cx="320"
            cy="250"
            rx="170"
            ry="120"
            stroke="currentColor"
            stroke-opacity=".14"
          />
          <ellipse
            cx="320"
            cy="250"
            rx="90"
            ry="65"
            stroke="currentColor"
            stroke-opacity=".18"
          />
          <path
            d="M-20 450C125 420 165 380 180 320S220 240 310 250 400 165 465 145"
            stroke="currentColor"
            stroke-opacity=".6"
            stroke-width="2"
            stroke-dasharray="4 8"
            stroke-linecap="round"
          />
          <circle cx="180" cy="320" r="6" fill="currentColor" />
          <circle cx="310" cy="250" r="6" fill="currentColor" />
          <circle cx="465" cy="145" r="9" fill="currentColor" />
          <circle
            cx="465"
            cy="145"
            r="24"
            stroke="currentColor"
            stroke-opacity=".4"
          />
          <path
            d="M465 96V80M500 111l12-12M514 145h16"
            stroke="currentColor"
            stroke-opacity=".65"
            stroke-width="2"
            stroke-linecap="round"
          /></svg
        ><span class="route-label">向可能，前行。</span>
      </div>
      <footer class="story-footer">
        <span>完善简历</span><i></i><span>发现机会</span><i></i
        ><span>从容赴职</span>
      </footer>
    </section>
    <section class="login-main">
      <div class="login-utility"><ThemeToggle /></div>
      <div class="login-content">
        <header>
          <h1>{{ isOnline ? "登录工作台" : "选择演示角色" }}</h1>
          <p>
            {{
              isOnline
                ? "欢迎回来，继续你的职业旅程。"
                : "从你的角色出发，开启一段新的职业旅程"
            }}
          </p>
        </header>
        <form
          v-if="isOnline"
          class="online-login form-stack"
          @submit.prevent="signIn"
        >
          <label class="form-label"
            >账号<input
              v-model="loginName"
              required
              autocomplete="username"
              maxlength="128"
          /></label>
          <label class="form-label"
            >密码<input
              v-model="password"
              required
              type="password"
              autocomplete="current-password"
              maxlength="256"
          /></label>
          <p v-if="loginError" role="alert" class="business-error">
            {{ loginError }}
          </p>
          <AppButton type="submit" size="lg" :loading="submitting"
            >登录</AppButton
          >
          <RouterLink to="/register">注册账号</RouterLink>
          <p class="caption">辅导员和管理员凭邀请开通。</p>
        </form>
        <template v-else>
          <div class="role-grid" role="radiogroup" aria-label="选择演示角色">
            <button
              v-for="(entry, index) in entries"
              :id="`role-${entry.role}`"
              :key="entry.role"
              :class="['role-choice', { selected: selected === entry.role }]"
              role="radio"
              :aria-checked="selected === entry.role"
              :aria-label="roleLabels[entry.role]"
              :tabindex="selected === entry.role ? 0 : -1"
              @click="selected = entry.role"
              @keydown="moveRole($event, index)"
            >
              <span class="role-top"
                ><span :class="['role-icon', `icon-${entry.role}`]"
                  ><AppIcon :name="entry.role" :size="28" /></span
                ><span class="radio-indicator"
                  ><span v-if="selected === entry.role"></span></span></span
              ><strong>{{ roleLabels[entry.role] }}</strong
              ><span class="role-caption">{{ entry.caption }}</span
              ><span class="role-description">{{ entry.description }}</span>
            </button>
          </div>
          <AppButton size="lg" class="enter-button" @click="enter"
            >{{ action }}<AppIcon name="arrow" :size="20"
          /></AppButton>
          <p
            v-if="session.storageWarning"
            class="session-warning"
            role="status"
          >
            {{ session.storageWarning }}
          </p>
          <div class="local-notice">
            <div>
              <span class="replay-dot"></span><span>REPLAY · 人工审校示例</span>
            </div>
            <p>
              <AppIcon
                name="lock"
                :size="14"
              />数据保存在本机，不上传真实个人信息
            </p>
          </div>
        </template>
      </div>
      <footer class="login-footer">
        <RouterLink v-if="!isOnline" to="/design-system"
          >灯塔设计系统<AppIcon name="arrow" :size="14" /></RouterLink
        ><RouterLink to="/">返回首页</RouterLink>
      </footer>
    </section>
  </main>
</template>
<style scoped>
.login-page {
  display: grid;
  grid-template-columns: minmax(360px, 0.88fr) minmax(0, 1.12fr);
  min-height: 100dvh;
  background: var(--surface);
}
.online-login {
  margin-top: 40px;
}
.login-story {
  background: var(--navy);
  color: var(--on-navy);
  position: relative;
  padding: 48px 56px 36px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 720px;
}
.story-top {
  position: relative;
  z-index: 1;
}
.story-top :deep(.brand-wordmark strong) {
  color: var(--on-navy);
  font-size: 24px;
}
.story-top :deep(.brand-wordmark span) {
  color: var(--on-navy-muted);
}
.story-top :deep(.brand-mark) {
  color: var(--on-navy);
}
.slogan {
  color: var(--on-navy-muted);
  font-size: 13px;
  letter-spacing: 0;
  margin: 20px 0 0 56px;
}
.story-copy {
  position: relative;
  z-index: 1;
  margin-top: 72px;
}
.story-rule {
  display: block;
  width: 36px;
  height: 2px;
  background: var(--amber);
  margin-bottom: 24px;
}
.story-copy h2 {
  font-size: clamp(32px, 3.3vw, 52px);
  letter-spacing: 0;
  line-height: 1.45;
  font-weight: 600;
}
.story-copy p {
  color: var(--on-navy-muted);
  font-size: 14px;
  margin-top: 24px;
  line-height: 1.9;
}
.route-art {
  position: absolute;
  left: -60px;
  right: -40px;
  bottom: 56px;
  color: var(--on-navy-muted);
  opacity: 0.8;
}
.route-art svg {
  width: 100%;
}
.route-label {
  position: absolute;
  top: 50%;
  left: 50%;
  font-size: 13px;
  letter-spacing: 0;
  transform: rotate(-9deg);
}
.story-footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  z-index: 1;
  padding-top: 300px;
  font-size: 14px;
  color: var(--on-navy-muted);
}
.story-footer i {
  width: 1px;
  height: 12px;
  background: currentColor;
  opacity: 0.35;
}
.login-main {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding: 76px clamp(32px, 5vw, 80px) 64px;
}
.login-utility {
  position: absolute;
  right: 36px;
  top: 28px;
}
.login-content {
  width: 100%;
  max-width: 620px;
  margin: auto;
  padding: 20px 0 24px;
}
.login-content h1 {
  font-size: 32px;
  letter-spacing: 0;
}
.login-content header p {
  color: var(--text-2);
  font-size: 14px;
  margin-top: 16px;
}
.role-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 36px;
}
.role-choice {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  padding: 20px;
  border: 1px solid var(--border-control);
  background: var(--surface);
  color: var(--text-1);
  border-radius: var(--r-card);
  min-width: 0;
  transition:
    background var(--t-state),
    border-color var(--t-state);
}
.role-choice:hover {
  background: var(--surface-2);
}
.role-choice.selected {
  border: 2px solid var(--brand-text);
  background: var(--brand-soft);
  padding: 19px;
}
.role-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;
  margin-bottom: 16px;
}
.role-icon {
  color: var(--brand-text);
  display: flex;
}
.icon-company {
  color: var(--ai-text);
}
.icon-counselor {
  color: var(--success-text);
}
.radio-indicator {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 1px solid var(--border-control);
  border-radius: 50%;
}
.selected .radio-indicator {
  border-color: var(--brand-text);
}
.radio-indicator span {
  width: 10px;
  height: 10px;
  background: var(--brand-text);
  border-radius: 50%;
}
.role-choice strong {
  font-size: 20px;
  font-weight: 600;
}
.role-caption {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 4px;
}
.role-description {
  color: var(--text-2);
  font-size: 13px;
  margin-top: 12px;
  line-height: 1.7;
}
.enter-button {
  width: 100%;
  margin-top: 28px;
  justify-content: center;
}
.enter-button :deep(svg) {
  margin-left: 16px;
}
.local-notice {
  margin-top: 28px;
  text-align: center;
  color: var(--text-2);
  font-size: 12px;
}
.local-notice > div {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.replay-dot {
  width: 5px;
  height: 5px;
  background: var(--ai);
  border-radius: 50%;
}
.local-notice p {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  margin-top: 10px;
}
.login-footer {
  position: absolute;
  bottom: 24px;
  left: clamp(32px, 5vw, 80px);
  right: clamp(32px, 5vw, 80px);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  font-size: 12px;
  color: var(--text-3);
}
.login-footer a {
  display: flex;
  align-items: center;
  gap: 8px;
}
.session-warning {
  font-size: 13px;
  color: var(--warn-text);
  margin-top: 12px;
}
@media (min-width: 1600px) {
  .login-story {
    padding: 64px 80px 48px;
  }
  .login-content h1 {
    font-size: 40px;
  }
  .role-choice {
    padding: 24px;
  }
  .role-choice.selected {
    padding: 23px;
  }
  .role-description {
    font-size: 14px;
  }
  .story-copy {
    margin-top: 96px;
  }
}
@media (max-width: 1100px) {
  .login-page {
    grid-template-columns: 0.78fr 1.22fr;
  }
  .login-story {
    padding: 36px 32px;
  }
  .login-main {
    padding-left: 32px;
    padding-right: 32px;
  }
  .role-choice {
    padding: 16px;
  }
  .role-choice.selected {
    padding: 15px;
  }
  .story-copy h2 {
    font-size: 32px;
  }
  .login-footer {
    left: 32px;
    right: 32px;
  }
  .login-footer > span {
    max-width: 130px;
    text-align: right;
  }
}
@media (max-width: 767px) {
  .login-page {
    display: block;
  }
  .login-story {
    min-height: 248px;
    padding: 24px;
  }
  .story-top :deep(.brand-wordmark strong) {
    font-size: 20px;
  }
  .story-top :deep(.brand-mark svg) {
    width: 32px;
    height: 32px;
  }
  .slogan {
    display: none;
  }
  .story-copy {
    margin-top: 24px;
  }
  .story-copy h2 {
    font-size: 28px;
    line-height: 1.4;
  }
  .story-copy h2 br {
    display: none;
  }
  .story-copy p,
  .story-rule,
  .story-footer {
    display: none;
  }
  .route-art {
    width: 280px;
    left: auto;
    right: -44px;
    bottom: -64px;
    opacity: 0.35;
  }
  .route-label {
    display: none;
  }
  .login-main {
    padding: 32px 24px 84px;
  }
  .login-utility {
    top: -218px;
    right: 24px;
  }
  .login-content {
    padding: 0;
  }
  .login-content h1 {
    font-size: 24px;
  }
  .login-content header p {
    font-size: 13px;
    margin-top: 12px;
  }
  .role-grid {
    margin-top: 24px;
    gap: 12px;
  }
  .role-choice {
    padding: 16px 12px;
  }
  .role-choice.selected {
    padding: 15px 11px;
  }
  .role-choice strong {
    font-size: 18px;
  }
  .role-description {
    font-size: 12px;
  }
  .role-caption {
    display: none;
  }
  .role-top {
    margin-bottom: 12px;
  }
  .login-footer {
    left: 24px;
    right: 24px;
    bottom: 20px;
    font-size: 11px;
  }
  .login-footer > span {
    max-width: 120px;
  }
  .local-notice p {
    font-size: 11px;
  }
}
@media (min-width: 768px) and (max-height: 800px) {
  .login-story {
    min-height: 720px;
  }
  .story-copy {
    margin-top: 48px;
  }
  .login-main {
    padding-top: 64px;
  }
  .login-content {
    padding-top: 0;
  }
  .role-grid {
    margin-top: 24px;
  }
  .role-top {
    margin-bottom: 10px;
  }
  .role-description {
    margin-top: 8px;
  }
  .local-notice {
    margin-top: 20px;
  }
}
</style>
