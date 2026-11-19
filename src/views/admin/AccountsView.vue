<script setup lang="ts">
import WorkbenchGuide from "../../components/presentation/WorkbenchGuide.vue";
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import { computed,onMounted,ref,onUnmounted } from 'vue';
import { api } from '../../adapters/repository/http';
import { accountError } from '../../services/account-errors';
import type { User } from '../../types/entities';
import { roleLabels } from '../../types/identity';
import AppButton from '../../components/base/AppButton.vue';
const users=ref<User[]>([]),error=ref(''),working=ref(false),filter=ref('pending'),reasons=ref<Record<string,string>>({}),counselors=ref<Record<string,string>>({});
const staff=computed(()=>users.value.filter(u=>u.role==='counselor'&&u.active&&(u.accountStatus??'approved')==='approved'));
const filtered=computed(()=>users.value.filter(u=>filter.value==='all'||u.accountStatus===filter.value));
const inviteLogin=ref(''),inviteRole=ref('counselor'),invitation=ref('');
const majors=ref<{id:string;label:string;collegeLabel:string}[]>([]);
function majorLabel(id?:string){const major=majors.value.find(m=>m.id===id);return major?`${major.collegeLabel} · ${major.label}`:'专业信息待核对';}
async function load(){try{const [accounts,catalog]=await Promise.all([api<User[]>('/api/admin/accounts'),api<{majors:typeof majors.value}>('/api/public/catalog')]);users.value=accounts;majors.value=catalog.majors;}catch(e){error.value=accountError(e);}}
async function review(user:User,decision:'approve'|'reject'){
  const id=user.id,revision=user.revision,reason=reasons.value[id],counselorId=counselors.value[id];working.value=true;error.value='';
  try{await api('/api/admin/accounts/review',{userId:id,expectedRevision:revision,decision,reason,...(user.role==='student'&&decision==='approve'?{counselorId}:{})});await load();}catch(e){error.value=accountError(e);await load();}finally{working.value=false;}
}
async function invite(){working.value=true;error.value='';invitation.value='';try{const result=await api<{token:string;login:string;role:string}>('/api/admin/accounts/invite',{login:inviteLogin.value,role:inviteRole.value});invitation.value=`${window.location.origin}${window.location.pathname}#/register?invite=${encodeURIComponent(result.token)}&login=${encodeURIComponent(result.login)}&role=${result.role}`;}catch(e){error.value=accountError(e);}finally{working.value=false;}}
onMounted(()=>{void load();window.addEventListener('careerpilot-invalidate',load);});onUnmounted(()=>window.removeEventListener('careerpilot-invalidate',load));
</script>
<template>
  <main id="main-content" class="business-page accounts-view ui-scene ui-scene--governance"><WorkbenchHeader>
      <template #heading><div><p class="eyebrow">账号审核</p><h1>让每一次开通，都有清晰归属。</h1><p>确认身份与归属，开通对应服务。</p></div></template>
      <template #actions><AppButton variant="secondary" @click="load">刷新</AppButton></template>
    </WorkbenchHeader>

    <div class="workbench-split workbench-body-layout"><div class="workbench-body-main">
    <p v-if="error" role="alert" class="business-error">{{ error }}</p>
    <label class="form-label">账号状态<select v-model="filter"><option value="pending">待审核</option><option value="approved">已通过</option><option value="rejected">未通过</option><option value="all">全部</option></select></label>
    <p v-if="!filtered.length" class="business-notice">暂无符合条件的账号。</p>
    <article v-for="user in filtered" :key="user.id" class="account-review"><header><h2>{{ user.displayName }}</h2><span>{{ user.accountStatus==='pending'?'待审核':user.accountStatus==='rejected'?'未通过':'已通过' }}</span></header><p>{{ user.login }} · {{ roleLabels[user.role] }}</p>
      <p v-if="user.role==='student'">学号 {{ user.accountRequest?.studentNo }} · {{ user.accountRequest?.cohortYear }}届 · {{ majorLabel(user.accountRequest?.majorId) }}</p><p v-if="user.role==='company'">{{ user.accountRequest?.companyName }}</p>
      <template v-if="user.accountStatus==='pending'">
        <label v-if="user.role==='student'" class="form-label">辅导员<select v-model="counselors[user.id]"><option disabled value="">请选择归属辅导员</option><option v-for="teacher in staff" :key="teacher.id" :value="teacher.id">{{ teacher.displayName }}</option></select></label>
        <label class="form-label">审核说明<input v-model="reasons[user.id]" minlength="2" maxlength="500" /></label>
        <div class="account-actions"><AppButton :loading="working" :disabled="!reasons[user.id]?.trim() || user.role==='student'&&!counselors[user.id]" @click="review(user,'approve')">批准</AppButton><AppButton variant="secondary" :disabled="working||!reasons[user.id]?.trim()" @click="review(user,'reject')">拒绝</AppButton></div>
      </template><p v-else>{{ user.accountReviewReason }}</p>
    </article>
    <section class="account-review"><h2>邀请同事</h2><p class="caption">邀请绑定账号与角色，48小时内有效，仅可使用一次。请通过可信渠道发送。</p><form class="invite-form" @submit.prevent="invite"><label class="form-label">邀请账号<input v-model="inviteLogin" required minlength="3" maxlength="64" /></label><label class="form-label">邀请角色<select v-model="inviteRole"><option value="counselor">辅导员</option><option value="admin">管理员</option></select></label><AppButton type="submit" :loading="working">生成邀请</AppButton></form><label v-if="invitation" class="form-label">邀请链接<textarea :value="invitation" readonly rows="3" @focus="($event.target as HTMLTextAreaElement).select()" /></label></section>
  
    </div><WorkbenchGuide title="先核实身份，再办理审核。" copy="先核实身份与所属辖区，再按原权限办理。邀请、审核理由和处理记录分别保留。" /></div>
    </main>
</template>
<style scoped>
.accounts-view{max-width:1000px}.page-heading,.account-review header{display:flex;gap:20px;justify-content:space-between;align-items:center;margin-bottom:20px}.account-review{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px;margin-top:20px}.account-review p{margin:12px 0;color:var(--text-2)}.account-review .form-label{margin-top:16px}.account-actions{display:flex;gap:12px;margin-top:20px}.invite-form{display:grid;grid-template-columns:1fr 1fr auto;gap:16px;align-items:end}@media(max-width:700px){.invite-form{grid-template-columns:1fr}.account-review{padding:20px}.page-heading{align-items:flex-start}}
</style>
