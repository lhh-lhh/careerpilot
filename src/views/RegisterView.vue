<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../adapters/repository/http';
import { accountError } from '../services/account-errors';
import { useSessionStore } from '../stores/session';
import { roleHome } from '../types/identity';
import BrandMark from '../components/base/BrandMark.vue';
import ThemeToggle from '../components/base/ThemeToggle.vue';
import AppButton from '../components/base/AppButton.vue';
const route=useRoute(),router=useRouter(),session=useSessionStore();
const invited = computed(()=> typeof route.query.invite === 'string' && !!route.query.invite);
const role=ref(invited.value && route.query.role==='admin'?'admin':invited.value?'counselor':route.query.role==='company'?'company':'student');
const login=ref(typeof route.query.login==='string'?route.query.login:''),password=ref(''),displayName=ref(''),studentNo=ref(''),majorId=ref(''),cohortYear=ref(new Date().getFullYear()+1),companyName=ref('');
const majors=ref<{id:string;label:string}[]>([]),working=ref(false),error=ref('');
async function loadCatalog(){try{majors.value=(await api<{majors:typeof majors.value}>('/api/public/catalog')).majors;}catch(e){error.value=accountError(e);}}
onMounted(loadCatalog);
async function submit(){
  working.value=true;error.value='';
  try {
    await api('/api/register',{login:login.value,password:password.value,displayName:displayName.value,role:role.value,...(invited.value?{inviteToken:route.query.invite}:role.value==='student'?{studentNo:studentNo.value,majorId:majorId.value,cohortYear:cohortYear.value}:{companyName:companyName.value})});
    await session.login(login.value,password.value);password.value='';
    await router.replace(session.accountStatus==='approved'?roleHome[session.actor!.role]:'/account');
  }catch(e){error.value=accountError(e);}finally{working.value=false;}
}
</script>
<template>
  <main class="account-page feature-registration ui-scene ui-scene--campus"><header class="account-header"><RouterLink to="/"><BrandMark :size="32" /></RouterLink><ThemeToggle /></header>
    <section class="account-panel"><h1>{{ invited?'接受邀请':'注册账号' }}</h1><p class="account-intro">{{ invited?'创建密码，开通你的工作台。':'学生与企业注册后由学校审核。' }}</p>
      <form class="form-stack" @submit.prevent="submit">
        <label v-if="!invited" class="form-label">账号类型<select v-model="role"><option value="student">学生</option><option value="company">企业</option></select></label>
        <p v-else>{{ role==='admin'?'管理员':'辅导员' }}邀请 · {{ login }}</p>
        <label class="form-label">账号<input v-model="login" aria-label="账号" aria-describedby="login-help" required minlength="3" maxlength="64" pattern="[a-zA-Z0-9][a-zA-Z0-9._@+\-]*" autocomplete="username" :readonly="invited" /><small id="login-help">3–64位字母、数字或 . _ @ + -</small></label>
        <label class="form-label">姓名<input v-model="displayName" required minlength="2" maxlength="80" autocomplete="name" /></label>
        <label class="form-label">密码<input v-model="password" aria-label="密码" aria-describedby="password-help" required type="password" minlength="12" maxlength="256" autocomplete="new-password" /><small id="password-help">至少12个字符，请勿与其他网站共用。</small></label>
        <template v-if="!invited && role==='student'">
          <label class="form-label">学号<input v-model="studentNo" required minlength="3" maxlength="40" /></label>
          <label class="form-label">专业<select v-model="majorId" aria-label="专业" required><option disabled value="">请选择专业</option><option v-for="major in majors" :key="major.id" :value="major.id">{{ major.label }}</option></select></label>
          <label class="form-label">毕业年份<input v-model.number="cohortYear" required type="number" min="2000" :max="new Date().getFullYear()+10" /></label>
        </template>
        <label v-if="!invited && role==='company'" class="form-label">企业名称<input v-model="companyName" required minlength="2" maxlength="160" /></label>
        <p v-if="error" role="alert" class="business-error">{{ error }}</p>
        <p class="caption">信息用于身份审核与就业服务。请填写本人或获授权主体的信息。</p>
        <AppButton type="submit" :loading="working">提交注册</AppButton>
        <RouterLink to="/login">已有账号？登录</RouterLink>
      </form>
    </section>
  </main>
</template>
