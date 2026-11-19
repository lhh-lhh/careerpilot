<script setup lang="ts">
import WorkbenchGuide from "../../components/presentation/WorkbenchGuide.vue";
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import {computed,ref,onMounted} from 'vue';
import {useRoute} from 'vue-router';
import {workbench} from '../../adapters/repository/http';
import type {VoiceSession} from '../../types/ai-workbench';
import AiProvenance from '../../components/business/AiProvenance.vue';
const route=useRoute(),session=ref<VoiceSession|null>(null),error=ref('');
const roomPath=computed(()=>route.path.includes('/voice/')?'/student/mock/voice':'/student/mock');
const answered=computed(()=>session.value?.turns.filter(t=>t.answer!==null)??[]),evaluated=computed(()=>answered.value.filter(t=>t.evaluation));
const overall=computed(()=>evaluated.value.length?Math.round(evaluated.value.reduce((a,t)=>a+t.evaluation!.total,0)/evaluated.value.length):null);
const strengths=computed(()=>[...new Set(evaluated.value.flatMap(t=>t.evaluation!.strengths))].slice(0,6)),improvements=computed(()=>[...new Set(evaluated.value.flatMap(t=>t.evaluation!.improvements))].slice(0,8));
onMounted(async()=>{if(typeof route.query.id!=='string'){error.value='请选择一场面试记录。';return;}try{session.value=(await workbench<{session:VoiceSession}>(`/sessions/${encodeURIComponent(route.query.id)}`)).session;}catch{error.value='报告不存在或无权限，请返回面试列表。';}});
</script>
<template>
 <main id="main-content" class="business-page voice-report ui-scene ui-scene--paper"><WorkbenchHeader>
      <template #heading="{design}"><div><p class="kicker">AI INTERVIEW FEEDBACK · PRACTICE ONLY</p><h1>{{ design.headline }}</h1><p>逐轮依据、参考分与可执行建议，来自本场已保存回答；打开报告不重新调用模型。</p></div></template>
      <template #actions><RouterLink :to="roomPath" class="inline-link">返回面试练习</RouterLink></template>
    </WorkbenchHeader>
    <div class="workbench-split workbench-body-layout"><div class="workbench-body-main"><p v-if="error" role="alert">{{ error }}</p>
 <template v-if="session"><section class="summary panel"><div><h2>{{ session.target.title }}</h2><p>{{ session.state==='completed'?'已结束':'进行中，以下为阶段反馈' }} · {{ new Date(session.updatedAt).toLocaleString() }}</p><p>共{{ answered.length }}轮已提交回答，{{ evaluated.length }}轮取得有效评价；未评分轮次不计为0分。</p><p class="muted">综合分为有效逐轮参考分的等权平均，非录用概率；评分量规 ai-practice-1.0，与旧规则练习不可直接比较。</p></div><div class="overall"><strong>{{ overall??'—' }}</strong><span>AI练习综合参考分</span></div></section>
 <section class="feedback-grid"><article class="panel"><h2>本场亮点</h2><ul v-if="strengths.length"><li v-for="s in strengths" :key="s">{{ s }}</li></ul><p v-else>尚无有效评价，不能生成虚构亮点。</p></article><article class="panel"><h2>优先改进建议</h2><ol v-if="improvements.length"><li v-for="s in improvements" :key="s">{{ s }}</li></ol><p v-else>补充回答并完成评价后查看。</p></article></section>
 <article v-for="(turn,index) in answered" :key="turn.id" class="panel"><header class="turn-header"><h2>第{{ index+1 }}轮 · {{ turn.question }}</h2><strong v-if="turn.evaluation">{{ turn.evaluation.total }}分</strong></header><AiProvenance :value="turn.questionProvenance" historical /><h3>你的回答</h3><p class="answer">{{ turn.answer }}</p><template v-if="turn.evaluation"><AiProvenance :value="turn.evaluation.provenance" historical /><div class="dimension" v-for="d in turn.evaluation.dimensions" :key="d.key"><div><strong>{{ d.label }}</strong><span>{{ d.score }} / 100</span></div><blockquote v-if="d.evidence">“{{ d.evidence }}”</blockquote><p>{{ d.reason }}</p></div><p><strong>下一步：</strong>{{ turn.evaluation.improvements.join('；') }}</p></template><p v-else>{{ turn.evaluationError??'本轮尚未取得评价，回答已保留。' }}</p></article>
 <p v-if="!answered.length" class="panel">本场还没有已提交回答。</p><RouterLink v-if="session.state==='active'" :to="{path:roomPath,query:{id:session.id}}" class="inline-link">继续这场练习</RouterLink><p class="muted">AI可能出错。评价只基于题目、岗位要求和转写文本，不声称判断真实工作能力、口音或声调。</p></template>
    </div><WorkbenchGuide title="从回答中，找到改进依据。" copy="只读取本场已保存的回答和评价。报告打开不会重新生成，也不评价口音或音色。" /></div>
    </main>
</template>
<style scoped>
.voice-report{max-width:1100px}.kicker{color:var(--brand-text);font-size:12px;letter-spacing:.08em}.panel{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:26px;margin:20px 0}.summary{display:flex;gap:30px;justify-content:space-between;align-items:center}.overall{min-width:160px;text-align:center;display:flex;flex-direction:column;font-size:12px;color:var(--text-2)}.overall strong{font-size:70px;color:var(--brand-text)}.feedback-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.feedback-grid .panel{margin:0}.feedback-grid li{line-height:1.9;margin-bottom:10px}.turn-header{display:flex;justify-content:space-between;gap:20px}.turn-header h2{font-size:20px;line-height:1.7}.turn-header strong{white-space:nowrap;font-size:24px;color:var(--brand-text)}.answer{white-space:pre-wrap;line-height:1.9;padding:20px;border-radius:12px;background:var(--surface-2)}.dimension{padding:18px 0;border-bottom:1px solid var(--border)}.dimension>div{display:flex;justify-content:space-between}.dimension blockquote{border-left:3px solid var(--brand);padding:10px 18px;margin:14px 0;color:var(--text-2)}.dimension p{line-height:1.8}.muted{font-size:12px;line-height:1.8;color:var(--text-2)}@media(max-width:650px){.summary{flex-direction:column;align-items:flex-start}.overall{align-items:flex-start}.feedback-grid{grid-template-columns:1fr}.panel{padding:18px}}
</style>
