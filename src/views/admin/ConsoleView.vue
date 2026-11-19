<script setup lang="ts">
import WorkbenchHeader from "../../components/presentation/WorkbenchHeader.vue";
import { onMounted, ref, shallowRef } from "vue";
import { useRouter } from "vue-router";
import AppButton from "../../components/base/AppButton.vue";
import AppIcon from "../../components/base/AppIcon.vue";
import AppModal from "../../components/base/AppModal.vue";
import AppSkeleton from "../../components/base/AppSkeleton.vue";
import AppTag from "../../components/base/AppTag.vue";
import { appRepository, ensureDatabase } from "../../services/app-services";
import { useSessionStore } from "../../stores/session";
import type { Role } from "../../types/identity";
import { isOnline } from "../../services/runtime";
import { api } from "../../adapters/repository/http";

const session = useSessionStore();
const router = useRouter();
const data = shallowRef<Awaited<
  ReturnType<typeof appRepository.readAdminConsole>
> | null>(null);
const loading = ref(true);
const error = ref("");
const resetOpen = ref(false);
const resetConfirmed = ref(false);
const working = ref(false);
type Account = { id: string; login: string; displayName: string; role: Role; active: boolean; accountStatus: 'pending' | 'approved' | 'rejected' };
const accounts = ref<Account[]>([]), accountTarget = ref<Account | null>(null);
async function updateAccount(user: Account) {
  working.value = true;
  try {
    accounts.value = await api<Account[]>("/api/admin/users", { userId: user.id, active: !user.active });
    accountTarget.value = null;
    await load();
  } catch { error.value = "账号状态未更新，请检查连接后重试。"; }
  finally { working.value = false; }
}

