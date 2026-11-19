<script setup lang="ts">
import WorkbenchGuide from "../../components/presentation/WorkbenchGuide.vue";
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import { onMounted, onUnmounted, reactive, ref } from "vue";
import { api } from "../../adapters/repository/http";
import { onDomainChange } from "../../services/app-services";
import type { OpportunityEntry } from "../../types/opportunities";
type AdminPage = {
  entries: OpportunityEntry[];
  runs: {
    id: number;
    started_at: string;
    status: string;
    count: number;
    error: string | null;
  }[];
  nextSyncAt: string | null;
};
const data = ref<AdminPage | null>(null),
  error = ref(""),
  notice = ref(""),
  working = ref("");
const reasons = reactive<Record<string, string>>({}),
  notes = reactive<Record<string, string>>({});
const salary = reactive<Record<string, string>>({}),
  workType = reactive<Record<string, string>>({});
const commands = new Map<string, Record<string, unknown>>();
async function load() {
  try {
    data.value = await api("/api/admin/opportunities");
    for (const row of data.value!.entries) {
      reasons[row.id] ??= "";
      notes[row.id] ??= row.candidate?.qualificationNote ?? "";
      salary[row.id] ??= "";
      workType[row.id] ??= "";
    }
  } catch {
    error.value = "来源列表暂时无法读取。";
  }
}
async function sync() {
  working.value = "sync";
  error.value = "";
  try {
    const result = await api<{ count: number; changed: number }>(
      "/api/admin/opportunities/sync",
      {},
    );
    notice.value = `已暂存 ${result.count} 条，变更 ${result.changed} 条，请逐项审核。`;
  } catch {
    error.value = "同步未完成或24小时限额未到；已发布内容保留。";
  } finally {
    working.value = "";
    await load();
  }
}
async function review(row: OpportunityEntry, decision: string) {
  if (!reasons[row.id]?.trim()) {
    error.value = "请填写审核说明。";
    return;
  }
  working.value = row.id;
  error.value = "";
  const key = `${row.id}:${decision}`,
    body = commands.get(key) ?? {
      id: row.id,
      expectedRevision: row.revision,
      commandId: crypto.randomUUID(),
      decision,
      reason: reasons[row.id],
      ...(decision === "publish"
        ? {
            qualificationNote: notes[row.id],
            verifiedFields: {
              ...(salary[row.id] ? { salaryText: salary[row.id] } : {}),
              ...(workType[row.id]
                ? { recruitmentType: workType[row.id] }
                : {}),
            },
          }
        : {}),
    };
  commands.set(key, body);
  try {
    await api("/api/admin/opportunities/review", body);
    commands.delete(key);
    notice.value = "审核结果已保存";
    await load();
  } catch {
    error.value = "审核未完成或版本已更新，请核对并重新读取；说明已保留。";
  } finally {
    working.value = "";
  }
}
function reread() {
  commands.clear();
  error.value = "";
  void load();
}
function diff(row: OpportunityEntry) {
  if (!row.candidate) return [];
  return Object.keys(row.candidate).filter(
    (key) =>
      JSON.stringify(row.published?.[key as keyof typeof row.candidate]) !==
      JSON.stringify(row.candidate?.[key as keyof typeof row.candidate]),
  );
}
const names: Record<string, string> = {
  title: "岗位名称",
  employer: "企业",
  location: "地域",
  degree: "学历",
  majors: "专业",
  recruitmentType: "类型",
  salaryText: "薪资",
  headCount: "人数",
  industry: "行业",
  companyNature: "企业性质",
  companySize: "规模",
  underlyingSource: "底层来源",
  publishedAt: "发布时间",
  sourceUpdatedAt: "原站更新",
  observedAt: "采集时间",
  deadline: "截止",
  qualificationNote: "资格提醒",
  sourceName: "平台",
  url: "链接",
  id: "来源标识",
};
const unsubscribe = onDomainChange(() => void load());
onMounted(load);
onUnmounted(unsubscribe);
</script>
<template>
  <main id="main-content" class="business-page sources-page ui-scene ui-scene--governance">
    <WorkbenchHeader>
      <template #heading><div>
        <h1>每一条机会，都能追溯来源。</h1>
        <p>适量采集、核对来源，再发布给求职者。</p>
      </div></template>
      <template #actions><button
        class="public-button"
        :disabled="
          !!working ||
          (!!data?.nextSyncAt && Date.parse(data.nextSyncAt) > Date.now())
        "
        @click="sync"
      >
        {{ working === "sync" ? "同步中…" : "同步国家平台" }}
      </button></template>
    </WorkbenchHeader>

    <div class="workbench-split workbench-body-layout"><div class="workbench-body-main">
    <p class="caption">
      每24小时最多同步一次，目标20条、上限30条。新内容须审核，不创建本站企业或投递。
    </p>
    <p v-if="data?.nextSyncAt" class="caption">
      下次可同步：{{
        new Date(data.nextSyncAt).toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
        })
      }}
    </p>
    <p v-if="error" role="alert" class="business-error">
      {{ error }} <button @click="reread">重新读取</button>
    </p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <details v-if="data?.runs.length" class="sync-runs">
      <summary>最近同步批次</summary>
      <p v-for="run in data.runs" :key="run.id">
        {{
          new Date(run.started_at).toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
          })
        }}
        ·
        {{
          run.status === "staged"
            ? "待审核"
            : run.status === "failed"
              ? "同步失败"
              : "同步中"
        }}
        · {{ run.count }} 条 {{ run.error || "" }}
      </p>
    </details>
    <p v-if="!data?.entries.length" class="business-empty">
      暂无来源条目，可手动同步一批公开机会。
    </p>
    <article v-for="row in data?.entries" :key="row.id" class="source-entry">
      <header>
        <div>
          <h2>{{ (row.candidate || row.published)?.title || row.id }}</h2>
          <p>
            {{ (row.candidate || row.published)?.employer }} ·
            {{ (row.candidate || row.published)?.location }}
          </p>
        </div>
        <span>{{
          row.status === "rejected"
            ? "已退回"
            : row.candidate
              ? "待审核"
              : row.status === "published"
                ? "已发布"
                : row.status === "withdrawn"
                  ? "已下架"
                  : "已退回"
        }}</span>
      </header>
      <p class="caption">
        {{ (row.candidate || row.published)?.sourceName }} ·
        {{
          (row.candidate || row.published)?.underlyingSource || "底层来源未提供"
        }}
      </p>
      <details v-if="row.candidate">
        <summary>{{ row.published ? "查看更新差异" : "查看新增字段" }}</summary>
        <dl>
          <div v-for="key in diff(row)" :key="key">
            <dt>{{ names[key] || key }}</dt>
            <dd>
              <del v-if="row.published">{{
                row.published[key as keyof typeof row.published] ?? "未提供"
              }}</del><span>{{
                row.candidate[key as keyof typeof row.candidate] ?? "未提供"
              }}</span>
            </dd>
          </div>
        </dl>
      </details>
      <a
        :href="(row.candidate || row.published)?.url"
        target="_blank"
        rel="noopener noreferrer"
        >核对原站信息</a
      >
      <form
        class="source-actions"
        @submit.prevent="review(row, 'publish')"
        @input="commands.delete(`${row.id}:publish`)"
      >
        <template v-if="row.candidate"
          ><label
            >已核对薪资<input
              v-model="salary[row.id]"
              maxlength="80"
              placeholder="留空则保留原站口径" /></label
          ><label
            >已核对招聘类型<select v-model="workType[row.id]">
              <option value="">保留原值</option>
              <option>全职</option>
              <option>兼职</option>
              <option>实习</option>
            </select></label
          ></template
        >
        <label v-if="row.candidate"
          >资格提醒<input
            v-model="notes[row.id]"
            maxlength="500"
            placeholder="仅填写已核对的原站条件" /></label
        ><label
          >审核说明<input v-model="reasons[row.id]" maxlength="500" required
        /></label>
        <div>
          <button
            v-if="row.candidate"
            class="public-button"
            type="submit"
            :disabled="!!working"
          >
            发布</button
          ><button
            v-if="row.candidate"
            class="public-button secondary"
            type="button"
            :disabled="!!working"
            @click="review(row, 'reject')"
          >
            退回</button
          ><button
            v-if="row.published && row.status !== 'withdrawn'"
            class="public-button secondary"
            type="button"
            :disabled="!!working"
            @click="review(row, 'withdraw')"
          >
            下架
          </button>
        </div>
      </form>
      <p v-if="row.reason" class="caption">上次说明：{{ row.reason }}</p>
    </article>
  
    </div><WorkbenchGuide title="先核实来源，再公开机会。" copy="来源核实、候选审核与公开发布分别处理。同步不会自动建立企业账号或发起投递。" /></div>
    </main>
