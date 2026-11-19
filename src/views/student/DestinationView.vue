<script setup lang="ts">
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import { computed, reactive, ref, watch } from "vue";
import { useStudentData } from "../../composables/useStudentData";
import { useDraftRecovery } from "../../composables/useDraftRecovery";
import { isDestinationDraft } from '../../services/draft-cache';
import { appRepository } from "../../services/app-services";
import { useSessionStore } from "../../stores/session";
import { fixedClock } from "../../domain/clock";
import { isOnline } from "../../services/runtime";
import type { Destination } from "../../types/entities";
import AppButton from "../../components/base/AppButton.vue";
import AppIcon from "../../components/base/AppIcon.vue";
import AppSkeleton from "../../components/base/AppSkeleton.vue";
import AppTag from "../../components/base/AppTag.vue";
import EntityMark from "../../components/base/EntityMark.vue";
import DestinationHistory from '../../components/business/DestinationHistory.vue';

const session = useSessionStore();
const { data, catalog, attachments, loading, error, load, companyLabel } =
  useStudentData();
const notice = ref("");
const working = ref(false);
const uploading = ref(false);
const form = reactive({
  type: "employment" as Destination["type"],
  source: "external" as Destination["source"],
  applicationId: null as string | null,
  agreementId: null as string | null,
  organizationName: "",
  industryId: null as string | null,
  attachmentIds: [] as string[],
});
const destination = computed(() => data.value?.destinations[0] ?? null);
const agreements = computed(() => data.value?.agreements ?? []);
const signedAgreement = computed(() =>
  agreements.value.find((agreement) => agreement.status === "signed"),
);
const editable = computed(
  () =>
    !destination.value ||
    ["draft", "rejected"].includes(destination.value.status),
);
const organizationLabel = computed(() =>
  form.type === "furtherStudy"
    ? "升学单位"
    : form.type === "entrepreneurship"
      ? "创业项目或机构"
      : form.type === "flexible"
        ? "从业单位或项目"
        : "就业单位",
);
const statusLabels: Record<Destination["status"], string> = {
  draft: "草稿",
  submitted: "审核中",
  approved: "已通过",
  rejected: "需修改",
};
const typeLabels: Record<Destination["type"], string> = {
  employment: "签约就业",
  furtherStudy: "升学",
  entrepreneurship: "自主创业",
  flexible: "灵活就业",
  unemployed: "待就业",
};
const draftId = ref<string>(crypto.randomUUID());
const draftRevision = ref(0);
const saved = ref(JSON.stringify(form));
const dirty = computed(() => JSON.stringify(form) !== saved.value);
const recovery = useDraftRecovery<typeof form>("destination", () => ({ entityId: draftId.value, revision: draftRevision.value, value: form }),
  () => dirty.value, (cached) => {
    if (!editable.value || !isDestinationDraft(cached.value)) { notice.value = "当前去向不可编辑或草稿已损坏，未恢复旧草稿。"; return; }
    draftId.value = cached.entityId; draftRevision.value = cached.revision;
    Object.assign(form, cached.value);
    notice.value = "已恢复本标签页草稿，请核对后保存；它尚未同步到服务端。";
  });
function reread(discardCache = true) {
  const current = destination.value;
  if (!current) return;
  Object.assign(form, {
    type: current.type, source: current.source,
    applicationId: current.applicationId, agreementId: current.agreementId,
    organizationName: current.organizationName ?? "", industryId: current.industryId,
    attachmentIds: [...current.attachmentIds],
  });
  draftId.value = current.id;
  draftRevision.value = current.revision;
  saved.value = JSON.stringify(form);
  if (discardCache) recovery.discard();
}
watch(
  () =>
    destination.value
      ? `${destination.value.id}:${destination.value.revision}`
      : "new",
  () => { if (!dirty.value && !working.value) reread(false); },
  { immediate: true },
);

function applyTypeRules() {
  if (form.type === "employment") {
    const agreement = signedAgreement.value;
    if (agreement) {
      form.source = "internal";
      form.applicationId = agreement.applicationId;
      form.agreementId = agreement.id;
      form.organizationName = companyLabel(agreement.companyId);
      form.industryId =
        catalog.value?.companies.find(
          (company) => company.id === agreement.companyId,
        )?.industryId ?? null;
    } else {
      form.source = "external";
      form.applicationId = null;
      form.agreementId = null;
    }
    return;
  }
  form.source = "independent";
  form.applicationId = null;
  form.agreementId = null;
  form.industryId = null;
  if (form.type === "unemployed") form.organizationName = "";
}