async function load() {
  if (!session.actor) return;
  loading.value = true;
  error.value = "";
  try {
    await ensureDatabase();
    data.value = await appRepository.readAdminConsole(session.actor);
    if (isOnline) accounts.value = await api<Account[]>("/api/admin/users");
  } catch {
    error.value = "管理数据暂时无法读取，请检查连接后重试。";
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function exportAudit() {
  if (!session.actor) return;
  try {
    const audit = await appRepository.exportRedactedAudit(session.actor);
    const blob = new window.Blob([JSON.stringify(audit, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `careerpilot-audit-${audit.exportedAt.slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch {
    error.value = "脱敏审计暂时无法导出，请重新验证管理员身份。";
  }
}

async function switchRole(role: Role) {
  session.enter(role);
  await router.push(
    role === "student"
      ? "/student"
      : role === "company"
        ? "/company"
        : role === "counselor"
          ? "/counselor/dashboard"
          : "/admin",
  );
}

async function resetDemo() {
  if (!session.actor || !resetConfirmed.value) return;
  working.value = true;
  try {
    await appRepository.resetDemo(session.actor);
    resetOpen.value = false;
    await session.logout();
    await router.push("/login");
  } catch {
    error.value = "演示环境复位失败，原有数据不会被部分覆盖。";
  } finally {
    working.value = false;
  }
}

const roleMeta: { role: Role; label: string; description: string }[] = [
  { role: "student", label: "学生", description: "简历、匹配、练习与去向" },
  { role: "company", label: "企业", description: "岗位、候选人与协议" },
  { role: "counselor", label: "辅导员", description: "审核、驾驶舱与帮扶" },
  { role: "admin", label: "管理员", description: "版本、来源、审计与复位" },
];
</script>

<template>
  <main id="main-content" class="business-page admin-page ui-scene ui-scene--governance">
    <WorkbenchHeader>
      <template #heading><div>
        <p>{{ isOnline ? '平台治理控制台' : '本机治理控制台' }} · 仅管理员</p>
        <h1>{{ isOnline ? '平台运行与账号治理' : '让演示环境透明、可追溯、可复位。' }}</h1>
        <p>这里不读取完整简历或附件，只展示运行版本、数据来源与脱敏审计投影。</p>
      </div></template>
      <template #actions><AppButton variant="secondary" @click="exportAudit"
        ><AppIcon name="upload" :size="16" />导出脱敏审计</AppButton
      ></template>
    </WorkbenchHeader>
    <p v-if="error" class="business-notice business-error" role="alert">
      {{ error }}
    </p>
    <AppSkeleton v-if="loading" />
    <template v-else-if="data">
      <section class="version-band" aria-label="系统版本">
        <div><strong>Schema {{ data.versions.schema }}</strong><span>数据结构契约</span></div>
        <div v-if="!isOnline"><strong>Seed {{ data.versions.seed }}</strong><span>演示种子版本</span></div>
        <div><strong>Algorithm {{ data.versions.algorithm }}</strong><span>算法口径版本</span></div>
        <p v-if="!isOnline">固定虚构种子</p>
      </section>

      <div class="admin-grid">
        <section v-if="isOnline" class="admin-section roles-section">
          <header><div><h2>账号管理</h2><p>停用将立即撤销登录会话。</p></div><AppIcon name="people" /></header>
          <ul class="account-list">
            <li v-for="user in accounts" :key="user.id">
              <span><b>{{ user.displayName }}</b><small>{{ user.login }} · {{ roleMeta.find(r => r.role === user.role)?.label }}</small></span>
              <AppTag :tone="!user.active || user.accountStatus === 'rejected' ? 'danger' : user.accountStatus === 'pending' ? 'warn' : 'success'">{{ !user.active ? '已停用' : user.accountStatus === 'pending' ? '待审核' : user.accountStatus === 'rejected' ? '未通过' : '正常' }}</AppTag>
              <AppButton size="sm" variant="secondary" :disabled="user.accountStatus !== 'approved' || user.id === session.actor?.userId || working" @click="user.active ? accountTarget = user : updateAccount(user)">{{ user.active ? '停用' : '启用' }}</AppButton>
            </li>
          </ul>
        </section>
        <section v-else class="admin-section roles-section">
          <header><div><h2>角色模拟</h2><p>切换只改变演示身份，不赋予真实组织权限。</p></div><AppIcon name="people" /></header>
          <div class="role-list">
            <button v-for="item in roleMeta" :key="item.role" :disabled="item.role === 'admin'" @click="switchRole(item.role)">
              <AppIcon :name="item.role" :size="20" /><span><b>{{ item.label }}</b><small>{{ item.description }}</small></span><AppIcon name="chevron" :size="14" />
            </button>
          </div>
        </section>

        <section class="admin-section source-section">
          <header><div><h2>数据来源</h2><p>{{ isOnline ? '服务端持久保存，按账号权限提供数据。' : '所有业务数据均在当前浏览器本机运行。' }}</p></div><AppIcon name="lock" /></header>
          <dl>
            <div><dt>业务存储</dt><dd>{{ data.sources.storage }}</dd></div>
            <div v-if="!isOnline"><dt>演示种子</dt><dd>内置固定数据，内容全部虚构</dd></div>
            <div><dt>智能默认态</dt><dd>{{ data.sources.aiMode }}</dd></div>
            <div><dt>上游密钥</dt><dd>不进入网页或导出文件</dd></div>
          </dl>
        </section>

        <section class="admin-section counts-section">
          <header><div><h2>{{ isOnline ? '业务实体概览' : '本机实体概览' }}</h2></div><AppIcon name="chart" /></header>
          <div class="count-grid">
            <div><strong>{{ data.counts.students }}</strong><span>学生</span></div>
            <div><strong>{{ data.counts.companies }}</strong><span>企业</span></div>
            <div><strong>{{ data.counts.jobs }}</strong><span>岗位</span></div>
            <div><strong>{{ data.counts.applications }}</strong><span>投递</span></div>
            <div><strong>{{ data.counts.destinations }}</strong><span>去向</span></div>
            <div><strong>{{ data.counts.auditLogs }}</strong><span>审计事件</span></div>
          </div>
        </section>

        <section class="admin-section audit-section">
          <header><div><h2>最近脱敏审计</h2><p>标识符已转为稳定引用，自由文本和命令信息不进入视图。</p></div><AppTag tone="success">已脱敏</AppTag></header>
          <div class="audit-table-wrap">
            <table>
              <thead><tr><th>序号</th><th>时间</th><th>对象</th><th>动作</th><th>结果状态</th></tr></thead>
              <tbody>
                <tr v-for="row in data.recentAudit" :key="row.sequence">
                  <td class="data-number">{{ row.sequence }}</td><td>{{ row.at.slice(0, 16).replace('T', ' ') }}</td><td>{{ row.entityRef }}</td><td>{{ row.action }}</td><td>{{ row.after?.status ?? row.after?.result ?? '已记录' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ol class="mobile-audit" aria-label="最近脱敏审计记录">
            <li v-for="row in data.recentAudit" :key="`mobile-${row.sequence}`">
              <strong>审计 #{{ row.sequence }}</strong>
              <dl>
                <div><dt>时间</dt><dd>{{ row.at.slice(0, 16).replace('T', ' ') }}</dd></div>
                <div><dt>对象</dt><dd>{{ row.entityRef }}</dd></div>
                <div><dt>动作</dt><dd>{{ row.action }}</dd></div>
                <div><dt>结果</dt><dd>{{ row.after?.status ?? row.after?.result ?? '已记录' }}</dd></div>
              </dl>
            </li>
          </ol>
        </section>
      </div>

      <section v-if="!isOnline" class="reset-zone">
        <div><AppIcon name="warning" /><span><h2>演示复位</h2><p>清除当前浏览器里的全部修改，恢复固定虚构种子、REPLAY 默认态与固定时钟。</p></span></div>
        <AppButton variant="danger" @click="resetOpen = true">复位演示环境</AppButton>
      </section>
    </template>

    <AppModal data-scene="governance" :open="!!accountTarget" title="确认停用账号" @close="accountTarget = null">
      <p>停用 {{ accountTarget?.displayName }}（{{ accountTarget?.login }}）后，该账号将立即退出，业务记录仍保留。之后可以重新启用。</p>
      <template #footer><AppButton variant="secondary" @click="accountTarget = null">取消</AppButton><AppButton variant="danger" :loading="working" @click="accountTarget && updateAccount(accountTarget)">确认停用</AppButton></template>
    </AppModal>
    <AppModal data-scene="governance" :open="resetOpen" title="复位整个演示环境" @close="resetOpen = false">
      <div class="reset-confirm"><p>此操作会清除本机已修改的简历、投递、去向、帮扶与审计记录。完成后将退出当前身份。</p><label><input v-model="resetConfirmed" type="checkbox" />我理解本机修改将被清除</label></div>
      <template #footer><AppButton variant="secondary" @click="resetOpen = false">取消</AppButton><AppButton variant="danger" :disabled="!resetConfirmed" :loading="working" @click="resetDemo">确认复位</AppButton></template>
    </AppModal>
  </main>
</template>

<style scoped>
.account-list{display:grid;gap:12px;list-style:none;padding:0;max-height:440px;overflow:auto}.account-list li{display:flex;gap:12px;align-items:center;padding-bottom:12px;border-bottom:1px solid var(--border)}.account-list li>span{display:grid;gap:4px;flex:1;min-width:0}.account-list small{font-size:12px;color:var(--text-2)}
.admin-page{max-width:1400px}.admin-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:32px;margin-bottom:28px;padding-bottom:28px;border-bottom:1px solid var(--border)}.admin-heading>div{max-width:720px}.admin-heading h1{font-size:32px;line-height:1.35;margin:8px 0 12px}.admin-heading p{font-size:13px;color:var(--text-2)}.admin-heading>div>p:first-child{font:12px var(--font-mono);color:var(--brand-text)}.version-band{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;border:1px solid var(--border);background:var(--surface);margin-bottom:20px}.version-band div{display:flex;align-items:baseline;gap:10px;padding:16px 20px;border-right:1px solid var(--border)}.version-band span{font-size:12px;color:var(--text-3)}.version-band strong{font:600 16px var(--font-mono)}.version-band p{align-self:center;padding:0 20px;color:var(--success-text);font-size:12px}.admin-grid{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:20px}.admin-section{background:var(--surface);border:1px solid var(--border);padding:24px}.admin-section>header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:20px}.admin-section h2{font-size:18px}.admin-section header p{font-size:12px;color:var(--text-3);margin-top:6px}.admin-section>header>svg{color:var(--brand-text)}.role-list{display:grid}.role-list button{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;width:100%;padding:15px 0;border:0;border-bottom:1px solid var(--border);background:transparent;color:var(--text-1);text-align:left}.role-list button:not(:disabled):hover{color:var(--brand-text)}.role-list button:disabled{color:var(--text-3);cursor:default}.role-list button>span{display:grid;gap:4px}.role-list b{font-size:14px}.role-list small{font-size:11px;color:var(--text-3)}.source-section dl{display:grid}.source-section dl>div{display:flex;justify-content:space-between;gap:20px;padding:14px 0;border-bottom:1px solid var(--border);font-size:13px}.source-section dt{color:var(--text-3)}.source-section dd{text-align:right}.count-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border)}.count-grid div{display:grid;gap:8px;padding:18px;background:var(--surface)}.count-grid strong{font:600 24px var(--font-mono)}.count-grid span{font-size:11px;color:var(--text-3)}.audit-section{grid-column:1/-1}.audit-table-wrap{overflow:auto}.audit-section table{width:100%;border-collapse:collapse;font-size:12px;text-align:left}.audit-section th{padding:10px 12px;color:var(--text-3);font-weight:500;border-bottom:1px solid var(--border)}.audit-section td{padding:13px 12px;border-bottom:1px solid var(--border);white-space:nowrap}.mobile-audit{display:none}.reset-zone{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-top:20px;padding:24px;border:1px solid var(--danger-text);background:var(--danger-soft)}.reset-zone>div{display:flex;gap:16px;align-items:flex-start}.reset-zone svg{color:var(--danger-text);flex:none}.reset-zone h2{font-size:16px;color:var(--danger-text)}.reset-zone p{font-size:12px;color:var(--text-2);margin-top:6px}.reset-confirm{display:grid;gap:20px;font-size:14px;line-height:1.8}.reset-confirm label{display:flex;gap:10px;align-items:flex-start}.reset-confirm input{margin-top:6px}@media(max-width:900px){.admin-grid{grid-template-columns:1fr}.audit-section{grid-column:auto}.version-band{grid-template-columns:1fr 1fr}.version-band p{padding:16px 20px;border-top:1px solid var(--border)}}@media(max-width:767px){.admin-heading{display:grid;align-items:start}.admin-heading h1{font-size:24px}.version-band{grid-template-columns:1fr}.version-band div{border-right:0;border-bottom:1px solid var(--border)}.count-grid{grid-template-columns:1fr 1fr}.audit-table-wrap{display:none}.mobile-audit{display:grid;gap:12px;list-style:none}.mobile-audit li{padding:14px;border:1px solid var(--border);background:var(--surface-2)}.mobile-audit strong{font:600 13px var(--font-mono);color:var(--text-1)}.mobile-audit dl{display:grid;gap:8px;margin-top:12px}.mobile-audit dl>div{display:grid;grid-template-columns:48px minmax(0,1fr);gap:10px;font-size:12px}.mobile-audit dt{color:var(--text-3)}.mobile-audit dd{min-width:0;overflow-wrap:anywhere;text-align:right;color:var(--text-2)}.reset-zone{display:grid}.admin-section{padding:20px}}
</style>
