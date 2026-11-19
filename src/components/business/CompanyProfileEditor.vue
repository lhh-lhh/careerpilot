<script setup lang="ts">
import { ref } from 'vue';
import type { Company, Dictionary } from '../../types/entities';
import type { CompanyProfile } from '../../services/company-command';
import { appRepository } from '../../services/app-services';
import { useSessionStore } from '../../stores/session';
import { fixedClock } from '../../domain/clock';
import AppButton from '../base/AppButton.vue';
import AppModal from '../base/AppModal.vue';
const props=defineProps<{company:Company;dictionaries:Dictionary[]}>();
const emit=defineEmits<{saved:[]}>(),session=useSessionStore();
const open=ref(false),busy=ref(false),notice=ref(''),revision=ref(0);
const form=ref<CompanyProfile>({name:'',industryId:'',cityId:'',scale:'',description:''});
function edit(){const {name,industryId,cityId,scale,description}=props.company;form.value={name,industryId,cityId,scale,description};revision.value=props.company.revision;notice.value='';open.value=true;}
async function save(){if(!session.actor||busy.value)return;busy.value=true;try{await appRepository.execute({type:'SAVE_COMPANY_PROFILE',entityId:props.company.id,expectedRevision:revision.value,commandId:crypto.randomUUID(),payload:form.value},session.actor,fixedClock);open.value=false;notice.value='企业资料已保存。';emit('saved');}catch{notice.value='企业资料未保存，请检查必填项；如版本已变化，关闭后重新打开。';}finally{busy.value=false;}}
</script>
<template>
  <section class="company-profile surface" aria-label="企业资料">
    <div><strong>{{ company.name }}</strong><p>{{ company.scale || '企业资料待完善' }} · {{ dictionaries.find(d=>d.id===company.cityId)?.label || '城市待完善' }}</p><p class="profile-description">{{ company.description || '请完善企业介绍、行业、规模和所在城市，便于求职者核对。' }}</p></div>
    <AppButton variant="secondary" @click="edit">维护企业资料</AppButton>
    <p v-if="notice" role="status">{{ notice }}</p>
    <AppModal data-scene="governance" :open="open" title="企业资料维护" @close="!busy&&(open=false)">
      <div class="form-stack"><p>编辑资料不会授予企业准入或工商认证。</p><p v-if="company.verified" class="caption">已核准企业更名需先联系管理员暂停准入并重新审核。</p>
        <label class="form-label">企业全称<input v-model="form.name" :disabled="company.verified||busy" maxlength="160" /></label>
        <label class="form-label">企业所属行业<select v-model="form.industryId" :disabled="busy"><option value="">请选择</option><option v-for="d in dictionaries.filter(d=>d.kind==='industry'&&d.active)" :key="d.id" :value="d.id">{{ d.label }}</option></select></label>
        <label class="form-label">企业所在城市<select v-model="form.cityId" :disabled="busy"><option value="">请选择</option><option v-for="d in dictionaries.filter(d=>d.kind==='city'&&d.active)" :key="d.id" :value="d.id">{{ d.label }}</option></select></label>
        <label class="form-label">企业规模<input v-model="form.scale" :disabled="busy" maxlength="80" placeholder="如20–99人" /></label>
        <label class="form-label">企业介绍<textarea v-model="form.description" :disabled="busy" minlength="10" maxlength="4000" rows="6" /></label>
        <p v-if="notice" role="alert">{{ notice }}</p>
      </div><template #footer><AppButton variant="secondary" :disabled="busy" @click="open=false">取消</AppButton><AppButton :loading="busy" @click="save">保存企业资料</AppButton></template>
    </AppModal>
  </section>
</template>
<style scoped>.company-profile{display:flex;align-items:flex-start;gap:24px;flex-wrap:wrap;padding:24px}.company-profile>div{flex:1;min-width:0}.profile-description{white-space:pre-line;font-size:13px;line-height:1.7;color:var(--text-2);max-width:900px}.company-profile>p{width:100%}</style>
