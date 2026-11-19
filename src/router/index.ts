import { createRouter, createWebHashHistory } from "vue-router";
import { useSessionStore } from "../stores/session";
import { canAccessRole } from "../domain/policy/routes";
import type { Role } from "../types/identity";
import { appAiRuntime } from "../services/ai-runtime";
import { isOnline } from "../services/runtime";
import { ref } from 'vue';
export const routeLoadFailed = ref(false);
export function dismissRouteLoadError() { routeLoadFailed.value = false; }

declare module "vue-router" {
  interface RouteMeta {
    title?: string;
    roles?: Role[];
  }
}
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", component: () => import("../views/PortalView.vue"), meta: { title: "从校园出发，连接未来" } },
    { path: '/opportunities', component: () => import('../views/OpportunitiesView.vue'), meta: { title: '岗位机会' } },
    { path: '/opportunities/:id', component: () => import('../views/OpportunityDetailView.vue'), meta: { title: '岗位详情' } },
    {
      path: "/login",
      component: () => import("../views/LoginView.vue"),
      meta: { title: isOnline ? "登录工作台" : "选择演示角色" },
    },
    { path: '/register', component: () => import('../views/RegisterView.vue'), meta: { title: '注册账号' } },
    { path: '/account', component: () => import('../views/AccountStatusView.vue'), meta: { title: '我的账号', roles: ['student','company','counselor','admin'] } },
    {
      path: "/design-system",
      component: () => import("../views/DesignSystemView.vue"),
      meta: { title: "灯塔设计系统" },
    },
    {
      path: "/not-found",
      component: () => import("../views/StatusView.vue"),
      meta: { title: "未找到页面" },
    },
    {
      path: "/",
      component: () => import("../components/layout/AppShell.vue"),
      children: [
        { path: 'student/resume/preview', component: () => import('../views/student/ResumePreviewView.vue'), meta: { title: '简历预览与导出', roles: ['student'] } },
        { path: 'student/resume/suggestions', component: () => import('../views/student/ResumeView.vue'), meta: { title: '表达建议对照', roles: ['student'] } },
        { path: 'student/resume/optimize', component: () => import('../views/student/ResumeOptimizeView.vue'), meta: { title: 'AI优化简历', roles: ['student'] } },
        { path: 'student/resume/import', component: () => import('../views/student/DocumentOcrView.vue'), meta: { title: 'AI文档识别', roles: ['student'] } },
        { path: 'student/jobs/matches', component: () => import('../views/student/MatchResultsView.vue'), meta: { title: 'AI岗位匹配结果', roles: ['student'] } },
        { path: 'student/mock/voice', component: () => import('../views/student/VoiceInterviewView.vue'), meta: { title: '仿真语音面试', roles: ['student'] } },
        { path: 'student/mock/text', component: () => import('../views/student/VoiceInterviewView.vue'), meta: { title: '文字输入法面试', roles: ['student'] } },
        { path: 'student/mock/practice', component: () => import('../views/student/InterviewPracticeView.vue'), meta: { title: '题库练习', roles: ['student'] } },
        { path: 'student/mock/voice/report', component: () => import('../views/student/VoiceReportView.vue'), meta: { title: 'AI面试反馈与建议', roles: ['student'] } },
        { path: 'student/mock/feedback', component: () => import('../views/student/VoiceReportView.vue'), meta: { title: 'AI文字面试反馈', roles: ['student'] } },
        { path: 'admin/opportunities', component: () => import('../views/admin/OpportunitiesView.vue'), meta: { title: '机会来源管理', roles: ['admin'] } },
        { path: 'student/opportunities', component: () => import('../views/student/OpportunityRecordsView.vue'), meta: { title: '我的求职记录', roles: ['student'] } },
        ...(["student", "company", "counselor", "admin"] as Role[]).map(role => ({
          path: `${role}/service`, component: () => import('../views/ServiceTicketsView.vue'), meta: { title: '站内服务', roles: [role] },
        })),
        ...(["student", "company", "counselor", "admin"] as Role[]).map(
          (role) => ({
            path: `${role}/data-check`,
            component: () => import("../views/DataCheckView.vue"),
            meta: { title: "本机数据检查", roles: [role] },
          }),
        ),
        {
          path: 'admin/accounts', component: () => import('../views/admin/AccountsView.vue'), meta: { title: '账号审核', roles: ['admin'] },
        },
        {
          path: "student",
          component: () => import("../views/student/HomeView.vue"),
          meta: { title: "生涯概览", roles: ["student"] },
        },
        {
          path: "student/resume",
          component: () => import("../views/student/ResumeView.vue"),
          meta: { title: "简历工作台", roles: ["student"] },
        },
        {
          path: "student/jobs",
          component: () => import("../views/student/JobsView.vue"),
          meta: { title: "岗位匹配", roles: ["student"] },
        },
        {
          path: "student/mock",
          component: isOnline ? () => import("../views/student/VoiceInterviewView.vue") : () => import("../views/student/MockInterviewView.vue"),
          meta: { title: "模拟面试", roles: ["student"] },
        },
        {
          path: "student/mock/report",
          component: () => import("../views/student/MockReportView.vue"),
          meta: { title: "练习报告", roles: ["student"] },
        },
        {
          path: "student/applications",
          component: () => import("../views/student/ApplicationsView.vue"),
          meta: { title: "我的投递", roles: ["student"] },
        },
        {
          path: "student/destination",
          component: () => import("../views/student/DestinationView.vue"),
          meta: { title: "协议与去向", roles: ["student"] },
        },
        {
          path: "company/schedule",
          component: () => import("../views/company/ScheduleView.vue"),
          meta: { title: "面试日程", roles: ["company"] },
        },
        {
          path: "company/:section?",
          component: () => import("../views/company/WorkspaceView.vue"),
          meta: { title: "招聘工作台", roles: ["company"] },
        },
        {
          path: "counselor/dashboard",
          component: () => import("../views/counselor/DashboardView.vue"),
          meta: { title: "就业质量驾驶舱", roles: ["counselor"] },
        },
        {
          path: "counselor/support",
          component: () => import("../views/counselor/SupportView.vue"),
          meta: { title: "帮扶跟进", roles: ["counselor"] },
        },
        {
          path: "counselor/:section?",
          component: () => import("../views/counselor/StudentsView.vue"),
          meta: { title: "就业支持", roles: ["counselor"] },
        },
        {
          path: "admin/admission",
          component: () => import("../views/admin/GovernanceView.vue"),
          meta: { title: "准入与岗位审核", roles: ["admin"] },
        },
        {
          path: "admin",
          component: () => import("../views/admin/ConsoleView.vue"),
          meta: { title: "管理控制台", roles: ["admin"] },
        },
        {
          path: "forbidden",
          component: () => import("../views/StatusView.vue"),
          props: { forbidden: true },
          meta: { title: "暂无访问权限" },
        },
      ],
    },
    { path: "/:pathMatch(.*)*", redirect: "/not-found" },
  ],
  scrollBehavior: (to) => to.hash ? { el: to.hash } : ({ top: 0 }),
});
router.beforeEach(async (to, from) => {
  if (to.fullPath !== from.fullPath) appAiRuntime.cancelAll();
  const session = useSessionStore();
  await session.restore();
  if (isOnline && (to.path.endsWith('/data-check') || to.path === '/design-system')) return '/not-found';
  if (!isOnline && (['/register','/account','/admin/accounts','/admin/opportunities','/student/opportunities'].includes(to.path) || to.path.startsWith('/opportunities'))) return '/not-found';
  if (isOnline && session.actor && session.accountStatus !== 'approved' && to.path !== '/account' && to.path !== '/' && !to.path.startsWith('/opportunities')) return '/account';
  if (!to.meta.roles) return true;
  if (!session.actor)
    return { path: "/login", query: { redirect: to.fullPath } };
  if (!canAccessRole(session.actor, to.meta.roles)) return "/forbidden";
  return true;
});
router.afterEach((to) => {
  routeLoadFailed.value = false;
  document.title = `${to.meta.title ?? "就业管理与智能服务"} · 路鸣职引 CareerPilot`;
});
router.onError(() => { routeLoadFailed.value = true; });
