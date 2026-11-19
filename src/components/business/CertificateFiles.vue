<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { appRepository } from "../../services/app-services";
import { useSessionStore } from "../../stores/session";
import AppButton from "../base/AppButton.vue";
import AppModal from "../base/AppModal.vue";
import PdfPreview from "./PdfPreview.vue";
const props = defineProps<{ ids: string[]; editable?: boolean }>(),
  emit = defineEmits<{ remove: [id: string] }>(),
  session = useSessionStore();
type FilePreview = { name: string; url: string; type: string; blob: Blob };
const files = ref<Record<string, FilePreview>>({}),
  notice = ref(""),
  selected = ref(""),
  previewFailed = ref(false);
const preview = computed(() => files.value[selected.value]);
let generation = 0;
function clear() {
  generation++;
  selected.value = "";
  for (const file of Object.values(files.value)) URL.revokeObjectURL(file.url);
  files.value = {};
}
watch(
  () => [props.ids.slice(), session.actor?.userId, session.epoch],
  async () => {
    clear();
    notice.value = "";
    const current = generation,
      actor = session.actor,
      epoch = session.epoch;
    if (!actor) return;
    for (const id of props.ids)
      try {
        const file = await appRepository.readAttachment(actor, id);
        if (current !== generation || epoch !== session.epoch) return;
        files.value = {
          ...files.value,
          [id]: {
            name: file.fileName,
            url: URL.createObjectURL(file.blob),
            type: file.blob.type,
            blob: file.blob,
          },
        };
      } catch {
        if (current === generation)
          notice.value = "部分附件暂不可读取，请核对权限或重新上传。";
      }
  },
  { immediate: true, deep: true },
);
onBeforeUnmount(clear);
async function download(id: string) {
  const actor = session.actor,
    epoch = session.epoch;
  if (!actor) return;
  try {
    const file = await appRepository.readAttachment(actor, id);
    if (epoch !== session.epoch || actor.userId !== session.actor?.userId)
      return;
    const url = URL.createObjectURL(file.blob),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    notice.value = "文件未下载，请检查权限或连接后重试。";
  }
}
function open(id: string) {
  selected.value = id;
  previewFailed.value = false;
}
</script>
<template>
  <ul class="certificate-files">
    <li v-for="(id, i) in ids" :key="id">
      <button
        v-if="files[id]"
        class="file-preview"
        :aria-label="`预览 ${files[id]!.name}`"
        @click="open(id)"
      >
        <img
          v-if="files[id]!.type.startsWith('image/')"
          :src="files[id]!.url"
          alt=""
          loading="lazy"
        /><span v-else class="pdf-tile">PDF</span
        ><span>{{ files[id]!.name }}<small>点击预览</small></span>
      </button>
      <span v-else>证书文件 {{ i + 1 }} · 等待读取</span>
      <AppButton
        variant="ghost"
        size="sm"
        :aria-label="`下载 ${files[id]?.name ?? `证书文件${i + 1}`}`"
        @click="download(id)"
        >下载 {{ files[id]?.name ?? `证书文件${i + 1}` }}</AppButton
      >
      <AppButton
        v-if="editable"
        variant="ghost"
        size="sm"
        :aria-label="`移除附件引用 ${files[id]?.name ?? i + 1}`"
        @click="emit('remove', id)"
        >移除引用</AppButton
      >
    </li>
  </ul>
  <p v-if="notice" role="status">{{ notice }}</p>
  <AppModal data-scene="paper" :open="!!preview" title="证书文件预览" @close="selected = ''">
    <template v-if="preview"
      ><p class="preview-name">{{ preview.name }}</p>
      <img
        v-if="preview.type.startsWith('image/') && !previewFailed"
        class="certificate-image"
        :src="preview.url"
        :alt="preview.name"
        @error="previewFailed = true"
      />
      <PdfPreview
        v-else-if="preview.type === 'application/pdf' && !previewFailed"
        :key="selected"
        :blob="preview.blob"
      />
      <p v-if="previewFailed" role="alert">
        浏览器无法预览此文件，请下载后查看。
      </p>
      <AppButton variant="secondary" @click="download(selected)"
        >下载原文件</AppButton
      >
    </template>
  </AppModal>
</template>
<style scoped>
.certificate-files {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 12px;
}
.certificate-files li {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  min-width: 0;
}
.certificate-files button {
  overflow-wrap: anywhere;
  max-width: 100%;
}
.file-preview {
  display: flex;
  gap: 12px;
  align-items: center;
  text-align: left;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-1);
  padding: 8px;
  border-radius: 10px;
  font: 14px var(--font-body);
  cursor: pointer;
}
.file-preview img,
.pdf-tile {
  width: 64px;
  height: 64px;
  object-fit: contain;
  border-radius: 5px;
  background: #fff;
  flex-shrink: 0;
}
.pdf-tile {
  display: grid;
  place-items: center;
  color: #3454df;
  font-weight: 700;
}
.file-preview small {
  display: block;
  margin-top: 6px;
  color: var(--brand-text);
  font-size: 12px;
}
.preview-name {
  overflow-wrap: anywhere;
  margin-bottom: 16px;
}
.certificate-image {
  display: block;
  max-width: 100%;
  max-height: 60dvh;
  object-fit: contain;
  margin: 0 auto 16px;
}
</style>
