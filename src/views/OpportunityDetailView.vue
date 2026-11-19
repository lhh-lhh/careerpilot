<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import PublicHeader from "../components/public/PublicHeader.vue";
import { api } from "../adapters/repository/http";
import { useSessionStore } from "../stores/session";
import { onDomainChange } from "../services/app-services";
import type { Opportunity, OpportunityRecord } from "../types/opportunities";
const route = useRoute(),
  session = useSessionStore(),
  job = ref<Opportunity | null>(null),
  record = ref<OpportunityRecord | null>(null),
  error = ref(""),
  notice = ref(""),
  working = ref(false);
const back = computed(() =>
  typeof route.query.from === "string" &&
  /^\/opportunities(?:\?|$)/.test(route.query.from)
    ? route.query.from
    : "/opportunities",
);
const canRecord = computed(
  () =>
    session.actor?.role === "student" && session.accountStatus === "approved",
);
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })
    : "未提供";
let generation = 0;
async function load() {
  if (working.value) return;
  const version = ++generation;
  const id = String(route.params.id);
  error.value = "";
  try {
    const next = await api<Opportunity>(
      `/api/public/opportunities/${encodeURIComponent(id)}`,
    );
    if (version !== generation) return;
    job.value = next;
    if (canRecord.value) {
      const rows = await api<OpportunityRecord[]>("/api/opportunity-records");
      if (version === generation)
        record.value = rows.find((r) => r.id === id) ?? null;
    }
  } catch {
    if (version === generation) error.value = "岗位未找到或暂时无法读取。";
  }
}
let pending: Record<string, unknown> | null = null;
async function toggle() {
  if (!job.value || working.value) return;
  const id = String(route.params.id);
  const version = ++generation;
  working.value = true;
  notice.value = "";
  pending ??= {
    id: job.value.id,
    expectedRevision: record.value?.revision ?? 0,
    commandId: crypto.randomUUID(),
    saved: !record.value?.saved,
    status: record.value?.status ?? "following",
    note: record.value?.note ?? "",
    activityDate: record.value?.activityDate ?? null,
  };
  try {
    const next = await api<OpportunityRecord>(
      "/api/opportunity-records",
      pending,
    );
    if (version !== generation || id !== String(route.params.id)) return;
    record.value = next;
    pending = null;
    notice.value = "已保存关注状态";
  } catch {
    if (version === generation)
      notice.value = "保存未完成，请重试；若其他设备已更新，请重新读取。";
  } finally {
    if (version === generation) working.value = false;
  }
}
const unsubscribe = onDomainChange(() => void load());
onMounted(load);
watch(
  () => route.params.id,
  () => {
    generation++;
    working.value = false;
    job.value = null;
    record.value = null;
    pending = null;
    notice.value = "";
    void load();
  },
);
onUnmounted(() => {
  generation++;
  unsubscribe();
});
</script>
<template>
  <div class="public-page feature-detail ui-scene ui-scene--campus">
    <PublicHeader />
    <main id="main-content" class="public-container public-section">
      <RouterLink :to="back" class="public-breadcrumb">返回岗位列表</RouterLink>
      <p v-if="error" role="alert" class="public-error">
        {{ error }}
        <button
          class="public-button secondary"
          @click="
            pending = null;
            load();
          "
        >
          重新读取
        </button>
      </p>
      <div v-else-if="job" class="public-detail">
        <article>
          <span
            class="opportunity-source"
            :class="{ external: job.kind === 'external' }"
            >{{ job.kind === "local" ? "本站办理" : "原站申请" }}</span
          >
          <h1 class="detail-title">{{ job.title }}</h1>
          <p class="public-subtitle">{{ job.employer }}</p>
          <p v-if="job.availability !== 'available'" class="public-warning">
            {{
              {
                withdrawn: "已下架",
                expired: "已过截止时间",
                stale: "信息已超过30天未核对",
              }[job.availability]
            }}
          </p>
          <p v-else-if="job.freshness === 'needsUpdate'" class="public-warning">
            信息待更新，请在原站核对。
          </p>
          <dl class="public-facts">
            <div
              v-for="[label, value] in [
                ['工作地点', job.location],
                ['学历要求', job.degree],
                ['薪资', job.salaryText],
                ['专业要求', job.majors],
                ['招聘类型', job.recruitmentType],
                ['招聘人数', job.headCount],
                ['行业', job.industry],
                ['企业性质', job.companyNature],
                ['企业规模', job.companySize],
                ['截止日期', date(job.deadline)],
              ]"
              :key="String(label)"
            >
              <dt>{{ label }}</dt>
              <dd>{{ value || "未提供" }}</dd>
            </div>
          </dl>
          <template v-if="job.description"
            ><h2>岗位要求</h2>
            <p class="public-detail-copy">{{ job.description }}</p></template
          ><template v-else
            ><h2>申请须知</h2>
            <p class="public-detail-copy">
              完整职责、资格要求及招聘状态请以原站为准。
            </p></template
          >
          <p v-if="job.qualificationNote" class="public-warning detail-note">
            {{ job.qualificationNote }}
          </p>
          <dl class="public-facts">
            <div>
              <dt>信息平台</dt>
              <dd>{{ job.sourceName }}</dd>
            </div>
            <div v-if="job.underlyingSource">
              <dt>原始信息来源</dt>
              <dd>{{ job.underlyingSource }}</dd>
            </div>
            <div>
              <dt>发布时间</dt>
              <dd>{{ date(job.publishedAt) }}</dd>
            </div>
            <div>
              <dt>原站更新</dt>
              <dd>{{ date(job.sourceUpdatedAt) }}</dd>
            </div>
            <div>
              <dt>采集核对</dt>
              <dd>{{ date(job.observedAt) }}</dd>
            </div>
          </dl>
        </article>
        <aside class="public-detail-aside">
          <h2>{{ job.kind === "external" ? "在原站申请" : "继续申请" }}</h2>
          <template v-if="job.kind === 'external'"
            ><p>前往原站不代表已投递；求职进展由你本人记录。</p>
            <a
              class="public-button"
              :href="job.url"
              target="_blank"
              rel="noopener noreferrer"
              >原站查看</a
            ><button
              v-if="canRecord"
              class="public-button secondary"
              :disabled="
                working || (!record && job.availability !== 'available')
              "
              @click="toggle"
            >
              {{ record?.saved ? "已关注" : "关注岗位" }}</button
            ><RouterLink
              v-else-if="!session.actor"
              class="public-button secondary"
              :to="{ path: '/login', query: { redirect: route.fullPath } }"
              >登录后关注</RouterLink
            >
            <p v-else-if="session.accountStatus !== 'approved'">
              账号审核通过后可保存关注。
            </p>
            <RouterLink v-if="canRecord" to="/student/opportunities"
              >我的求职记录</RouterLink
            ></template
          ><RouterLink
            v-else
            class="public-button"
            :to="{ path: '/student/jobs', query: { job: job.localJobId } }"
            >查看匹配与投递</RouterLink
          >
          <p v-if="notice" role="status">{{ notice }}</p>
          <button
            v-if="pending"
            class="public-button secondary"
            @click="
              pending = null;
              load();
            "
          >
            重新读取
          </button>
        </aside>
      </div>
      <p v-else class="public-empty" role="status">正在读取岗位…</p>
    </main>
  </div>
</template>
<style scoped>
.detail-title {
  margin-top: 24px;
  overflow-wrap: anywhere;
}
.detail-note {
  margin-top: 24px;
}
</style>
