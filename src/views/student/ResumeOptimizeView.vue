<script setup lang="ts">
import WorkbenchGuide from "../../components/presentation/WorkbenchGuide.vue";
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import {computed,ref,toRaw,watch,onBeforeUnmount} from 'vue';
import {onBeforeRouteLeave} from 'vue-router';
import {useStudentData} from '../../composables/useStudentData';
import {useSessionStore} from '../../stores/session';
import {workbench} from '../../adapters/repository/http';
import {appRepository} from '../../services/app-services';
import {fixedClock} from '../../domain/clock';
import {isOnline} from '../../services/runtime';
import {applyPatches,prepareOptimizationDraft} from '../../domain/resume/optimization-draft';
import type {ResumeSections,ResumeVersion} from '../../types/entities';
import type {ResumeOptimization,ResumePatch} from '../../types/ai-workbench';
import AppButton from '../../components/base/AppButton.vue';
import AiProvenance from '../../components/business/AiProvenance.vue';
import {aiConsent} from '../../services/ai-consent';
const {data,loading,error,load}=useStudentData(),session=useSessionStore();
const resume=computed(()=>data.value?.resumes[0]),draft=ref<ResumeSections|null>(null),source=ref<ResumeSections|null>(null),revision=ref(0);
const result=ref<ResumeOptimization|null>(null),accepted=ref<string[]>([]),history=ref<ResumeVersion[]>([]),undo=ref<{draft:ResumeSections;ids:string[]}[]>([]),consent=aiConsent,busy=ref(false),notice=ref('');
let controller:AbortController|undefined,operation=0;
function stop(){operation++;controller?.abort();busy.value=false;}
watch(consent,value=>{if(!value){stop();notice.value='AI已关闭，未完成的建议已停止，原简历未改动。';}},{flush:'sync'});
const clone=(s:ResumeSections)=>structuredClone(toRaw(s));
const dirty=computed(()=>JSON.stringify(draft.value)!==JSON.stringify(source.value));
watch(resume,r=>{if(r&&!draft.value){draft.value=clone(r.sections);source.value=clone(r.sections);revision.value=r.revision;}});
async function generate(){if(!resume.value||!consent.value||busy.value)return;if(dirty.value&&!window.confirm('重新生成将丢弃当前优化草稿，继续？'))return;const captured=structuredClone(toRaw(resume.value)),current=++operation;busy.value=true;notice.value='';controller=new AbortController();try{
 const response=await workbench<{data:ResumeOptimization}>('/generate',{kind:'resume',context:{sourceRevision:captured.revision},consent:true},controller.signal);
 if(current!==operation)return;
 const prepared=prepareOptimizationDraft(captured,resume.value.revision);
 source.value=clone(prepared);draft.value=clone(prepared);revision.value=captured.revision;result.value=response.data;accepted.value=[];undo.value=[];
}catch{if(current===operation)notice.value='本次生成未完成，原简历未改动。仍显示的建议为上次结果，请检查AI服务后手动重试。';}finally{if(current===operation)busy.value=false;}}
function accept(patches:ResumePatch[]){if(!draft.value)return;const selected=patches.filter(p=>!p.requiresUserInput&&!accepted.value.includes(p.id));try{const next=applyPatches(clone(draft.value),selected);undo.value.push({draft:clone(draft.value),ids:[...accepted.value]});draft.value=next;accepted.value.push(...selected.map(p=>p.id));notice.value='已应用到优化草稿，尚未写入正式简历。';}catch{notice.value='原文已变化，未覆盖草稿；请撤销手改或重新生成。';}}
function rollback(){const last=undo.value.pop();if(last){draft.value=last.draft;accepted.value=last.ids;}}
function beforeEdit(){if(draft.value)undo.value.push({draft:clone(draft.value),ids:[...accepted.value]});}
async function save(){if(!resume.value||!draft.value||!session.actor||!window.confirm('将优化草稿保存为新的正式简历版本？'))return;busy.value=true;try{
 await appRepository.execute({type:'SAVE_RESUME',commandId:crypto.randomUUID(),entityId:resume.value.id,expectedRevision:revision.value,payload:{sections:clone(draft.value)}},session.actor,fixedClock);
 source.value=clone(draft.value);await load();revision.value=resume.value!.revision;result.value=null;undo.value=[];accepted.value=[];notice.value='已保存为新版本。历史版本仍可查看和恢复。';
}catch{notice.value='保存未完成，可能其他页面已更新简历。草稿保留，请核对最新版本，不会自动覆盖。';}finally{busy.value=false;}}
async function showHistory(){if(resume.value&&session.actor)history.value=await appRepository.readResumeHistory(session.actor,resume.value.studentId);}
function restore(version:ResumeVersion){if(!window.confirm('把此历史版本载入草稿？保存后会新增版本，不删除历史。'))return;beforeEdit();draft.value=clone(version.snapshot);notice.value='历史版本已载入草稿，核对后点击保存。';}
const unload=(e:Event)=>{if(dirty.value)e.preventDefault();};
window.addEventListener('beforeunload',unload);onBeforeUnmount(()=>{stop();window.removeEventListener('beforeunload',unload);});
onBeforeRouteLeave(()=>!dirty.value||window.confirm('优化草稿尚未保存，确定离开？'));
</script>
<template>
  <main id="main-content" class="business-page optimize-page ui-scene ui-scene--paper">
  <WorkbenchHeader>
      <template #heading><div><p class="kicker">RESUME STUDIO · 事实保真</p><h1>把表达打磨好，把选择留给你。</h1><p>分部分采纳到草稿，核对后一次保存；不编造经历、技能或业绩。</p></div></template>
      <template #actions><div class="page-actions"><RouterLink v-if="isOnline" class="inline-link" to="/student/resume/import">识别PDF / 图片文字</RouterLink><RouterLink class="inline-link" to="/student/resume">返回简历工作台</RouterLink></div></template>
    </WorkbenchHeader>

    <div class="workbench-split workbench-body-layout"><div class="workbench-body-main">
  <p v-if="!isOnline" class="business-notice">真实AI优化需在在线服务中使用。离线原简历编辑不受影响。</p>
  <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" class="business-notice" role="status">{{ notice }}</p><p v-if="loading">正在读取简历…</p>
  <section v-if="resume&&draft" class="studio-panel"><h2>生成优化建议</h2><p class="consent">{{ consent?'AI默认授权已开启':'AI已关闭，请在顶部开启' }}。点击生成将本次项目、实习描述脱敏后发送至DeepSeek，可能产生费用，受平台日调用额度限制；可在顶部关闭。敏感段落需手动核对。</p><div class="page-actions"><AppButton :loading="busy" :disabled="!isOnline||!consent" @click="generate">{{ result?'重新生成':'生成AI优化方案' }}</AppButton><AppButton v-if="busy" variant="ghost" @click="stop">停止生成</AppButton><AppButton variant="secondary" @click="showHistory">查看保存版本</AppButton></div>
   <p v-if="result">{{ result.summary }}</p><AiProvenance :value="result?.provenance" />
   <div v-if="result" class="page-actions"><AppButton :disabled="busy||!result.patches.some(p=>!p.requiresUserInput&&!accepted.includes(p.id))" @click="accept(result.patches)">一键接受全部可采纳建议</AppButton><AppButton variant="secondary" :disabled="!undo.length||busy" @click="rollback">撤销上一步</AppButton></div>
   <p v-if="result&&!result.patches.length">暂没有可自动采纳的改写。可完善事实后重新生成，或直接编辑下方草稿。</p>
   <article v-for="patch in result?.patches" :key="patch.id" class="patch-card"><header><h3>{{ patch.section==='projects'?'项目经历':'实习经历' }}</h3><span v-if="accepted.includes(patch.id)" class="accepted">已应用到草稿</span></header><div class="comparison"><section><h4>原内容</h4><p>{{ patch.before }}</p></section><section><h4>优化后内容</h4><p>{{ patch.after }}</p></section></div><p class="muted">优化理由：{{ patch.reason }}</p><p v-if="patch.requiresUserInput">需补充或核对事实，不纳入自动接受。请参考后手动编辑。</p><AppButton size="sm" :disabled="busy||patch.requiresUserInput||accepted.includes(patch.id)" @click="accept([patch])">一键接受本部分</AppButton></article>
  </section>
  <section v-if="draft" class="studio-panel"><h2>优化草稿 <small>{{ dirty?'未保存':'与正式版本一致' }}</small></h2><p>这里只编辑项目与实习描述。教育、技能、日期等事实字段请返回简历工作台核实。</p><template v-for="section in (['experience','projects'] as const)" :key="section"><label v-for="row in draft[section]" :key="row.id" class="draft-field">{{ section==='projects'?'项目':'实习' }} · {{ 'name' in row?row.name:row.title }}<textarea v-model="row.description" maxlength="4000" rows="5" :disabled="busy" @focus="beforeEdit"></textarea></label></template><div class="page-actions"><AppButton :disabled="!dirty||busy" :loading="busy" @click="save">确认并保存到简历</AppButton><AppButton variant="secondary" :disabled="!undo.length||busy" @click="rollback">撤销上一步</AppButton></div></section>
  <section v-if="history.length" class="studio-panel"><h2>版本记录</h2><article v-for="version in history.slice().reverse()" :key="version.id" class="history-row"><span>版本 {{ version.number }} · {{ new Date(version.createdAt).toLocaleString() }}</span><AppButton variant="secondary" size="sm" :disabled="busy" @click="restore(version)">载入草稿以恢复</AppButton></article></section>
  <p class="muted">AI建议仅供参考，采纳前请核对事实。未保存的草稿不会自动修改正式简历。</p>
 
    </div><WorkbenchGuide title="先对照原文，再采纳建议。" copy="分部分采纳到草稿，核对后再保存。原文、正式版本与历史记录始终保留。" /></div>
    </main>
</template>
<style scoped>
.optimize-page{max-width:1180px}.kicker{color:var(--brand-text);font-size:12px;letter-spacing:.1em}.studio-panel,.patch-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px;margin:20px 0}.studio-panel h2{margin:0 0 16px}.consent{display:flex;align-items:flex-start;gap:10px;line-height:1.8;margin:12px 0 20px}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:20px}.comparison section{background:var(--surface-2);border-radius:12px;padding:16px}.comparison p{white-space:pre-wrap;line-height:1.8}.patch-card header,.history-row{display:flex;justify-content:space-between;gap:16px;align-items:center}.accepted{color:var(--brand-text)}.muted,small{color:var(--text-2);font-size:13px}.draft-field{display:flex;flex-direction:column;gap:10px;margin:20px 0;font-weight:600}textarea{resize:vertical;width:100%;box-sizing:border-box;border:1px solid var(--border-control);border-radius:10px;background:var(--surface);color:var(--text-1);padding:12px;font:inherit;line-height:1.7}.history-row{padding:12px 0;border-bottom:1px solid var(--border)}@media(max-width:700px){.comparison{grid-template-columns:1fr}.studio-panel,.patch-card{padding:16px}.history-row{align-items:flex-start;flex-direction:column}}
</style>
