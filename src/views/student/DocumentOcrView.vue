<script setup lang="ts">
import WorkbenchGuide from "../../components/presentation/WorkbenchGuide.vue";
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import {ref,watch,onBeforeUnmount} from 'vue';
import {onBeforeRouteLeave} from 'vue-router';
import {aiFetch} from '../../adapters/repository/http';
import {aiConsent} from '../../services/ai-consent';
import {isOnline} from '../../services/runtime';
import type {OcrResult} from '../../types/ai-workbench';
import AppButton from '../../components/base/AppButton.vue';
import AiProvenance from '../../components/business/AiProvenance.vue';
const input=ref<HTMLInputElement|null>(null),file=ref<File|null>(null),result=ref<OcrResult|null>(null),busy=ref(false),notice=ref('');
let controller:AbortController|undefined,operation=0;
function stop(clear=false){operation++;controller?.abort();busy.value=false;if(clear){file.value=null;result.value=null;if(input.value)input.value.value='';}}
function choose(event:Event){stop();result.value=null;notice.value='';const selected=(event.target as HTMLInputElement).files?.[0];file.value=null;if(!selected)return;if(selected.size>2*1024*1024||selected.size===0){notice.value='请选择非空且不超过2MiB的文件。';if(input.value)input.value.value='';return;}if(!/\.(pdf|png|jpe?g)$/i.test(selected.name)){notice.value='仅支持PDF、PNG、JPEG；服务端还会核验真实格式。';if(input.value)input.value.value='';return;}file.value=selected;}
async function recognize(){if(!isOnline||!aiConsent.value||busy.value||!file.value)return;const selected=file.value,current=++operation;controller=new AbortController();busy.value=true;result.value=null;notice.value='';try{
 const response=await aiFetch('/documents/ocr',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-AI-Consent':'true','X-File-Name':encodeURIComponent(selected.name)},body:selected,signal:window.AbortSignal.any([controller.signal,window.AbortSignal.timeout(190000)])});
 const value=await response.json() as OcrResult;if(current!==operation)return;result.value=value;
 }catch{if(current===operation)notice.value='识别未完成，没有生成替代文字。请检查格式、页数、额度或服务状态后手动重试。';}finally{if(current===operation)busy.value=false;}}
async function copy(text:string){try{await navigator.clipboard.writeText(text);notice.value='已复制，请核对后再手动填写简历。';}catch{notice.value='未能自动复制，可在只读文本框中选择文字复制。';}}
function cancel(){stop();notice.value='页面等待已停止。已上传文档可能仍被DeepSeek处理并计费，取消不代表撤回。';}
watch(aiConsent,value=>{if(!value){stop(true);notice.value='授权已关闭，文件与识别结果已从本页清除。已上传的内容无法保证撤回或停止计费。';}},{flush:'sync'});
onBeforeRouteLeave(()=>{stop(true);return true;});onBeforeUnmount(()=>stop(true));
</script>
<template>
 <main id="main-content" class="business-page ocr-page ui-scene ui-scene--paper"><WorkbenchHeader>
      <template #heading><div><p class="kicker">DOCUMENT OCR · 人工核对</p><h1>将文档识别为可核对的文字。</h1><p>逐页展示DeepSeek识别结果，不自动修改正式简历，也不认证证书真伪。</p></div></template>
      <template #actions><RouterLink to="/student/resume" class="inline-link">返回简历工作台</RouterLink></template>
    </WorkbenchHeader>

    <div class="workbench-split workbench-body-layout"><div class="workbench-body-main">
 <section class="panel privacy"><h2>发送前请确认</h2><p>整个文件会发送至DeepSeek，包括其中的姓名、联系方式和证件信息；图片不能通过文本脱敏可靠匿名化。请勿上传无权处理的他人材料。</p><p>每次1个PDF、PNG或JPEG，最大2MiB，PDF最多20页。平台仅在本页暂存文件和正文，不自动存入附件库或简历；离开或关闭授权后清除。</p><p>识别可能等待约180秒并产生费用。文件上传后，即使关闭页面或取消等待，也不能保证供应商停止处理或计费。没有自动付费重试。</p><p>{{ aiConsent?'顶部AI默认授权已开启；点击下方按钮即确认本次整份文件外发。':'AI已关闭，请在顶部开启后再发送。' }}</p></section>
 <p v-if="notice" class="business-notice" role="status">{{ notice }}</p><p v-if="!isOnline" class="business-notice">文档识别需要在线DeepSeek服务，离线不生成替代结果。</p>
 <section class="panel"><h2>选择待识别文档</h2><label class="file-label">选择PDF或图片<input ref="input" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" :disabled="busy||!aiConsent" @change="choose"></label><p v-if="file" class="muted">{{ file.name }} · {{ (file.size/1024).toFixed(1) }}KiB（服务端核验格式与PDF页数）</p><div class="page-actions"><AppButton :loading="busy" :disabled="!isOnline||!file||!aiConsent" @click="recognize">发送文档并识别</AppButton><AppButton v-if="busy" variant="secondary" @click="cancel">停止等待</AppButton><AppButton v-if="file||result" variant="ghost" @click="stop(true)">清除本页文件与结果</AppButton></div><p v-if="busy" aria-live="polite">正在识别，请等待；不会自动再次调用。</p></section>
 <section v-if="result" class="panel"><h2>识别结果 · {{ result.page_count }}页</h2><p class="muted">请核对姓名、日期、编号与专业术语。复制不代表保存；需要你自行确认后填写正式资料。</p><AiProvenance :value="result.provenance" /><article v-for="page in result.pages" :key="page.index" class="ocr-result"><h3>第{{ page.index+1 }}页</h3><p v-if="page.finish_reason==='length'" class="warning" role="alert">本页达到输出上限，识别内容可能不完整；请分拆文档后手动重新识别并核对。</p><label>第{{ page.index+1 }}页识别文字<textarea :value="page.text" readonly rows="12"></textarea></label><AppButton variant="secondary" size="sm" @click="copy(page.text)">复制本页文字</AppButton></article></section>
 
    </div><WorkbenchGuide title="识别之后，务必核对。" copy="结果按页显示，不自动写入简历。核对姓名、日期、编号和专业术语后再使用。" /></div>
    </main>
</template>
<style scoped>
.ocr-page{max-width:1100px}.kicker{font-size:12px;color:var(--brand-text);letter-spacing:.1em}.panel{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:26px;margin:22px 0}.privacy p{line-height:1.8;font-size:14px}.file-label,.ocr-result label{display:flex;flex-direction:column;gap:12px;font-size:14px}input{max-width:100%;padding:16px 0}.muted{font-size:12px;color:var(--text-2);line-height:1.8;overflow-wrap:anywhere}.ocr-result{border-top:1px solid var(--border);padding-top:12px;margin-top:24px}.ocr-result textarea{box-sizing:border-box;width:100%;padding:14px;border:1px solid var(--border-control);border-radius:10px;background:var(--surface-2);color:var(--text-1);resize:vertical;line-height:1.8;font:inherit}.ocr-result button{margin-top:14px}.warning{border-left:3px solid var(--brand-text);padding:12px;background:var(--brand-soft);font-size:13px;line-height:1.8}@media(max-width:600px){.panel{padding:18px}}
</style>
