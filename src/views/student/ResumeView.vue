<script setup lang="ts">
import WorkbenchGuide from "../../components/presentation/WorkbenchGuide.vue";
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import { computed, nextTick, ref, shallowRef, toRaw, watch } from "vue";
import { useRoute, useRouter } from 'vue-router';
import { useStudentData } from "../../composables/useStudentData";
import { useDraftRecovery } from "../../composables/useDraftRecovery";
import { isResumeDraft } from '../../services/draft-cache';
import { useBusinessAi } from "../../composables/useBusinessAi";
import { appRepository } from "../../services/app-services";
import {
  resumeRequestInput,
  type LocalAiMapping,
} from "../../services/ai-requests";
import { fixedClock } from "../../domain/clock";
import { businessNow, isOnline } from "../../services/runtime";
import { diagnose } from "../../domain/resume/diagnose";
import type { ResumeSections, ResumeVersion } from "../../types/entities";
import type { A1Variables, Suggestion } from "../../adapters/ai/types";
import { useSessionStore } from "../../stores/session";
import AppButton from "../../components/base/AppButton.vue";
import AppIcon from "../../components/base/AppIcon.vue";
import AppInput from "../../components/base/AppInput.vue";
import AppSelect from "../../components/base/AppSelect.vue";
import AppModal from "../../components/base/AppModal.vue";
import AppSkeleton from "../../components/base/AppSkeleton.vue";
import AiBlock from "../../components/base/AiBlock.vue";
import AiConsentDialog from "../../components/business/AiConsentDialog.vue";
import ScoreRing from "../../components/charts/ScoreRing.vue";
import CertificateFiles from '../../components/business/CertificateFiles.vue';
const { data, catalog, jobs, loading, error, load } = useStudentData(),
  session = useSessionStore(),
  ai = useBusinessAi();
const crypto = window.crypto;
const route=useRoute(),router=useRouter();
const suggestionsOpen=computed(()=>route.path.endsWith('/suggestions'));
const mobilePane=ref<'editor'|'suggestions'>('suggestions');
const advicePanel=ref<HTMLElement|null>(null);
async function switchPane(pane:'editor'|'suggestions'){
 mobilePane.value=pane;await nextTick();
 document.querySelector(pane==='suggestions'?'[aria-label="表达建议子页"]':'.resume-editor')?.scrollIntoView({block:'start'});
}
const uploadingCertificate=ref('');
async function uploadCertificate(cert:ResumeSections['certificates'][number],event:Event){
 const input=event.target as HTMLInputElement,file=input.files?.[0],actor=session.actor;if(!file||!actor||uploadingCertificate.value)return;
 if((cert.attachmentIds?.length??0)>=5){notice.value='每项证书最多5个附件。';input.value='';return;}
 uploadingCertificate.value=cert.id;
 try{const attachment=await appRepository.addAttachment(actor,{fileName:file.name,blob:file},fixedClock);const current=draft.value?.certificates.find(c=>c.id===cert.id);if(current&&session.actor?.userId===actor.userId){current.attachmentIds=[...(current.attachmentIds??[]),attachment.id];notice.value='证书文件已上传，引用与说明需点击保存新版本。';}}
 catch{notice.value='证书上传失败，仅支持2MiB以内PDF、PNG、JPEG；当前草稿保留。';}
 finally{uploadingCertificate.value='';input.value='';}
}
const resume = computed(() => data.value?.resumes[0]);
const draft = ref<ResumeSections | null>(null),
  draftRevision = ref(0),
  saved = ref(""),
  notice = ref(""),
  saving = ref(false),
  conflict = ref(false);
