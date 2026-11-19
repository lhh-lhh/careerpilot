<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { OfferDocument } from '../../types/entities';
import AppButton from '../base/AppButton.vue';
import AppTag from '../base/AppTag.vue';
const props = withDefaults(defineProps<{ document: OfferDocument; recipient: string; label?: string }>(), { label: '当前录用意向文书' });
const content = ref<HTMLElement>();
const now = ref(Date.now());
let timer: number | undefined;
onMounted(() => { timer = window.setInterval(() => { now.value = Date.now(); }, 1000); });
onBeforeUnmount(() => { window.clearInterval(timer); });
const expired = computed(() => props.document.status === 'pending' && Date.parse(props.document.responseDeadline) <= now.value);
const status = computed(() => expired.value ? '已过期' : ({ pending: '待响应', accepted: '已接受', declined: '已拒绝', withdrawn: '已撤销' })[props.document.status]);
const time = (value: string) => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
function printDocument() {
  const source = content.value;
  if (!source) return;
  const sheet = source.cloneNode(true) as HTMLElement;
  sheet.classList.add('offer-print-sheet');
  sheet.querySelectorAll('button').forEach(button => button.remove());
  document.body.append(sheet);
  document.body.classList.add('printing-offer');
  try { window.print(); }
  finally { sheet.remove(); document.body.classList.remove('printing-offer'); }
}
</script>
<template>
  <section ref="content" class="offer-document" role="region" :aria-label="label">
    <header><div><h3>录用意向文书</h3><span>版本 {{ document.version }}</span></div><AppTag :tone="document.status === 'accepted' ? 'success' : 'neutral'">{{ status }}</AppTag></header>
    <dl>
      <dt>收件人</dt><dd>{{ recipient }}</dd>
      <dt>企业</dt><dd>{{ document.companyName }}</dd>
      <dt>岗位</dt><dd>{{ document.jobTitle }}</dd>
      <dt>工作地点</dt><dd>{{ document.location }}</dd>
      <dt>薪酬说明</dt><dd>{{ document.compensation }}</dd>
      <dt>预计到岗</dt><dd>{{ document.startDate }}</dd>
      <dt>响应截止</dt><dd>{{ time(document.responseDeadline) }}（北京时间）</dd>
      <template v-if="document.note"><dt>补充条款</dt><dd>{{ document.note }}</dd></template>
      <dt>签发时间</dt><dd>{{ time(document.issuedAt) }}</dd>
      <template v-if="document.respondedAt"><dt>学生响应</dt><dd>{{ time(document.respondedAt) }}<span v-if="document.responseReason"> · {{ document.responseReason }}</span></dd></template>
      <template v-if="document.withdrawalReason"><dt>撤销原因</dt><dd>{{ document.withdrawalReason }}</dd></template>
    </dl>
    <p class="caption">接受录用意向不等于确认就业协议。本页不是劳动合同或电子签凭证。</p>
    <AppButton class="no-print" variant="secondary" @click="printDocument">打印文书</AppButton>
  </section>
</template>
<style scoped>
.offer-document { margin: 20px 0; border: 1px solid var(--border); border-radius: var(--r-control); padding: 20px; min-width: 0; background: var(--surface); box-shadow: var(--sh-1); }
header { padding-bottom: 16px; border-bottom: 2px solid var(--border-control); }
header, header > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
h3 { font-size: 17px; } header span { color: var(--text-2); font-size: 13px; }
dl { display: grid; grid-template-columns: 88px minmax(0,1fr); gap: 10px 14px; font-size: 14px; margin: 20px 0; }
dt { color: var(--text-2); } dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.caption { font-size: 12px; color: var(--text-2); margin-bottom: 16px; }
@media (max-width: 480px) { .offer-document { padding: 16px; } dl { grid-template-columns: 1fr; gap: 6px; } dd { margin-bottom: 10px; } }
@media print { .offer-document { background: white; box-shadow: none; } }
</style>
