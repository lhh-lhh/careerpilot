<script setup lang="ts">
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import InterviewCalendar from "../../components/presentation/InterviewCalendar.vue";
import WorkbenchGuide from "../../components/presentation/WorkbenchGuide.vue";
import { computed, ref } from "vue";
import { useCompanyData } from "../../composables/useCompanyData";
import AppSkeleton from "../../components/base/AppSkeleton.vue";
import AppTag from "../../components/base/AppTag.vue";
import { isOnline } from "../../services/runtime";
const { data, loading, error } = useCompanyData();
const status = ref("scheduled"),
  date = ref("");
const labels = {
  scheduled: "已安排",
  completed: "已完成",
  cancelled: "已取消",
};
const responses = {
  pending: "等待学生响应",
  accepted: "学生已确认",
  declined: "学生已拒绝",
  rescheduleRequested: "学生申请改期",
};
const day = (value: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
const time = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
const rows = computed(() =>
  (data.value?.interviews ?? [])
    .filter(
      (i) =>
        (!status.value || i.status === status.value) &&
        (!date.value || day(i.scheduledAt) === date.value),
    )
    .sort(
      (a, b) =>
        a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id),
    )
    .map((i) => {
      const application = data.value?.applications.find(
        (a) => a.id === i.applicationId,
      );
      return {
        ...i,
        name: application?.resumeSnapshot.basic.name ?? "历史候选人",
        job:
          data.value?.jobs.find((j) => j.id === application?.jobId)?.title ??
          "历史岗位",
      };
    }),
);
</script>
<template>
  <main id="main-content" class="business-page schedule-page ui-scene ui-scene--pipeline">
    <WorkbenchHeader>
      <template #heading><div>
        <div class="kicker">面试日程 · RECRUITING STUDIO</div><h1>让每一次见面，安排有序。</h1>
        <p>
          北京时间 ·
          {{
            isOnline
              ? "每场预留60分钟，安排与改期自动检查冲突。"
              : "离线教学日程"
          }}
        </p>
      </div></template>
      <template #actions><RouterLink class="inline-link" to="/company/candidates"
        >候选人流程</RouterLink
      ></template>
    </WorkbenchHeader>
    <div class="schedule-filters no-print">
      <div>
        <label for="schedule-status">日程状态</label
        ><select id="schedule-status" v-model="status">
          <option value="">全部状态</option>
          <option value="scheduled">已安排</option>
          <option value="completed">已完成</option>
          <option value="cancelled">已取消</option>
        </select>
      </div>
      <div>
        <label for="schedule-date">日程日期（北京时间）</label
        ><input id="schedule-date" v-model="date" type="date" />
      </div>
    </div>
    <div class="schedule-layout"><InterviewCalendar :events="rows" :date="date" /><div class="schedule-rail">
    <WorkbenchGuide title="把时间，留给认真交流。" copy="时间口径统一，邀请响应和调整历史保持可查。" />
    <section aria-label="所选日程"><h2 class="schedule-section-title">所选日程</h2>
    <p v-if="error" class="business-notice business-error" role="alert">
      {{ error }}
    </p>
    <AppSkeleton v-else-if="loading" />
    <p v-else-if="!rows.length" class="business-empty">
      当前筛选下没有面试日程。
    </p>
    <div v-else class="schedule-list">
      <article v-for="item in rows" :key="item.id" :data-interview="item.id">
        <div class="schedule-time">
          <strong>{{ day(item.scheduledAt) }}</strong
          ><span>{{ time(item.scheduledAt) }}</span>
        </div>
        <div class="schedule-detail">
          <h2>{{ item.name }}</h2>
          <p>{{ item.job }} · {{ item.location }}</p>
          <p v-if="item.status === 'scheduled'">
            {{ responses[item.studentResponse ?? "pending"] }}
          </p>
        </div>
        <AppTag
          :tone="
            item.status === 'cancelled'
              ? 'neutral'
              : item.status === 'completed'
                ? 'success'
                : 'brand'
          "
          >{{ labels[item.status] }}</AppTag
        >
        <RouterLink
          class="inline-link no-print"
          :to="`/company/candidates?application=${item.applicationId}`"
          >办理邀约</RouterLink
        >
      </article>
    </div>
    </section></div></div>
  </main>
</template>
<style scoped>
.schedule-layout{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:20px;align-items:start}.schedule-rail{display:grid;gap:20px;min-width:0}.schedule-section-title{margin:0 0 18px}.schedule-rail .schedule-list article{display:grid;grid-template-columns:1fr;gap:14px}.schedule-rail .schedule-list h2{font-size:17px}.schedule-rail .schedule-time{display:flex;align-items:center;justify-content:space-between;font-size:12px}.schedule-rail .schedule-time span{font-size:21px}@media(max-width:1100px){.schedule-layout{grid-template-columns:minmax(0,1fr)}.schedule-rail .schedule-list article{display:flex;flex-wrap:wrap}.schedule-rail .schedule-time{display:grid}}
.schedule-page {
  max-width: 1320px;
}
.schedule-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 24px;
}
.schedule-filters > div {
  display: grid;
  gap: 8px;
  font-size: 14px;
}
.schedule-filters select,
.schedule-filters input {
  padding: 10px 12px;
  border: 1px solid var(--border-control);
  border-radius: var(--r-control);
  background: var(--surface);
  color: var(--text-1);
  font: inherit;
}
.schedule-list {
  display: grid;
  gap: 12px;
}
.schedule-list article {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  background: var(--surface);
}
.schedule-time {
  display: grid;
  gap: 6px;
  flex-shrink: 0;
}
.schedule-time span {
  font: 600 24px var(--font-mono);
  color: var(--brand-text);
}
.schedule-detail {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.schedule-detail h2 {
  font-size: 18px;
}
.schedule-detail p {
  font-size: 14px;
  color: var(--text-2);
  margin-top: 6px;
}
@media (max-width: 600px) {
  .schedule-list article {
    flex-wrap: wrap;
    gap: 16px;
    padding: 20px;
  }
  .schedule-detail {
    flex-basis: 100%;
  }
  .schedule-filters > div {
    min-width: 0;
    flex: 1;
  }
  .schedule-filters input {
    min-width: 0;
    width: 100%;
  }
}
</style>