watch(resume, (r) => {
  if (r && (!draft.value || JSON.stringify(draft.value) === saved.value)) {
    draft.value = structuredClone(r.sections);
    saved.value = JSON.stringify(r.sections);
    draftRevision.value = r.revision;
  }
});
const dirty = computed(
  () => draft.value && JSON.stringify(draft.value) !== saved.value,
);
const recovery = useDraftRecovery<ResumeSections>("resume", () => resume.value && draft.value ? { entityId: resume.value.id, revision: draftRevision.value, value: draft.value } : null,
  () => !!dirty.value, (cached) => {
    if (cached.entityId !== resume.value?.id || !isResumeDraft(cached.value)) { notice.value = "草稿与当前简历不一致或已损坏，未恢复。"; return; }
    draftRevision.value = cached.revision;
    draft.value = structuredClone(cached.value);
    notice.value = "已恢复本标签页草稿，请核对后保存；它尚未同步到服务端。";
  });
const diagnosis = computed(() =>
  resume.value && catalog.value
    ? diagnose(resume.value, null, catalog.value.skills, businessNow())
    : null,
);
const sectionLabels: Record<string, string> = {
  basic: "基本信息",
  education: "教育背景",
  experience: "实习经历",
  projects: "项目经历",
  skills: "技能",
  certificates: "证书",
};
const strategy = ref<A1Variables["strategy"]>("structure"),
  keepTone = ref(false),
  target = ref("");
let mapping: LocalAiMapping | null = null,
  capturedDraft = "",
  sourceRevision = 0;
const decided = ref<Record<string, string>>({});
const suggestions = computed(() =>
  ai.response.value?.data.module === "A1"
    ? ai.response.value.data.suggestions
    : [],
);
const stale = computed(
  () =>
    !!ai.response.value &&
    (capturedDraft !== JSON.stringify(draft.value) ||
      sourceRevision !== resume.value?.revision),
);
async function save() {
  if (!resume.value || !draft.value || !session.actor) return;
  saving.value = true;
  notice.value = "";
  const submitted = structuredClone(toRaw(draft.value));
  try {
    const result = await appRepository.execute(
      {
        type: "SAVE_RESUME",
        commandId: crypto.randomUUID(),
        entityId: resume.value.id,
        expectedRevision: draftRevision.value,
        payload: { sections: submitted },
      },
      session.actor,
      fixedClock,
    );
    saved.value = JSON.stringify(submitted);
    draftRevision.value = (result as { revision: number }).revision;
    recovery.committed();
    conflict.value = false;
    notice.value = "已保存为新的简历版本。";
    await load();
  } catch (e) {
    conflict.value = true;
    notice.value =
      e instanceof Error && e.message.includes("REVISION")
        ? "其他页面已更新简历。草稿已保留，请重新读取后核对。"
        : "保存失败，请核对必填字段、日期和技能；草稿已保留。";
  } finally {
    saving.value = false;
  }
}
function reread() {
  if (resume.value) {
    draft.value = structuredClone(resume.value.sections);
    saved.value = JSON.stringify(draft.value);
    draftRevision.value = resume.value.revision;
    recovery.discard();
    conflict.value = false;
    ai.stop();
    notice.value = "已重新读取最新版本。";
  }
}
async function generate() {
  if (!resume.value || dirty.value) return;
  if(!suggestionsOpen.value)await router.push('/student/resume/suggestions');
  mobilePane.value='suggestions';
  await nextTick();
  // Wait for the router's scroll reset before moving to the visible side-by-side result.
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  advicePanel.value?.focus({preventScroll:true});
  advicePanel.value?.scrollIntoView({block:'start'});
  const input = resumeRequestInput(
    resume.value,
    jobs.value.find((j) => j.id === target.value) ?? null,
    strategy.value,
    keepTone.value,
  );
  mapping = input.local;
  capturedDraft = JSON.stringify(draft.value);
  sourceRevision = resume.value.revision;
  decided.value = {};
  await ai.generate("A1", "rewrite", input);
}
function localRow(s: Suggestion) {
  const path = mapping?.fields[s.fieldPath],
    parts = path?.split(".");
  if (!parts || !resume.value) return null;
  return (
    resume.value.sections[parts[0] as "experience" | "projects"].find(
      (r) => r.id === parts[1],
    ) ?? null
  );
}
function canAccept(s: Suggestion) {
  return (
    !stale.value &&
    !dirty.value &&
    !s.requiresUserInput &&
    !decided.value[s.id] &&
    localRow(s)?.description === s.before
  );
}
async function decide(s: Suggestion, disposition: "accepted" | "rejected") {
  if (!resume.value || !mapping || !session.actor) return;
  try {
    await appRepository.execute(
      {
        type: "DECIDE_SUGGESTION",
        commandId: crypto.randomUUID(),
        entityId: resume.value.id,
        expectedRevision: sourceRevision,
        payload: {
          traceId: ai.response.value!.traceId,
          suggestionId: s.id,
          sourceResumeVersionId: mapping.resumeVersionId!,
          disposition,
          fieldPath: mapping.fields[s.fieldPath]!,
          before: s.before,
          after: s.after,
          requiresUserInput: s.requiresUserInput,
          evidence: s.evidence.map(({ start, end, quote }) => ({
            start,
            end,
            quote,
          })),
        },
      },
      session.actor,
      fixedClock,
    );
    decided.value = { ...decided.value, [s.id]: disposition };
    await load();
    if (disposition === "accepted") {
      draft.value = structuredClone(resume.value!.sections);
      saved.value = JSON.stringify(draft.value);
      draftRevision.value = resume.value!.revision;
    }
    notice.value =
      disposition === "accepted"
        ? "已采纳并创建新版本，其他建议请重新生成。"
        : "已驳回，原文保持不变。";
  } catch {
    notice.value = "建议已过期或需要补充事实，未覆盖原文。请重新生成。";
  }
}
const history = shallowRef<ResumeVersion[]>([]),
  historyOpen = ref(false);