</template>
<style scoped>
.source-entry {
  border-top: 1px solid var(--border);
  padding: 28px 0;
}
.source-entry header {
  display: flex;
  gap: 24px;
  justify-content: space-between;
  margin-bottom: 14px;
}
.source-entry h2 {
  font-size: 20px;
}
.source-entry header p {
  font-size: 14px;
  color: var(--text-2);
  margin-top: 8px;
}
.source-entry details {
  margin-block: 18px;
  font-size: 14px;
}
.source-entry dl {
  margin-top: 14px;
}
.source-entry dl > div {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr);
  padding: 8px;
  border-bottom: 1px solid var(--border);
}
.source-entry dd {
  display: grid;
  gap: 4px;
  overflow-wrap: anywhere;
}
.source-entry del {
  color: var(--text-2);
}
.source-actions {
  display: grid;
  gap: 16px;
  max-width: 720px;
  margin: 20px 0;
}
.source-actions label {
  display: grid;
  gap: 8px;
  font-size: 14px;
}
.source-actions input,
.source-actions select {
  border: 1px solid var(--border-control);
  padding: 12px;
  border-radius: 8px;
  font: 15px var(--font-sans);
  background: var(--surface);
  color: var(--text-1);
  width: 100%;
  min-height: 44px;
}
.source-actions > div {
  display: flex;
  gap: 12px;
}
.sync-runs {
  margin-block: 24px;
  font-size: 14px;
}
.sync-runs p {
  margin-top: 10px;
  color: var(--text-2);
}
</style>