async function uploadProof(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !session.actor) return;
  uploading.value = true;
  notice.value = "";
  try {
    const attachment = await appRepository.addAttachment(
      session.actor,
      { fileName: file.name, blob: file },
      fixedClock,
    );
    if (!form.attachmentIds.includes(attachment.id))
      form.attachmentIds.push(attachment.id);
    await load();
    notice.value = "证明材料已上传，请保存草稿以关联去向。";
  } catch {
    notice.value = "材料未添加；仅支持2MiB以内的PDF、PNG或JPEG文件。";
  } finally {
    uploading.value = false;
    input.value = "";
  }
}

async function saveDraft() {
  if (!session.actor || !data.value?.students[0]) return;
  working.value = true;
  notice.value = "";
  const submitted = JSON.stringify(form);
  const draft = JSON.parse(submitted) as typeof form;
  try {
    const result = await appRepository.execute(
      {
        type: "SAVE_DESTINATION",
        commandId: crypto.randomUUID(),
        entityId: draftId.value,
        expectedRevision: draftRevision.value,
        payload: {
          studentId: data.value.students[0].id,
          type: draft.type,
          source: draft.source,
          applicationId: draft.applicationId,
          agreementId: draft.agreementId,
          organizationName:
            draft.type === "unemployed"
              ? null
              : draft.organizationName.trim() || null,
          industryId: draft.type === "furtherStudy" ? null : draft.industryId,
          attachmentIds: [...new Set(draft.attachmentIds)],
        },
      },
      session.actor,
      fixedClock,
    );
    saved.value = submitted;
    draftRevision.value = (result as { revision: number }).revision;
    recovery.committed();
    await load();
    notice.value = "草稿已保存，尚未提交给辅导员。";
  } catch (e) {
    notice.value = e instanceof Error && e.message.includes("REVISION")
      ? "其他页面已更新去向。草稿已保留，请核对后重新读取。"
      : "草稿未保存，草稿已保留；请核对单位、材料和当前协议。";
  } finally {
    working.value = false;
  }
}

async function submitDestination() {
  if (!session.actor || !destination.value) return;
  working.value = true;
  try {
    await appRepository.execute(
      {
        type: "DESTINATION_ACTION",
        commandId: crypto.randomUUID(),
        entityId: destination.value.id,
        expectedRevision: destination.value.revision,
        payload: { action: "SUBMIT" },
      },
      session.actor,
      fixedClock,
    );
    await load();
    notice.value = "已提交审核，材料在辅导员处理前仍保留完整版本。";
  } catch {
    notice.value = "提交未完成：该去向需要有效协议或至少一份对应证明材料。";
  } finally {
    working.value = false;
  }
}

async function confirmAgreement(agreementId: string, applicationId: string) {
  if (!session.actor) return;
  const application = data.value?.applications.find(
    (item) => item.id === applicationId,
  );
  if (!application) return;
  working.value = true;
  try {
    await appRepository.execute(
      {
        type: "APPLICATION_ACTION",
        commandId: crypto.randomUUID(),
        entityId: application.id,
        expectedRevision: application.revision,
        payload: { action: "CONFIRM_AGREEMENT" },
      },
      session.actor,
      fixedClock,
    );
    await load();
    notice.value = `协议 ${agreementId.slice(-6)} 已确认；双方确认后才会生效。`;
  } catch {
    notice.value = "协议状态已变化或已有生效协议，本次确认未写入。";
  } finally {
    working.value = false;
  }
}
</script>