async function showHistory() {
  if (!resume.value || !session.actor) return;
  history.value = await appRepository.readResumeHistory(
    session.actor,
    resume.value.studentId,
  );
  historyOpen.value = true;
}
const print = () => window.print();
</script>
<template>
  <main id="main-content" class="business-page resume-page ui-scene ui-scene--paper" :class="{ 'feature-suggestions': suggestionsOpen }">
    <WorkbenchHeader>
      <template #heading="{design}"><div>
        <p class="kicker">{{ design.title }} · CAREER JOURNEY</p>
        <h1>{{ design.headline }}</h1>
        <p>{{ design.desc }}</p>
      </div></template>
      <template #actions><div class="page-actions">
        <RouterLink to="/student/resume/preview" class="inline-link">预览与导出简历</RouterLink>
        <span v-if="dirty" class="caption">预览/导出使用已保存版本，请先保存修改。</span>
        <RouterLink v-if="isOnline" to="/student/resume/optimize" class="inline-link">AI优化/润色</RouterLink>
        <RouterLink v-if="isOnline" to="/student/resume/import" class="inline-link">识别PDF / 图片文字</RouterLink>
        <AppButton variant="secondary" @click="showHistory">版本对比</AppButton
        ><AppButton variant="secondary" @click="print">打印简历</AppButton
        ><AppButton :loading="saving" :disabled="!dirty" @click="save"
          >保存新版本</AppButton
        >
      </div></template>
    </WorkbenchHeader>
    <p
      v-if="notice"
      class="business-notice"
      :class="{ 'business-error': conflict }"
      role="status"
    >
      {{ notice
      }}<AppButton v-if="conflict" variant="secondary" @click="reread"
        >丢弃草稿并重新读取</AppButton
      >
    </p>
    <p v-if="error" class="business-notice business-error" role="alert">
      {{ error }}
    </p>
    <AppSkeleton v-else-if="loading" />
    <section v-if="recovery.pending.value && !loading" class="business-notice no-print" aria-label="未保存草稿恢复">
      <p>发现本标签页未保存的简历草稿。</p><div class="page-actions"><AppButton size="sm" @click="recovery.restore">恢复草稿</AppButton><AppButton size="sm" variant="ghost" @click="recovery.discard">丢弃缓存草稿</AppButton></div>
    </section>
    <p v-if="recovery.warning.value" role="alert">{{ recovery.warning.value }}</p>
    <nav v-if="suggestionsOpen" class="advice-tabs" aria-label="简历与建议切换"><AppButton variant="secondary" :aria-pressed="mobilePane==='editor'" @click="switchPane('editor')">编辑主页面</AppButton><AppButton variant="secondary" :aria-pressed="mobilePane==='suggestions'" @click="switchPane('suggestions')">表达建议子页</AppButton><RouterLink to="/student/resume" class="inline-link">收起建议子页</RouterLink></nav>
    <div v-if="!loading && draft && resume && diagnosis" :class="['resume-layout',{'suggestions-open':suggestionsOpen,'mobile-advice':mobilePane==='suggestions'}]">
      <nav aria-label="简历段落" class="section-nav no-print">
        <a
          v-for="(name, key) in sectionLabels"
          :key="key"
          :href="`#resume-${key}`"
          @click.prevent="
            ($event.currentTarget as HTMLAnchorElement).ownerDocument
              .getElementById(`resume-${key}`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          "
          >{{ name }}</a
        >
        <p>
          版本 {{ resume.versionIds.length }}<br />{{
            dirty ? "草稿未保存" : isOnline ? "已保存到服务端" : "已保存到本机"
          }}
        </p>
      </nav>
      <div class="resume-editor">
        <section id="resume-basic" class="editor-section">
          <h2>基本信息</h2>
          <div class="field-grid">
            <AppInput v-model="draft.basic.name" label="姓名" /><AppInput
              v-model="draft.basic.email"
              label="联系邮箱"
              type="email"
            /><AppSelect
              :model-value="draft.basic.majorId ?? ''"
              label="专业"
              :options="
                catalog!.dictionaries
                  .filter((d) => d.kind === 'major')
                  .map((d) => ({ value: d.id, label: d.label }))
              "
              @update:model-value="draft.basic.majorId = $event"
            /><AppSelect
              :model-value="draft.basic.degree ?? ''"
              label="学历"
              :options="
                catalog!.dictionaries
                  .filter((d) => d.kind === 'degree')
                  .map((d) => ({ value: d.code, label: d.label }))
              "
              @update:model-value="draft.basic.degree = $event"
            />
          </div>
        </section>
        <section id="resume-education" class="editor-section">
          <div class="section-heading"><h2>教育背景</h2><AppButton variant="ghost" size="sm" @click="draft.education.push({ id: crypto.randomUUID(), school: '', majorId: draft.basic.majorId ?? '', degree: draft.basic.degree ?? '', startDate: '', endDate: null })">添加教育经历</AppButton></div>
          <div v-for="row in draft.education" :key="row.id" class="entry">
            <div class="field-grid">
              <AppSelect v-model="row.majorId" label="教育专业" :options="catalog!.dictionaries.filter(d => d.kind === 'major').map(d => ({value:d.id,label:d.label}))" />
              <AppSelect v-model="row.degree" label="教育学历" :options="[{value:'',label:'请选择学历'},...catalog!.dictionaries.filter(d => d.kind === 'degree').map(d => ({value:d.code,label:d.label}))]" />
              <AppInput v-model="row.school" label="学校" /><AppInput
                v-model="row.startDate"
                label="入学日期"
                type="date"
              /><AppInput
                :model-value="row.endDate ?? ''"
                label="毕业日期"
                type="date"
                @update:model-value="row.endDate = $event || null"
              />
            </div>
            <AppButton variant="ghost" size="sm" @click="draft.education.splice(draft.education.indexOf(row),1)">移除此教育经历</AppButton>
          </div>
        </section>
        <section id="resume-experience" class="editor-section">
          <div class="section-heading">
            <h2>实习经历</h2>
            <AppButton
              variant="ghost"
              size="sm"
              @click="
                draft.experience.push({
                  id: crypto.randomUUID(),
                  company: '',
                  title: '',
                  startDate: '2025-07-01',
                  endDate: '2025-09-01',
                  description: '',
                })
              "
              >添加经历</AppButton
            >
          </div>
          <div v-for="(row, i) in draft.experience" :key="row.id" class="entry">
            <div class="field-grid">
              <AppInput v-model="row.company" label="机构名称" /><AppInput
                v-model="row.title"
                label="承担角色"
              /><AppInput
                v-model="row.startDate"
                label="开始日期"
                type="date"
              /><AppInput
                :model-value="row.endDate ?? ''"
                label="结束日期"
                type="date"
                @update:model-value="row.endDate = $event || null"
              />
            </div>
            <label class="form-label"
              >实习描述 {{ i + 1
              }}<textarea v-model="row.description" maxlength="4000" /></label
            ><AppButton
              variant="ghost"
              size="sm"
              @click="draft.experience.splice(i, 1)"
              >移除此经历</AppButton
            >
          </div>
        </section>
        <section id="resume-projects" class="editor-section">
          <div class="section-heading">
            <h2>项目经历</h2>
            <AppButton
              variant="ghost"
              size="sm"
              @click="
                draft.projects.push({
                  id: crypto.randomUUID(),
                  name: '',
                  role: '',
                  startDate: '2025-01-01',
                  endDate: '2025-06-01',
                  description: '',
                })
              "
              >添加项目</AppButton
            >
          </div>
          <div v-for="(row, i) in draft.projects" :key="row.id" class="entry">
            <div class="field-grid">
              <AppInput v-model="row.name" label="项目名称" /><AppInput
                v-model="row.role"
                label="项目角色"
              /><AppInput
                v-model="row.startDate"
                label="项目开始"
                type="date"
              /><AppInput
                :model-value="row.endDate ?? ''"
                label="项目结束"
                type="date"
                @update:model-value="row.endDate = $event || null"
              />
            </div>
            <label class="form-label"
              >项目描述 {{ i + 1
              }}<textarea v-model="row.description" maxlength="4000" />
            </label>
          </div>
        </section>
        <section id="resume-skills" class="editor-section">
          <h2>技能标签</h2>
          <div class="skill-checks">
            <label v-for="skill in catalog!.skills" :key="skill.id"
              ><input
                type="checkbox"
                :checked="draft.skills.some((s) => s.skillId === skill.id)"
                @change="
                  draft.skills = draft.skills.some(
                    (s) => s.skillId === skill.id,
                  )
                    ? draft.skills.filter((s) => s.skillId !== skill.id)
                    : [
                        ...draft.skills,
                        { id: crypto.randomUUID(), skillId: skill.id },
                      ]
                "
              />{{ skill.canonical }}</label
            >
          </div>
        </section>
        <section id="resume-certificates" class="editor-section">
          <div class="section-heading"><h2>证书</h2><AppButton variant="ghost" size="sm" @click="draft.certificates.push({id:crypto.randomUUID(),name:'',issuer:'',awardedAt:'',description:'',attachmentIds:[]})">添加证书</AppButton></div>
          <p class="caption">仅上传本人真实证书。支持PDF、PNG、JPEG，每文件不超过2MiB，每项最多5个文件；保存后随投递快照提供给接收企业。</p>
          <div v-for="cert in draft.certificates" :key="cert.id" class="entry">
            <AppInput v-model="cert.name" label="证书名称" />
            <div class="field-grid">
              <AppInput v-model="cert.issuer" label="颁发机构" /><AppInput
                v-model="cert.awardedAt"
                label="获得日期"
                type="date"
              />
            </div>
            <label class="form-label">证书说明<textarea v-model="cert.description" maxlength="2000" rows="3" placeholder="说明证书内容、成绩或与岗位相关的能力，不编造事实。" /></label>
            <label class="form-label">上传证书文件<input type="file" accept="application/pdf,image/png,image/jpeg" :disabled="!!uploadingCertificate" @change="uploadCertificate(cert,$event)" /></label>
            <p v-if="uploadingCertificate===cert.id" role="status">正在上传…</p>
            <CertificateFiles :ids="cert.attachmentIds??[]" editable @remove="cert.attachmentIds=cert.attachmentIds?.filter(id=>id!==$event)" />
            <AppButton variant="ghost" size="sm" @click="draft.certificates.splice(draft.certificates.indexOf(cert),1)">移除此证书</AppButton>
          </div>
        </section>
      </div>
      <aside class="diagnosis-rail">
        <WorkbenchGuide :title="suggestionsOpen ? '你的经历，仍由你做主。' : '每一次编辑，都有依据。'" :copy="suggestionsOpen ? '建议、原文、采纳状态与版本条件分别可见。完整简历编辑区仍保留在下方，修改后请先保存再生成。' : '表单仍是主角。请如实完善全部经历，保存后查看六项完整度，再按需采纳表达建议。'" />
        <section class="surface">
          <div class="section-heading">
            <h2>简历体检</h2>
            <AppIcon name="chart" />
          </div>
          <div class="diagnosis-score">
            <ScoreRing :value="diagnosis.total" />
            <p>
              六项完整度<br /><span class="caption"
                >本地算法 1.0 · 非录用评价</span
              >
            </p>
          </div>
          <div
            v-for="d in diagnosis.dimensions"
            :key="d.key"
            class="diagnosis-dimension"
          >
            <span>{{ sectionLabels[d.key] }}</span><progress
              :value="d.score"
              max="100"
            /><strong>{{ d.score }}</strong>
          </div>
          <p v-if="dirty" class="caption">
            体检显示最近保存版本；保存后重新计算。
          </p>
        </section>
        <section class="surface no-print form-stack">
          <h2>表达建议</h2>
          <AppSelect
            v-model="target"
            label="参考岗位（可选）"
            :options="[
              { value: '', label: '不关联岗位' },
              ...jobs.map((j) => ({ value: j.id, label: j.title })),
            ]"
          /><AppSelect
            v-model="strategy"
            label="改写策略"
            :options="[
              { value: 'structure', label: '梳理结构，不增加事实' },
              { value: 'concise', label: '精简表达' },
              { value: 'evidencePrompt', label: '提示补充真实依据' },
            ]"
          /><label class="tone"
            ><input v-model="keepTone" type="checkbox" />保留我的原有语气</label
          ><AppButton :disabled="!!dirty || ai.busy.value" @click="generate"
            >生成表达建议</AppButton
          ><AppButton v-if="ai.busy.value" variant="secondary" @click="ai.stop"
            >停止生成</AppButton
          >
          <p class="caption">
            只发送经历描述与可选岗位要求，点击生成即按默认授权外发，可能产生费用；可在顶部关闭AI。
          </p>
          <p v-if="dirty" class="caption">请先保存草稿，再生成可采纳的建议。</p>
        </section>
      </aside>
      <section
        v-if="suggestionsOpen"
        ref="advicePanel"
        role="region"
        aria-label="表达建议子页"
        tabindex="-1"
        class="diff-area"
      >
        <p class="caption">表达建议子页 · 原文保留，逐条确认后采纳</p>
        <h2>改写对照</h2>
        <p v-if="!ai.busy.value&&!ai.response.value&&!ai.error.value" class="business-notice">尚无建议。先保存简历，再点击“生成表达建议”。刷新页面不会自动重新调用AI。</p>
        <p v-if="stale" class="business-notice">
          草稿已变化，请保存后重新生成建议。
        </p>
        <p v-if="ai.error.value" role="alert">{{ ai.error.value }}</p>
        <p v-if="ai.busy.value" aria-live="polite">
          {{ ai.text.value || "正在核对表达与原文依据…" }}
        </p>
        <AiBlock
          v-if="ai.response.value"
          :mode="ai.response.value.effectiveMode"
          :origin="ai.response.value.origin"
          :provenance="ai.response.value.provenance"
          :trace-id="ai.response.value.traceId"
          :reason="ai.response.value.fallbackReason ?? undefined"
          ><p>
            {{
              ai.response.value.data.module === "A1"
                ? ai.response.value.data.summary
                : ""
            }}
          </p>
          <p v-if="!suggestions.length" class="business-notice">本次没有可逐条采纳的改写建议。可参考上方说明补充真实经历后再生成；原文未改动。</p>
          <article v-for="s in suggestions" :key="s.id" class="diff-card">
            <div class="diff-columns">
              <section>
                <h3>原文</h3>
                <p>{{ s.before }}</p>
              </section>
              <section>
                <h3>建议表达</h3>
                <p>{{ s.after }}</p>
              </section>
            </div>
            <p class="caption">{{ s.reason }}</p>
            <details>
              <summary>原文证据</summary>
              <blockquote v-for="e in s.evidence" :key="e.start">
                {{ e.quote }}
              </blockquote>
            </details>
            <p v-if="localRow(s)?.description !== s.before" class="caption">
              该段包含脱敏差异，请回到原文手工核对，不支持自动还原或采纳。
            </p>
            <div class="page-actions no-print">
              <AppButton
                :disabled="!canAccept(s)"
                @click="decide(s, 'accepted')"
                >采纳建议</AppButton
              ><AppButton
                variant="secondary"
                :disabled="stale || !!decided[s.id]"
                @click="decide(s, 'rejected')"
                >驳回建议</AppButton
              ><span class="caption">{{
                decided[s.id] === "accepted"
                  ? "已采纳"
                  : decided[s.id] === "rejected"
                    ? "已驳回"
                    : s.requiresUserInput
                      ? "需补充真实依据，暂不可采纳"
                      : ""
              }}</span>
            </div>
          </article>
          <template #evidence
            >建议仅依据当前保存的简历版本。字段、版本与引用不一致时禁止写入。</template
          ></AiBlock
        >
      </section>
    </div>
    <footer class="business-footer">
      请如实填写经历，原文与历史版本始终保留。
    </footer>
    <AppModal data-scene="paper"
      :open="historyOpen"
      title="简历版本对比"
      @close="historyOpen = false"
      ><div class="history-list">
        <section v-for="v in history" :key="v.id">
          <h3>
            版本 {{ v.number }} ·
            {{
              v.reason === "initial"
                ? "初始版本"
                : v.reason === "manual"
                  ? "手工保存"
                  : "采纳建议"
            }}
          </h3>
          <p v-for="p in v.snapshot.projects" :key="p.id">
            {{ p.name }}：{{ p.description }}
          </p>
        </section>
      </div></AppModal
    >
    <AiConsentDialog
      :open="ai.consentOpen.value"
      :preview="ai.preview.value"
      @close="ai.stop"
      @confirm="ai.confirm"
    />
  </main>
