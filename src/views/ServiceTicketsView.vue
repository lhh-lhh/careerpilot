<script setup lang="ts">
import WorkbenchGuide from "../components/presentation/WorkbenchGuide.vue";
import WorkbenchHeader from "../components/presentation/WorkbenchHeader.vue";
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { appRepository, onDomainChange } from "../services/app-services";
import { useSessionStore } from "../stores/session";
import { businessNow } from "../services/runtime";
import type { Feedback } from "../types/entities";
import type { TicketCommand } from "../services/ticket-command";
import AppButton from "../components/base/AppButton.vue";
import AppModal from "../components/base/AppModal.vue";
import AppTag from "../components/base/AppTag.vue";
import AppSkeleton from "../components/base/AppSkeleton.vue";
const session = useSessionStore(),
  records = shallowRef<Feedback[]>([]),
  target = shallowRef<Feedback | null>(null);
const body = ref(""),
  text = ref(""),
  notice = ref(""),
  error = ref(""),
  working = ref(false),
  loading = ref(true),
  status = ref(""),
  query = ref(""),
  page = ref(1);
const labels = { open: "待答复", replied: "已答复", closed: "已结案" },
  actions = { REPLY: "管理员答复", CLOSE: "管理员结案", REOPEN: "本人重开" };
const isAdmin = computed(() => session.actor?.role === "admin");
const filtered = computed(() =>
  records.value.filter(
    (t) =>
      (!status.value || t.status === status.value) &&
      `${t.body} ${t.reply ?? ""}`
        .toLowerCase()
        .includes(query.value.trim().toLowerCase()),
  ),
);
const pages = computed(() =>
  Math.max(1, Math.ceil(filtered.value.length / 12)),
);
const visible = computed(() =>
  filtered.value.slice((page.value - 1) * 12, page.value * 12),
);
watch([status, query], () => {
  page.value = 1;
});
watch(pages, (count) => {
  page.value = Math.min(page.value, count);
});
let generation = 0,
  disposed = false;
