<script setup lang="ts">
import WorkbenchGuide from "../../components/presentation/WorkbenchGuide.vue";
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import { onMounted, onUnmounted, reactive, ref } from "vue";
import { api } from "../../adapters/repository/http";
import { onDomainChange } from "../../services/app-services";
import type { OpportunityRecord } from "../../types/opportunities";
import { recordStatusLabels } from "../../types/opportunities";
type Draft = {
  status: OpportunityRecord["status"];
  saved: boolean;
  note: string;
  activityDate: string;
  revision: number;
  dirty: boolean;
  pending: Record<string, unknown> | null;
};
const rows = ref<OpportunityRecord[]>([]),
  drafts = reactive<Record<string, Draft>>({}),
  error = ref(""),
  notice = ref(""),
  working = ref("");
async function load() {
  try {
    rows.value = await api("/api/opportunity-records");
    for (const row of rows.value)
      if (!drafts[row.id]?.dirty)
        drafts[row.id] = {
          status: row.status,
          saved: row.saved,
          note: row.note,
          activityDate: row.activityDate ?? "",
          revision: row.revision,
          dirty: false,
          pending: null,
        };
    error.value = "";
  } catch {
    error.value = "记录暂时无法读取，未保存的内容仍保留。";
  }
}
async function save(row: OpportunityRecord) {
  if (working.value) return;
  const draft = drafts[row.id]!;
  working.value = row.id;
  notice.value = "";
  draft.pending ??= {
    id: row.id,
    expectedRevision: draft.revision,
    commandId: crypto.randomUUID(),
    saved: draft.saved,
    status: draft.status,
    note: draft.note,
    activityDate: draft.activityDate || null,
  };
  try {
    const next = await api<OpportunityRecord>(
      "/api/opportunity-records",
      draft.pending,
    );
    draft.revision = next.revision;
    draft.dirty = false;
    draft.pending = null;
    notice.value = "已保存本人求职记录";
    await load();
  } catch {
    error.value =
      "保存未完成。若其他设备已更新，请核对后重新读取；原输入已保留。";
  } finally {
    working.value = "";
  }
}
function reread(id: string) {
  delete drafts[id];
  void load();
}
const unsubscribe = onDomainChange(() => void load());
onMounted(load);
onUnmounted(unsubscribe);
</script>
<template>
  <main id="main-content" class="business-page records-page ui-scene ui-scene--journey">
    <WorkbenchHeader>
      <template #heading><div>
        <h1>让每一次关注，都有后续。</h1>
        <p>保存关注与本人进展，申请请在原站完成。</p>
      </div></template>
      <template #actions><RouterLink to="/opportunities">发现更多机会</RouterLink></template>
    </WorkbenchHeader>

    <div class="workbench-split workbench-body-layout"><div class="workbench-body-main">
    <p v-if="error" class="business-error" role="alert">
      {{ error }} <button @click="load">重试</button>
    </p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="!rows.length && !error" class="business-empty">
      尚未保存机会，先从公开岗位中关注一个方向。
    </p>
    <article v-for="row in rows" :key="row.id" class="record-card">
      <header>
        <div>
          <RouterLink :to="`/opportunities/${encodeURIComponent(row.id)}`"
            ><h2>{{ row.opportunity.title }}</h2></RouterLink
          >
          <p>
            {{ row.opportunity.employer }} ·
            {{ row.opportunity.location || "地点待确认" }}
          </p>
        </div>
        <span
          v-if="row.opportunity.availability !== 'available'"
          class="public-warning"
          >{{
            { withdrawn: "已下架", expired: "已过期", stale: "信息待核对" }[
              row.opportunity.availability
            ]
          }}</span><span v-else class="caption">本人记录</span>
      </header>
      <form
        v-if="drafts[row.id]"
        class="record-form"
        @submit.prevent="save(row)"
        @input="
          drafts[row.id]!.dirty = true;
          drafts[row.id]!.pending = null;
        "
      >
        <label
          >本人进展<select
            v-model="drafts[row.id]!.status"
            :disabled="!!working"
          >
            <option
              v-for="(label, key) in recordStatusLabels"
              :key="key"
              :value="key"
            >
              {{ label }}
            </option>
          </select></label
        ><label
          >进展日期<input
            v-model="drafts[row.id]!.activityDate"
            type="date"
            :disabled="!!working"
            :required="drafts[row.id]!.status !== 'following'" /></label
        ><label class="record-note"
          >个人备注<textarea
            v-model="drafts[row.id]!.note"
            rows="2"
            maxlength="1000"
            :disabled="!!working"
          /></label
        ><label class="record-check"
          ><input
            v-model="drafts[row.id]!.saved"
            type="checkbox"
            :disabled="!!working"
          />保留关注</label
        >
        <div class="record-actions">
          <button class="public-button" :disabled="!!working" type="submit">
            保存记录</button
          ><button
            class="public-button secondary"
            type="button"
            :disabled="!!working"
            @click="reread(row.id)"
          >
            重新读取</button
          ><a
            :href="row.opportunity.url"
            target="_blank"
            rel="noopener noreferrer"
            >原站查看</a
          ><RouterLink
            v-if="drafts[row.id]!.status === 'offer'"
            to="/student/destination"
            >办理站外去向</RouterLink
          >
        </div>
      </form>
    </article>
  
    </div><WorkbenchGuide title="让每一次关注，都有后续。" copy="本站投递与站外个人记录分开管理。来源、更新时间与进展备注清楚可查。" /></div>
    </main>
</template>
<style scoped>
.record-card {
  border-top: 1px solid var(--border);
  padding: 28px 0;
}
.record-card header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: start;
  margin-bottom: 24px;
}
.record-card h2 {
  font-size: 20px;
}
.record-card header p {
  font-size: 14px;
  color: var(--text-2);
  margin-top: 8px;
}
.record-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.record-form label {
  display: grid;
  gap: 8px;
  font-size: 14px;
}
.record-form input:not([type="checkbox"]),
.record-form select,
.record-form textarea {
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--border-control);
  border-radius: 8px;
  min-height: 44px;
  color: var(--text-1);
  font: 15px var(--font-sans);
  width: 100%;
}
.record-note,
.record-actions {
  grid-column: 1/-1;
}
.record-form .record-check {
  display: flex;
  align-items: center;
}
.record-actions {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}
@media (max-width: 650px) {
  .record-form {
    grid-template-columns: 1fr;
  }
  .record-card header {
    flex-direction: column;
  }
}
</style>
