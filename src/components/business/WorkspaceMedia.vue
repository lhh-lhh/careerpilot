<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { api } from "../../adapters/repository/http";
import { onDomainChange } from "../../services/app-services";
import AppButton from "../base/AppButton.vue";
type Media = { revision: number; base64: string | null; mime: string };
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ saved: [src: string] }>();
const media = ref<Media>({ revision: 0, base64: null, mime: "image/jpeg" });
const selected = ref<File | null>(null), preview = ref(""), busy = ref(false), notice = ref("");
let baseRevision = 0;
const committedSrc = computed(() => media.value.base64 ? `data:${media.value.mime};base64,${media.value.base64}` : "");
async function load() {
  try { media.value = await api<Media>("/api/me/media"); emit("saved", committedSrc.value); }
  catch { notice.value = "图片暂时无法读取，请稍后重试。"; }
}
function clearPreview() { if (preview.value) URL.revokeObjectURL(preview.value); preview.value = ""; selected.value = null; }
function select(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = "";
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) { notice.value = "请选择不超过 2 MiB 的 JPG、PNG 或 WebP 图片。"; return; }
  clearPreview(); selected.value = file; baseRevision = media.value.revision;
  preview.value = URL.createObjectURL(file); notice.value = "当前为本地预览，保存后生效。";
}
async function save(remove = false) {
  if (busy.value || (!remove && !selected.value)) return;
  busy.value = true; notice.value = "";
  try {
    let base64: string | undefined;
    if (!remove && selected.value) base64 = await new Promise<string>((resolve, reject) => {
      const reader = new window.FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]!); reader.onerror = () => reject(Error("FILE_READ_FAILED")); reader.readAsDataURL(selected.value!);
    });
    media.value = await api<Media>("/api/me/media", remove ? { expectedRevision: media.value.revision, remove: true } : { expectedRevision: baseRevision, base64, mime: selected.value!.type });
    clearPreview(); emit("saved", committedSrc.value); notice.value = remove ? "已恢复默认形象。" : "图片已保存，仅本人工作区可见。";
  } catch (error) {
    notice.value = error instanceof Error && error.message === "REVISION_CONFLICT" ? "其他页面已更新图片，请重新选择后保存；当前预览仍保留。" : "图片未保存，请核对格式和连接后重试。";
    await load();
  } finally { busy.value = false; }
}
onMounted(load);
const unsubscribe = onDomainChange(() => void load());
onUnmounted(() => { unsubscribe(); clearPreview(); });
</script>
<template>
  <section v-show="props.open" class="workspace-media">
    <h3>工作区形象</h3>
    <p class="caption">仅本人可见，不随简历投递公开。图片居中裁切，保存时移除元数据。</p>
    <img v-if="preview || committedSrc" :src="preview || committedSrc" alt="工作区形象预览" width="128" height="128" />
    <div v-else class="media-default">默认形象</div>
    <label class="file-picker">选择图片<input type="file" accept="image/jpeg,image/png,image/webp" :disabled="busy" @change="select" /></label>
    <div class="media-actions"><AppButton :disabled="!selected" :loading="busy" @click="save(false)">保存图片</AppButton><AppButton v-if="selected" variant="secondary" @click="clearPreview">取消预览</AppButton><AppButton v-if="media.base64 && !selected" variant="secondary" :disabled="busy" @click="save(true)">恢复默认</AppButton></div>
    <p v-if="notice" role="status">{{ notice }}</p>
  </section>
</template>
<style scoped>
.workspace-media{display:grid;gap:18px;font-size:14px}.workspace-media h3{font-size:18px}.workspace-media img{object-fit:cover;border-radius:16px}.workspace-media .caption{line-height:1.8}.media-default{display:grid;place-items:center;width:128px;height:128px;background:var(--brand-soft);color:var(--brand-text);border-radius:16px}.file-picker{display:grid;gap:10px}.file-picker input{max-width:100%}.media-actions{display:flex;flex-wrap:wrap;gap:12px}
</style>
