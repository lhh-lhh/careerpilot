<script setup lang="ts">
import { ref, watch } from "vue";
import AppModal from "../base/AppModal.vue";
import AppButton from "../base/AppButton.vue";
const props = defineProps<{ open: boolean; preview: string }>();
defineEmits<{ close: []; confirm: [] }>();
const confirmed = ref(false);
watch(() => props.open, () => { confirmed.value = false; });
</script>
<template>
  <AppModal data-scene="studio" :open="open" title="确认本次脱敏外发" @close="$emit('close')">
    <div class="consent-copy"><p>以下是本次发送到 DeepSeek 的最小业务数据。不会发送附件或完整简历；仍请核对描述中是否包含敏感信息。你可以取消并使用离线回放。</p>
    <pre>{{ preview }}</pre>
    <label><input v-model="confirmed" type="checkbox" />我已核对本次脱敏内容，同意外发并理解可能产生费用</label></div>
    <template #footer><AppButton variant="secondary" @click="$emit('close')">取消</AppButton><AppButton :disabled="!confirmed" @click="$emit('confirm')">确认发送本次请求</AppButton></template>
  </AppModal>
</template>
<style scoped>
.consent-copy{display:grid;gap:20px;font-size:14px;line-height:1.7}.consent-copy pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:300px;overflow:auto;padding:16px;background:var(--surface-2);border-radius:var(--r-control);font-size:12px}.consent-copy label{display:flex;gap:12px;align-items:flex-start}.consent-copy input{margin-top:5px}
</style>
