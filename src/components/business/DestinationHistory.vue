<script setup lang="ts">
import { computed } from 'vue';
import type { AuditLog } from '../../types/entities';
const props = defineProps<{ logs: AuditLog[]; entityId: string }>();
const rows = computed(() => props.logs.filter(a => a.entityType === 'Destination' && a.entityId === props.entityId).sort((a,b) => a.sequence - b.sequence));
const labels: Record<string,string> = { CREATE: '建立去向草稿', EDIT: '修改材料', SUBMIT: '提交审核', REJECT: '退回补充', APPROVE: '审核通过', WITHDRAW: '撤回材料', REVOKE_APPROVAL: '撤销审批', REVOKE_AGREEMENT: '协议终止，重新核实' };
const date = (value: string) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
</script>
<template><details class="destination-history"><summary>历次办理记录</summary><ol aria-label="历次去向办理"><li v-for="row in rows" :key="row.id"><strong>{{ labels[row.action] ?? '去向更新' }}</strong><time>{{ date(row.at) }}</time><p v-if="row.reason">{{ row.reason }}</p></li></ol><p v-if="!rows.length">暂无办理记录。</p></details></template>
<style scoped>
.destination-history{margin:24px 0;font-size:13px;border:1px solid var(--border);border-radius:var(--r-control);background:var(--surface);overflow:hidden}
.destination-history summary{cursor:pointer;min-height:44px;padding:12px 16px;font-weight:600;background:var(--surface-2);color:var(--brand-text)}
.destination-history summary:hover{background:var(--brand-soft)}
.destination-history summary:focus-visible{outline:3px solid var(--focus-ring);outline-offset:-3px}
.destination-history ol{list-style:none;padding:0 16px;margin:0}
.destination-history li{padding:16px 0;border-top:1px solid var(--border);border-left:2px solid var(--border-control);padding-left:16px;margin-left:4px}
.destination-history time{display:block;color:var(--text-2);font-size:12px;margin-top:6px}
.destination-history p{margin-top:8px;white-space:pre-wrap;overflow-wrap:anywhere}
.destination-history>p{padding:16px;margin:0}
</style>
