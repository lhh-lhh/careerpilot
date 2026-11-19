<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import AppButton from "../base/AppButton.vue";

const props = defineProps<{ blob: Blob }>();
const canvas = ref<HTMLCanvasElement>(),
  page = ref(1),
  pages = ref(0),
  busy = ref(true),
  error = ref("");
let document: PDFDocumentProxy | undefined,
  loading: PDFDocumentLoadingTask | undefined,
  render: RenderTask | undefined,
  generation = 0;
function dispose() {
  generation++;
  render?.cancel();
  render = undefined;
  if (loading) void loading.destroy().catch(() => {});
  loading = undefined;
  document = undefined;
  if (canvas.value) canvas.value.width = canvas.value.height = 0;
}
async function showPage(number: number) {
  const current = generation,
    pdf = document;
  if (!pdf || busy.value || number < 1 || number > pdf.numPages) return;
  busy.value = true;
  error.value = "";
  try {
    const sheet = await pdf.getPage(number);
    if (current !== generation) return;
    const base = sheet.getViewport({ scale: 1 });
    const viewport = sheet.getViewport({
      scale: Math.min(
        1.5,
        1400 / base.width,
        Math.sqrt(2_000_000 / (base.width * base.height)),
      ),
    });
    const target = canvas.value;
    if (!target) return;
    target.width = Math.ceil(viewport.width);
    target.height = Math.ceil(viewport.height);
    render = sheet.render({ canvas: target, viewport });
    await render.promise;
    if (current !== generation) return;
    page.value = number;
    sheet.cleanup();
  } catch {
    if (current === generation)
      error.value = "此PDF无法预览，请下载原文件查看。";
  } finally {
    if (current === generation) busy.value = false;
  }
}
watch(
  () => props.blob,
  async (blob) => {
    dispose();
    const current = generation;
    page.value = 1;
    pages.value = 0;
    busy.value = true;
    error.value = "";
    try {
      const pdfjs = await import("pdfjs-dist");
      const data = new Uint8Array(await blob.arrayBuffer());
      if (current !== generation) return;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      loading = pdfjs.getDocument({
        data,
        useWasm: false,
        useSystemFonts: true,
        maxImageSize: 16_000_000,
      });
      const pdf = await loading.promise;
      if (current !== generation) return;
      document = pdf;
      pages.value = pdf.numPages;
      busy.value = false;
      await nextTick();
      await showPage(1);
    } catch {
      if (current === generation) {
        busy.value = false;
        error.value = "此PDF无法预览（可能损坏或加密），请下载原文件查看。";
      }
    }
  },
  { immediate: true },
);
onBeforeUnmount(dispose);
</script>
<template>
  <section class="pdf-preview" aria-label="PDF文件预览" :aria-busy="busy">
    <p v-if="busy" role="status">正在本机渲染PDF…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <canvas
      v-show="!error"
      ref="canvas"
      role="img"
      :aria-label="`PDF第${page}页`"
    />
    <nav v-if="pages > 0" aria-label="PDF翻页">
      <AppButton
        variant="secondary"
        size="sm"
        :disabled="busy || page <= 1"
        @click="showPage(page - 1)"
        >上一页</AppButton
      >
      <span>{{ page }} / {{ pages }} 页</span>
      <AppButton
        variant="secondary"
        size="sm"
        :disabled="busy || page >= pages"
        @click="showPage(page + 1)"
        >下一页</AppButton
      >
    </nav>
    <p class="pdf-help">
      仅在本机渲染，不执行PDF内的脚本或外部链接。可下载原文件查看。
    </p>
  </section>
</template>
<style scoped>
.pdf-preview {
  min-width: 0;
}
canvas {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
  background: #fff;
}
nav {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: center;
  margin-top: 12px;
}
.pdf-help {
  margin: 16px 0;
  color: var(--text-2);
  font-size: 12px;
}
</style>