async function load() {
  const id = ++generation,
    actor = session.actor;
  if (!actor) return;
  try {
    const result = await appRepository.readTickets(actor);
    if (!disposed && id === generation) {
      records.value = result;
      error.value = "";
    }
  } catch {
    if (id === generation) error.value = "工单暂时无法读取，请刷新队列重试。";
  } finally {
    if (id === generation) loading.value = false;
  }
}
const unsubscribe = onDomainChange(() => void load());
onMounted(load);
onUnmounted(() => {
  disposed = true;
  generation++;
  unsubscribe();
});
function open(ticket: Feedback) {
  target.value = structuredClone(ticket);
  text.value = "";
}
async function save(action?: "REPLY" | "CLOSE" | "REOPEN") {
  const actor = session.actor,
    captured = target.value;
  if (!actor || working.value || (action && !captured)) return;
  const command: TicketCommand = action
    ? {
        type: "TICKET_ACTION",
        entityId: captured!.id,
        expectedRevision: captured!.revision,
        commandId: crypto.randomUUID(),
        payload: { action, text: text.value },
      }
    : {
        type: "CREATE_TICKET",
        entityId: crypto.randomUUID(),
        expectedRevision: 0,
        commandId: crypto.randomUUID(),
        payload: { body: body.value },
      };
  working.value = true;
  notice.value = "";
  try {
    await appRepository.execute(command, actor, { now: businessNow });
    if (action) target.value = null;
    else body.value = "";
    await load();
    notice.value = action ? "工单已更新。" : "工单已提交。";
  } catch {
    notice.value =
      "未保存，请核对当前版本与权限。输入已保留；提交结果不确定时先刷新核对。";
  } finally {
    working.value = false;
  }
}
const date = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
</script>
<template>
  <main id="main-content" class="business-page ticket-page ui-scene ui-scene--service">
    <WorkbenchHeader>
      <template #heading="{ design }"><div>
        <p class="eyebrow">{{ design.title }}</p><h1>{{ design.headline }}</h1>
        <p>
          {{
            isAdmin
              ? "答复与跟进平台使用问题。"
              : "提交问题，查看答复与办理记录。"
          }}
        </p>
      </div></template>
      <template #actions><AppButton variant="secondary" @click="load">刷新队列</AppButton></template>
    </WorkbenchHeader>

    <div class="workbench-split workbench-body-layout"><div class="workbench-body-main">
    <p v-if="notice" role="status" class="business-notice">{{ notice }}</p>
    <p v-if="error" role="alert" class="business-notice business-error">
      {{ error }}
    </p>
    <section class="surface ticket-create">
      <h2>新建工单</h2>
      <label for="ticket-body">问题说明</label
      ><textarea
        id="ticket-body"
        class="ticket-input"
        v-model="body"
        maxlength="2000"
        :disabled="working"
        placeholder="说明遇到的问题与操作步骤，不要填写密码、证件号或敏感材料。"
      ></textarea
      ><AppButton
        :disabled="body.trim().length < 4"
        :loading="working"
        @click="save()"
        >提交工单</AppButton
      >
      <p class="caption">工单仅本人和管理员可见，不是即时聊天。</p>
    </section>
    <div class="ticket-filters">
      <label for="ticket-query">搜索工单</label
      ><input id="ticket-query" v-model="query" type="search" /><label
        for="ticket-state"
        >工单状态</label
      ><select id="ticket-state" v-model="status">
        <option value="">全部状态</option>
        <option value="open">待答复</option>
        <option value="replied">已答复</option>
        <option value="closed">已结案</option>
      </select>
    </div>
    <AppSkeleton v-if="loading" />
    <p v-else-if="!visible.length" class="business-empty">
      当前筛选下没有工单。
    </p>
    <div v-else class="ticket-list">
      <article v-for="ticket in visible" :key="ticket.id" class="surface">
        <div>
          <AppTag
            :tone="
              ticket.status === 'open'
                ? 'warn'
                : ticket.status === 'replied'
                  ? 'brand'
                  : 'success'
            "
            >{{ labels[ticket.status] }}</AppTag><time>{{
            date(ticket.updatedAt)
          }}</time>
        </div>
        <h2>{{ ticket.body }}</h2>
        <AppButton size="sm" variant="secondary" @click="open(ticket)"
          >查看工单</AppButton
        >
      </article>
    </div>
    <nav
      v-if="filtered.length"
      class="page-actions no-print"
      aria-label="工单分页"
    >
      <span>{{ filtered.length }} 项 · 第 {{ page }} / {{ pages }} 页</span
      ><AppButton
        size="sm"
        variant="secondary"
        :disabled="page === 1"
        @click="page--"
        >上一页</AppButton
      ><AppButton
        size="sm"
        variant="secondary"
        :disabled="page === pages"
        @click="page++"
        >下一页</AppButton
      >
    </nav>
    
    </div><WorkbenchGuide title="把问题说清楚，跟进更容易。" copy="说明操作步骤与遇到的问题，避免填写密码和敏感材料。答复、办理原因与历史可追溯。" /></div>
    <AppModal data-scene="service"
      :open="!!target"
      title="工单详情"
      @close="!working && (target = null)"
      ><template v-if="target"
        ><AppTag>{{ labels[target.status] }}</AppTag>
        <p class="ticket-copy">{{ target.body }}</p>
        <ol class="ticket-history">
          <li v-for="(entry, index) in target.history" :key="index">
            <strong>{{ actions[entry.action] }} · {{ date(entry.at) }}</strong>
            <p>{{ entry.text }}</p>
          </li>
        </ol>
        <p v-if="!target.history?.length && target.reply">{{ target.reply }}</p>
        <label for="ticket-reply">办理说明</label
        ><textarea
          id="ticket-reply"
          class="ticket-input"
          v-model="text"
          maxlength="2000"
          :disabled="working"
        ></textarea></template
      ><template #footer
        ><template v-if="target"
          ><AppButton
            v-if="
              isAdmin &&
              target.ownerUserId !== session.actor?.userId &&
              target.status !== 'closed'
            "
            :disabled="text.trim().length < 4"
            :loading="working"
            @click="save('REPLY')"
            >答复工单</AppButton
          ><AppButton
            v-if="
              isAdmin &&
              target.ownerUserId !== session.actor?.userId &&
              target.status === 'replied'
            "
            variant="secondary"
            :disabled="text.trim().length < 4"
            :loading="working"
            @click="save('CLOSE')"
            >结案</AppButton
          ><AppButton
            v-if="
              (!isAdmin || target.ownerUserId === session.actor?.userId) &&
              target.status !== 'open'
            "
            :disabled="text.trim().length < 4"
            :loading="working"
            @click="save('REOPEN')"
            >重开工单</AppButton
          ></template
        ></template
      ></AppModal
    >
  </main>
</template>
<style scoped>
.ticket-page {
  max-width: 1200px;
}
.ticket-create {
  display: grid;
  gap: 12px;
  padding: 24px;
  margin-bottom: 24px;
}
.ticket-create h2 {
  font-size: 20px;
}
.ticket-input {
  display: block;
  width: 100%;
  min-height: 120px;
  padding: 14px;
  font: inherit;
  border: 1px solid var(--border-control);
  border-radius: var(--r-control);
  background: var(--bg-base);
  color: var(--text-1);
  resize: vertical;
}
.ticket-filters {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
  font-size: 14px;
}
.ticket-filters input,
.ticket-filters select {
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--border-control);
  border-radius: var(--r-control);
  background: var(--surface);
  color: var(--text-1);
  font: inherit;
}
.ticket-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.ticket-list article {
  padding: 24px;
  display: grid;
  gap: 16px;
  align-content: start;
}
.ticket-list article > div {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}
.ticket-list h2 {
  font-size: 16px;
  line-height: 1.7;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ticket-list time {
  color: var(--text-3);
  font-size: 12px;
}
.ticket-copy,
.ticket-history p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 16px 0;
}
.ticket-history {
  padding-left: 20px;
}
.ticket-history strong {
  font-size: 12px;
  color: var(--text-2);
}
@media (max-width: 700px) {
  .ticket-list {
    grid-template-columns: 1fr;
  }
  .ticket-filters {
    display: grid;
    grid-template-columns: 1fr;
  }
  .ticket-list article > div {
    flex-wrap: wrap;
  }
}
</style>
