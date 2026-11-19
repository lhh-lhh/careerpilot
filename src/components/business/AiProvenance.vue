<script setup lang="ts">
import type {AiProvenance} from '../../types/ai-workbench';
defineProps<{value?:AiProvenance;historical?:boolean}>();
</script>
<template>
 <details v-if="value" class="ai-provenance"><summary>DeepSeek · {{ historical?'上次生成':'生成于' }} {{ new Date(value.createdAt).toLocaleString() }}</summary><dl><dt>模型</dt><dd>{{ value.model }}</dd><dt>本地请求标识</dt><dd>{{ value.traceId }}</dd><template v-if="value.upstreamRequestId"><dt>上游请求标识</dt><dd>{{ value.upstreamRequestId }}</dd></template><template v-if="value.usage"><dt>用量（输入 / 输出）</dt><dd>{{ value.usage.prompt }} / {{ value.usage.completion }} tokens</dd></template></dl><p>调用来源可追溯不代表内容必然正确，请核对事实。</p></details>
</template>
<style scoped>
.ai-provenance{margin:14px 0;color:var(--text-2);font-size:12px;line-height:1.8;overflow-wrap:anywhere}.ai-provenance summary{cursor:pointer;color:var(--brand-text)}dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px 14px}dd{margin:0}p{margin-bottom:0}@media(max-width:500px){dl{grid-template-columns:1fr;gap:2px}dd{margin-bottom:6px}}
</style>
