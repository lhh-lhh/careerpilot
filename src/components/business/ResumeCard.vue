<script setup lang="ts">
import { computed, ref } from "vue";
import type { ResumeSections } from "../../types/entities";
import {
  renderResumePages,
  canExportResume,
} from "../../domain/resume/presentation";
import { resumePdf } from "../../services/resume-pdf";
import { useSessionStore } from "../../stores/session";
import AppButton from "../base/AppButton.vue";
const props = withDefaults(
  defineProps<{
    sections: ResumeSections;
    label: (id: string) => string;
    targetTitle?: string;
    exportable?: boolean;
  }>(),
  { targetTitle: "", exportable: true },
);
const session = useSessionStore(),
  busy = ref(false),
  notice = ref("");
const pages = computed(() =>
  renderResumePages(props.sections, props.label, props.targetTitle),
);
async function download() {
  if (busy.value || !props.exportable || !canExportResume(props.sections))
    return;
  const owner = session.actor?.userId,
    epoch = session.epoch,
    captured = pages.value.slice(),
    name = props.sections.basic.name;
  busy.value = true;
  notice.value = "正在生成PDF，所有内容仅在本机处理…";
  try {
    const blob = await resumePdf(captured);
    if (session.actor?.userId !== owner || session.epoch !== epoch) return;
    const url = URL.createObjectURL(blob),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name.replace(/[\\/:*?"<>|]/g, "_")}-求职简历.pdf`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice.value = "PDF已生成。可上传至招聘平台；文件含个人资料，请妥善保管。";
  } catch {
    notice.value = "PDF导出失败，当前简历未改动，请重试。";
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section class="resume-card-view" role="region" aria-label="精致简历卡片">
    <div v-if="exportable" class="resume-card-actions no-print">
      <AppButton
        :loading="busy"
        :disabled="!exportable || !canExportResume(sections)"
        @click="download"
        >一键导出PDF</AppButton
      >
      <p>
        本机生成A4高清图片式PDF，长简历自动分页，不额外调用AI；文字不可选取，外站自动解析兼容性请自行核对。
      </p>
    </div>
    <p v-if="!canExportResume(sections)" class="business-notice">
      请先填写姓名和完整教育经历并保存，再导出用于投递。
    </p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <!-- SVG is generated only by renderResumePages; all user text is XML escaped. -->
    <!-- eslint-disable vue/no-v-html -->
    <div
      v-for="(page, i) in pages"
      :key="i"
      class="resume-sheet"
      v-html="page"
    ></div>
    <!-- eslint-enable vue/no-v-html -->
  </section>
</template>
<style scoped>
.resume-card-view {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  background: var(--surface-2);
}
.resume-card-actions {
  display: flex;
  align-items: center;
  gap: 20px;
  margin: 0 0 20px;
  flex-wrap: wrap;
}
.resume-card-actions p {
  font-size: 13px;
  color: var(--text-2);
}
.resume-sheet {
  max-width: 794px;
  margin: 0 auto 24px;
  box-shadow: 0 8px 32px #1f32671a;
  background: #fff;
}
.resume-sheet :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}
.resume-card-view > p {
  margin: 12px 0;
  font-size: 13px;
}
@media print {
  .resume-card-view { padding: 0; border: 0; background: white; }
  .resume-sheet {
    box-shadow: none;
    break-after: page;
  }
}
</style>