<template>
  <main id="main-content" class="business-page destination-page ui-scene ui-scene--journey">
    <section v-if="recovery.pending.value && !loading" class="business-notice no-print" aria-label="未保存草稿恢复"><p>发现本标签页未保存的去向草稿。</p><div class="page-actions"><AppButton size="sm" @click="recovery.restore">恢复草稿</AppButton><AppButton size="sm" variant="ghost" @click="recovery.discard">丢弃缓存草稿</AppButton></div></section>
    <p v-if="recovery.warning.value" role="alert">{{ recovery.warning.value }}</p>
    <WorkbenchHeader>
      <template #heading><div>
        <p class="eyebrow">协议与毕业去向</p><h1>把重要的下一步，稳妥落定。</h1>
        <p>确认协议，或独立填报升学、创业等去向。</p>
      </div></template>
      <template #actions><AppTag
        v-if="destination"
        :tone="
          destination.status === 'approved'
            ? 'success'
            : destination.status === 'submitted'
              ? 'warn'
              : destination.status === 'rejected'
                ? 'danger'
                : 'neutral'
        "
        >{{ statusLabels[destination.status] }}</AppTag
      ></template>
    </WorkbenchHeader>
    <p v-if="notice" class="business-notice" role="status">{{ notice }}</p>
    <p v-if="error" class="business-notice business-error" role="alert">
      {{ error }}
    </p>
    <AppSkeleton v-else-if="loading" />
    <template v-else>
      <section class="agreement-band">
        <div class="band-heading">
          <div>
            <AppIcon name="agreement" :size="24" /><span
              ><strong>我的就业协议</strong
              ><small>双方分别确认，签署后关联校内就业去向</small></span
            >
          </div>
          <span>{{ agreements.length }} 份记录</span>
        </div>
        <div v-if="agreements.length" class="agreement-list">
          <article v-for="agreement in agreements" :key="agreement.id">
            <div>
              <p class="agreement-company"><EntityMark :id="agreement.companyId" :name="companyLabel(agreement.companyId)" :size="32" />{{ companyLabel(agreement.companyId) }}</p>
              <small
                >协议 {{ agreement.id.slice(-8) }} · 申请
                {{ agreement.applicationId.slice(-3) }}</small
              >
            </div>
            <div class="agreement-progress">
              <span :class="{ done: agreement.companyConfirmedAt }"
                >企业确认</span
              ><i></i
              ><span :class="{ done: agreement.studentConfirmedAt }"
                >学生确认</span
              >
            </div>
            <AppTag
              :tone="
                agreement.status === 'signed'
                  ? 'success'
                  : agreement.status === 'terminated'
                    ? 'danger'
                    : 'warn'
              "
              >{{
                agreement.status === "signed"
                  ? "已签署"
                  : agreement.status === "terminated"
                    ? "已终止"
                    : "确认中"
              }}</AppTag
            >
            <AppButton
              v-if="
                agreement.status === 'draft' && !agreement.studentConfirmedAt
              "
              size="sm"
              :loading="working"
              @click="confirmAgreement(agreement.id, agreement.applicationId)"
              >学生确认协议</AppButton
            >
          </article>
        </div>
        <p v-else class="muted">
          当前没有就业协议。升学、创业和灵活就业仍可独立填报。
        </p>
      </section>

      <div class="destination-layout">
        <section class="destination-editor">
          <div class="section-heading">
            <div>
              <h2><AppIcon name="destination" :size="21" />毕业去向填报</h2>
              <p class="muted">
                保存草稿不会进入统计；辅导员通过后才计入正式去向。
              </p>
            </div>
            <AppTag
              v-if="destination"
              :tone="
                destination.status === 'approved'
                  ? 'success'
                  : destination.status === 'submitted'
                    ? 'warn'
                    : 'neutral'
              "
              >{{ statusLabels[destination.status] }}</AppTag
            >
          </div>
          <fieldset :disabled="!editable || working || uploading" class="destination-form">
            <label class="form-label"
              >毕业去向类型<select v-model="form.type" @change="applyTypeRules">
                <option value="employment">签约就业</option>
                <option value="furtherStudy">升学</option>
                <option value="entrepreneurship">自主创业</option>
                <option value="flexible">灵活就业</option>
                <option value="unemployed">暂未落实去向</option>
              </select></label
            >
            <div class="path-note">
              <AppIcon
                :name="form.type === 'employment' ? 'agreement' : 'destination'"
                :size="20"
              /><span
                ><strong>{{ typeLabels[form.type] }}</strong
                ><small>{{
                  form.source === "internal"
                    ? "将核对已签就业协议"
                    : form.type === "employment"
                      ? "需要一份外部就业证明"
                      : form.type === "unemployed"
                        ? "无需单位与证明，可如实填报"
                        : "独立路径，不要求先有岗位投递"
                }}</small></span
              >
            </div>
            <label v-if="form.type !== 'unemployed'" class="form-label"
              >{{ organizationLabel
              }}<input v-model="form.organizationName" maxlength="120"
            /></label>
            <label v-if="form.type === 'employment'" class="form-label"
              >所属行业<select v-model="form.industryId">
                <option :value="null">请选择</option>
                <option
                  v-for="row in catalog?.dictionaries.filter(
                    (item) => item.kind === 'industry',
                  )"
                  :key="row.id"
                  :value="row.id"
                >
                  {{ row.label }}
                </option>
              </select></label
            >
            <label
              v-if="form.source !== 'internal' && form.type !== 'unemployed'"
              class="form-label proof-input"
              >证明材料<input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                @change="uploadProof"
              /><span
                ><AppIcon name="upload" :size="18" />{{
                  uploading ? "正在保存…" : "添加PDF、PNG或JPEG，单份不超过2MiB"
                }}</span
              ></label
            >
            <ul v-if="form.attachmentIds.length" class="attachment-list">
              <li v-for="id in form.attachmentIds" :key="id">
                <AppIcon name="check" :size="16" /><span>{{
                  attachments.find((item) => item.id === id)?.fileName ??
                  "已保存的证明材料"
                }}</span
                ><button
                  type="button"
                  aria-label="移除该材料"
                  @click="
                    form.attachmentIds = form.attachmentIds.filter(
                      (item) => item !== id,
                    )
                  "
                >
                  <AppIcon name="close" :size="15" />
                </button>
              </li>
            </ul>
          </fieldset>
          <p v-if="!editable" class="locked-note">
            <AppIcon name="lock" :size="16" />{{
              destination?.status === "approved"
                ? "已通过材料不能由学生直接改写；确需调整时，请先联系辅导员撤销审批。"
                : "材料审核期间暂不可修改；如需变更，可先撤回后再编辑。"
            }}
          </p>
          <footer class="editor-actions">
            <AppButton v-if="dirty && destination" variant="ghost" :disabled="working || uploading" @click="reread()">放弃草稿，读取最新</AppButton>
            <AppButton
              variant="secondary"
              :disabled="!editable || uploading"
              :loading="working"
              @click="saveDraft"
              >保存草稿</AppButton
            ><AppButton
              :disabled="!destination || destination.status !== 'draft' || dirty || uploading"
              :loading="working"
              @click="submitDestination"
              >提交辅导员审核</AppButton
            >
          </footer>
        </section>

        <aside class="review-track">
          <p class="eyebrow">审核轨迹</p>
          <h2>一份材料，三步确认。</h2>
          <ol>
            <li class="done">
              <span>1</span>
              <div>
                <strong>学生确认事实</strong>
                <p>
                  {{
                    destination
                      ? `${typeLabels[destination.type]} · ${destination.organizationName || "暂未落实单位"}`
                      : "先保存一份真实草稿"
                  }}
                </p>
              </div>
            </li>
            <li
              :class="{
                done:
                  destination &&
                  ['submitted', 'approved'].includes(destination.status),
              }"
            >
              <span>2</span>
              <div>
                <strong>提交辖区审核</strong>
                <p>
                  {{
                    destination?.submittedAt
                      ? destination.submittedAt.slice(0, 10)
                      : "尚未提交"
                  }}
                </p>
              </div>
            </li>
            <li :class="{ done: destination?.status === 'approved' }">
              <span>3</span>
              <div>
                <strong>辅导员核验</strong>
                <p>
                  {{
                    destination?.status === "approved"
                      ? "材料已通过并计入统计"
                      : destination?.status === "rejected"
                        ? destination.reviewReason
                        : "等待审核结果"
                  }}
                </p>
              </div>
            </li>
          </ol>
          <DestinationHistory v-if="destination" :logs="data?.auditLogs ?? []" :entity-id="destination.id" />
          <div class="privacy-note">
            <AppIcon name="lock" :size="17" />
            <p>{{ isOnline ? "材料保存在服务端，仅本人和所属辅导员可读取。" : "材料保存在本机演示数据库，仅本人和所属辅导员可读取。" }}</p>
          </div>
        </aside>
      </div>
    </template>
  </main>
