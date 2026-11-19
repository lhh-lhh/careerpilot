<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../adapters/repository/http';
import { accountError } from '../services/account-errors';
import type { User } from '../types/entities';
import { roleHome } from '../types/identity';
import { useSessionStore } from '../stores/session';
import AppButton from '../components/base/AppButton.vue';
import BrandMark from '../components/base/BrandMark.vue';
import ThemeToggle from '../components/base/ThemeToggle.vue';
import WorkbenchHeader from '../components/presentation/WorkbenchHeader.vue';
const router=useRouter(),session=useSessionStore(),profile=ref<User|null>(null),working=ref(false),error=ref(''),currentPassword=ref(''),newPassword=ref('');
const title=computed(()=>profile.value?.accountStatus==='pending'?'等待账号审核':profile.value?.accountStatus==='rejected'?'账号审核未通过':'我的账号');
async function refresh(){working.value=true;error.value='';try{profile.value=await api<User>('/api/account');await session.refreshAccount();}catch(e){error.value=accountError(e);}finally{working.value=false;}}
async function logout(){try{await session.logout();await router.replace('/login');}catch(e){error.value=accountError(e);}}
async function changePassword(){working.value=true;error.value='';try{await api('/api/account/password',{currentPassword:currentPassword.value,newPassword:newPassword.value});currentPassword.value='';newPassword.value='';await router.replace('/login');}catch(e){error.value=accountError(e);}finally{working.value=false;}}
onMounted(refresh);
</script>
<template>
  <main class="account-page ui-scene ui-scene--governance"><header class="account-header"><RouterLink to="/"><BrandMark :size="32" /></RouterLink><ThemeToggle /></header>
  <WorkbenchHeader><template #heading="{design}"><div><div class="kicker">账号与安全 · CAREERPILOT</div><h1>{{ design.headline }}</h1><p>{{ design.desc }}</p></div></template></WorkbenchHeader><section class="account-panel">
    <h2>{{ title }}</h2><p class="account-intro">{{ profile?.displayName }} · {{ profile?.login }}</p>
    <p v-if="profile?.accountStatus==='pending'">学校正在核对你的信息。审核通过后即可进入工作台。</p>
    <p v-if="profile?.accountStatus==='rejected'">{{ profile.accountReviewReason }}。如需更正，请联系学校就业服务中心。</p>
    <div class="account-actions"><AppButton v-if="profile?.accountStatus==='approved'" @click="router.push(roleHome[session.actor!.role])">进入工作台</AppButton><AppButton v-else :loading="working" @click="refresh">刷新审核状态</AppButton><AppButton variant="secondary" @click="logout">退出登录</AppButton></div>
    <p v-if="error" class="business-error" role="alert">{{ error }}</p>
    <details><summary>修改密码</summary><form class="form-stack" @submit.prevent="changePassword"><label class="form-label">当前密码<input v-model="currentPassword" type="password" required maxlength="256" autocomplete="current-password" /></label><label class="form-label">新密码<input v-model="newPassword" type="password" required minlength="12" maxlength="256" autocomplete="new-password" /></label><p class="caption">修改后所有设备需重新登录。</p><AppButton type="submit" :loading="working">更新密码</AppButton></form></details>
  </section></main>
</template>