</template>
<style scoped>
.resume-layout {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr) 300px;
  gap: 24px;
  align-items: start;
}
.section-nav {
  position: sticky;
  top: 24px;
  display: grid;
  gap: 8px;
}
.section-nav a {
  padding: 12px;
  color: var(--text-2);
  font-size: 14px;
  border-left: 2px solid var(--border);
}
.section-nav a:hover {
  color: var(--brand-text);
  border-color: var(--brand-text);
  text-decoration: none;
}
.section-nav p {
  font-size: 12px;
  line-height: 2;
  color: var(--text-3);
  padding: 12px;
}
.resume-editor {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  padding: 32px;
}
.editor-section + .editor-section {
  margin-top: 32px;
  padding-top: 32px;
  border-top: 1px solid var(--border);
}
.editor-section > h2,
.editor-section .section-heading h2 {
  font-size: 20px;
  margin-bottom: 24px;
}
.entry {
  display: grid;
  gap: 20px;
}
.entry + .entry {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px dashed var(--border);
}
.skill-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.skill-checks label {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 14px;
}
.diagnosis-rail {
  display: grid;
  gap: 24px;
}
.diagnosis-rail h2 {
  font-size: 20px;
}
.diagnosis-score {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 24px 0;
}
.diagnosis-score p {
  font-size: 14px;
}
.diagnosis-score :deep(.score-ring) {
  width: 88px !important;
  height: 88px !important;
}
.diagnosis-dimension {
  display: grid;
  grid-template-columns: 64px 1fr 24px;
  gap: 12px;
  align-items: center;
  font-size: 12px;
  margin: 16px 0;
}
.diagnosis-dimension progress {
  width: 100%;
  height: 5px;
  accent-color: var(--brand-text);
}
.diagnosis-dimension strong {
  font: 12px var(--font-mono);
}
.tone {
  display: flex;
  gap: 12px;
  font-size: 14px;
}
.diff-area {
  grid-column: 2/-1;
  display: grid;
  gap: 20px;
}
.diff-area > h2 {
  font-size: 24px;
}
.advice-tabs{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 20px}.advice-tabs>button{display:none}
.resume-layout.suggestions-open{grid-template-columns:minmax(0,1fr) minmax(320px,.9fr)}
.suggestions-open .section-nav{display:none}
.suggestions-open .diagnosis-rail{grid-row:1;grid-column:1/-1;grid-template-columns:1fr 1fr}
.suggestions-open .resume-editor{grid-column:1;grid-row:2;min-width:0}
.suggestions-open .diff-area{grid-column:2;grid-row:2;position:sticky;top:24px;max-height:calc(100dvh - 48px);overflow:auto;background:var(--surface);border:1px solid var(--border);border-top:3px solid var(--brand-text);border-radius:var(--r-card);padding:24px;min-width:0;scroll-margin-top:24px}
.suggestions-open .diff-columns{grid-template-columns:1fr}.diff-card p{overflow-wrap:anywhere;white-space:pre-wrap}
.diff-card {
  margin-top: 24px;
  border-top: 1px solid var(--border);
  padding-top: 24px;
  display: grid;
  gap: 20px;
}
.diff-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.diff-columns section {
  background: var(--surface-2);
  padding: 20px;
  border-radius: var(--r-control);
}
.diff-columns section + section {
  background: var(--brand-soft);
}
.diff-columns h3 {
  font-size: 12px;
  color: var(--text-2);
  margin-bottom: 12px;
}
.diff-card blockquote {
  padding: 12px;
  border-left: 2px solid var(--ai);
  margin-top: 12px;
}
.history-list {
  display: grid;
  gap: 24px;
  font-size: 14px;
}
.history-list section {
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border);
}
.history-list p {
  margin-top: 12px;
  line-height: 1.8;
}
@media (max-width: 1350px) {
  .resume-layout {
    grid-template-columns: minmax(0, 1fr) 280px;
  }
  .section-nav {
    display: none;
  }
  .diff-area {
    grid-column: 1/-1;
  }
  .resume-editor {
    padding: 24px;
  }
}
@media (max-width: 950px) {
  .resume-layout {
    grid-template-columns: 1fr;
  }
  .diagnosis-rail {
    grid-row: 1;
    grid-template-columns: 1fr 1fr;
  }
  .diagnosis-rail .surface {
    padding: 20px;
  }
  .diff-area {
    grid-column: 1;
  }
  .resume-layout.suggestions-open{grid-template-columns:1fr}
  .suggestions-open .diagnosis-rail{grid-template-columns:1fr}
  .suggestions-open .diff-area{grid-column:1;position:static;max-height:none;grid-row:2}
  .suggestions-open .resume-editor{grid-row:2}
  .suggestions-open.mobile-advice .resume-editor{display:none}
  .suggestions-open:not(.mobile-advice) .diff-area{display:none}
  .advice-tabs>button{display:inline-flex}
}
@media (max-width: 767px) {
  .diagnosis-rail {
    grid-template-columns: 1fr;
  }
  .resume-editor {
    padding: 20px;
  }
  .diff-columns {
    grid-template-columns: 1fr;
  }
}
@media print {
  .resume-layout {
    display: block;
  }
  .diagnosis-rail {
    display: none;
  }
  .resume-editor {
    border: 0;
    padding: 0;
  }
  .diff-area {
    display: none;
  }
}
</style>