</template>

<style scoped>
.destination-page {
  max-width: 1320px;
}
.eyebrow {
  font: 12px var(--font-mono);
  color: var(--brand-text);
  margin-bottom: 8px;
}
.agreement-band {
  background: var(--navy);
  color: var(--on-navy);
  padding: 26px 28px;
  margin-bottom: 28px;
  border-radius: var(--r-card);
}
.band-heading {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: center;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(167, 180, 204, 0.2);
}
.band-heading > div {
  display: flex;
  align-items: center;
  gap: 13px;
}
.band-heading > div > span {
  display: grid;
  gap: 5px;
}
.band-heading small,
.band-heading > span {
  font-size: 11px;
  color: var(--on-navy-muted);
}
.agreement-list article {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(250px, 0.8fr) auto auto;
  gap: 20px;
  align-items: center;
  padding: 18px 0;
  border-bottom: 1px solid rgba(167, 180, 204, 0.16);
}
.agreement-list article:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}
.agreement-list article > div:first-child {
  display: grid;
  gap: 6px;
}
.agreement-list small {
  font: 11px var(--font-mono);
  color: var(--on-navy-muted);
}
.agreement-company { display: flex; align-items: center; gap: 10px; }
.agreement-progress {
  display: flex;
  align-items: center;
}
.agreement-progress span {
  font-size: 11px;
  padding: 6px 9px;
  border: 1px solid rgba(167, 180, 204, 0.28);
  color: var(--on-navy-muted);
}
.agreement-progress span.done {
  background: rgba(31, 157, 107, 0.18);
  color: #a8e3c8;
  border-color: transparent;
}
.agreement-progress i {
  width: 22px;
  height: 1px;
  background: rgba(167, 180, 204, 0.28);
}
.destination-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(300px, 0.65fr);
  gap: 28px;
}
.destination-editor {
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 30px;
}
.destination-editor .section-heading {
  align-items: flex-start;
}
.destination-editor .section-heading p {
  font-size: 12px;
  margin-top: 7px;
}
.destination-form {
  border: 0;
  padding: 0;
  display: grid;
  gap: 22px;
}
.path-note {
  display: flex;
  gap: 13px;
  align-items: center;
  padding: 16px;
  background: var(--brand-soft);
  color: var(--brand-text);
}
.path-note > span {
  display: grid;
  gap: 5px;
}
.path-note small {
  font-size: 11px;
  color: var(--text-2);
}
.proof-input {
  position: relative;
}
.proof-input input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.proof-input > span {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 16px;
  border: 1px dashed var(--border-control);
  color: var(--brand-text);
  font-weight: 400;
  cursor: pointer;
}
.attachment-list {
  list-style: none;
  display: grid;
  gap: 8px;
}
.attachment-list li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 11px 12px;
  background: var(--success-soft);
  color: var(--success-text);
  font-size: 12px;
}
.attachment-list button {
  color: var(--text-2);
}
.locked-note {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 14px;
  background: var(--warn-soft);
  color: var(--warn-text);
  font-size: 12px;
  margin-top: 20px;
}
.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 26px;
  padding-top: 22px;
  border-top: 1px solid var(--border);
}
.review-track {
  background: var(--surface-2);
  padding: 30px;
}
.review-track h2 {
  font-size: 22px;
  line-height: 1.5;
  margin: 8px 0 28px;
}
.review-track ol {
  list-style: none;
}
.review-track li {
  position: relative;
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 14px;
  min-height: 112px;
}
.review-track li:not(:last-child)::after {
  content: "";
  position: absolute;
  left: 16px;
  top: 34px;
  bottom: 0;
  width: 1px;
  background: var(--border-control);
}
.review-track li > span {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border-control);
  border-radius: 50%;
  font: 12px var(--font-mono);
  background: var(--surface-2);
  z-index: 1;
}
.review-track li.done > span {
  background: var(--success);
  border-color: var(--success);
  color: #fff;
}
.review-track li > div {
  padding-top: 6px;
}
.review-track li p {
  font-size: 12px;
  color: var(--text-2);
  margin-top: 8px;
}
.privacy-note {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  border-top: 1px solid var(--border);
  padding-top: 20px;
  font-size: 11px;
  color: var(--text-3);
}
@media (max-width: 1000px) {
  .destination-layout {
    grid-template-columns: 1fr;
  }
  .review-track ol {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  .review-track li {
    display: grid;
    min-height: 0;
  }
  .review-track li::after {
    display: none !important;
  }
  .agreement-list article {
    grid-template-columns: 1fr 1fr;
  }
  .agreement-list article > .tag {
    justify-self: start;
  }
}
@media (max-width: 767px) {
  .agreement-band {
    padding: 22px 18px;
  }
  .band-heading {
    align-items: flex-start;
  }
  .agreement-list article {
    grid-template-columns: 1fr;
  }
  .agreement-progress {
    overflow: auto;
  }
  .destination-editor,
  .review-track {
    padding: 22px;
  }
  .review-track ol {
    grid-template-columns: 1fr;
  }
  .editor-actions {
    justify-content: stretch;
  }
  .editor-actions .app-button {
    flex: 1;
  }
}
</style>
