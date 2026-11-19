<script setup lang="ts">
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import { computed } from "vue";
import { useStudentData } from "../../composables/useStudentData";
import ResumeCard from "../../components/business/ResumeCard.vue";
const { data, catalog, loading, error } = useStudentData(),
  resume = computed(() => data.value?.resumes[0]);
const label = (id: string) =>
  catalog.value?.skills.find((s) => s.id === id)?.canonical ??
  catalog.value?.dictionaries.find((d) => d.id === id)?.label ??
  id;
</script>
<template>
  <main id="main-content" class="business-page resume-preview-page ui-scene ui-scene--paper">
    <WorkbenchHeader>
      <template #heading><div>
        <h1>你的经历，值得被认真看见。</h1>
        <p>
          预览最近保存的正式简历。站内投递使用相同版式，企业只看到本次授权的固定快照。
        </p>
      </div></template>
      <template #actions><RouterLink to="/student/resume" class="inline-link"
        >返回简历工作台</RouterLink
      ></template>
    </WorkbenchHeader>
    <p v-if="loading">正在读取正式简历…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <ResumeCard
      v-if="resume && catalog"
      :sections="resume.sections"
      :label="label"
    />
    <p class="caption">
      不自动补写未提供的照片、电话、性别、年龄或自我评价。PDF为高清图片式版式文件，不保证外站ATS自动解析；外站投递请自行上传，平台不会代你发送。
    </p>
  </main>
</template>
<style scoped>
.resume-preview-page {
  max-width: 1120px;
}
.caption {
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.8;
}
</style>
