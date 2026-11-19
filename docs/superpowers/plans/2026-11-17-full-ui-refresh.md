# 全站 UI/UX 视觉升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the current session. Steps use checkbox syntax for tracking. 本计划为待用户批准的施工草案；本项目默认单会话串行执行，不派发子代理。

**Goal:** 保留现有全部功能和 AI 调用契约，以显著品牌、多场景背景及统一组件完成全角色全部站内页面/窗口的视觉交互升级。

**Architecture:** 保留现有 Vue 业务组件、事件与生命周期。新增独立 CSS 背景/视觉令牌，逐页应用类名，AppOverlay 在 Teleport 自身层级渲染；只在稳定重复结构确有收益时抽取纯展示组合，不搬动业务脚本。

**Tech Stack:** Vue 3、TypeScript、Vue Router、Pinia、自研 CSS/SVG、ECharts、现有 Vitest/Playwright；不新增生产依赖。

**Spec:** `docs/superpowers/specs/2026-11-17-full-ui-refresh-final-design.md`

## Global Constraints

- 原角色、路由权限、接口、数据结构、规则、状态流转、校验、保存/导出、来源与在线/离线差异不变。
- 后端、AI 服务/适配器/契约/领域逻辑/业务 store 冻结；调用页 script 首轮冻结。超出纯展示的必要差异先说明并另获批准。
- AI 模型、提示词、参数、授权、上下文、额度、确认、重试、取消、错误处理、输出校验和来源不变。
- 保留 AppShell 现有面试专用 route.path key；不扩大 key，不新增 out-in/KeepAlive，不因主题/尺寸/窗口/动效重复挂载。
- 不读真实库/密钥，不迁移/重置真实账号，不访问生产AI，不同步来源，不部署发布，不调用付费素材/生图。
- 版本一稳定目录与 docs/baseline 不动。无初始提交，不 git add .、不 reset/checkout 全库；文件差异白名单和可恢复快照先行。
- 公共64/36px品牌、窄屏56/30px、工作台44/24px；九类背景按设计台账全覆盖，表单/表格/图表正文实底。
- 375/390/768/1024/1280/1440/1920与320 CSS px重排、200%缩放、亮暗/键盘/触摸/软键盘/减少动态/打印适用场景逐项验收。
- 浏览器原生 confirm、select面板、文件选择器及站外页面按宿主边界登记；不默默改为异步确认。
- 每任务结束提交精确文件差异供审查，用户批准版本管理后才做精确 git add/commit，不在当前未建立基线仓库擅自提交。

## 文件结构与责任

| 文件 | 处理 | 职责 |
|---|---|---|
| docs/design/ui-refresh-final-2026-11-17/* | 只读设计基线，台账另增 evidence | 图纸/令牌/54页面分区/43窗口组/验收依据 |
| src/styles/ui-scenes.css | 新增 | 九种静态背景、标题/导航/分区、减少动态/强制颜色/打印回退 |
| src/styles/tokens.css | 修改 | 批准后的次级文字/尺寸/场景令牌，旧语义色名保持 |
| src/main.ts | 精确加一行 CSS import | 不改启动、插件与挂载顺序 |
| src/components/base/{BrandMark,AppButton,AppInput,AppSelect,AppTag,AppCard,AppSkeleton,AppToast,AppOverlay,AppModal,AppDrawer}.vue | 主要template class/style | 原props、emit、原生语义、focus/busy保持 |
| src/components/public/{PublicHeader,OpportunityRows}.vue | template/style | 公共品牌、完整导航和来源明确入口 |
| src/components/layout/AppShell.vue | template class/style | 全角色导航与主区背景；业务script与现有key冻结 |
| src/views/**/*.vue | 按台账逐项template/style | 页面族布局/背景，保留原内容条件与事件 |
| src/components/business/*.vue | 按窗口清单template/style | Teleport/菜单/预览/文书/助手/宠物逐项覆盖 |
| src/components/charts/{InsightChart,RadarChart,ScoreRing}.vue | 展示差异最小化 | 文本/边界/尺寸主题适配；计算不变 |
| tests/e2e/ui-refresh-*.spec.ts、tests/unit/ui-refresh-*.test.ts | 新增 | 视觉覆盖、交互不变、AI不额外调用、生命周期与样式约束 |
| docs/evidence/ui-refresh-2026-11-17/* | 执行时新增 | 前/后/设计对照、测试报告、未测设备、窗口与状态证据 |

## Task 1: 建立可恢复版本及行为/覆盖基线

**Files:** 只读现有 src/server/gateway/app/package/tests；新增 `docs/evidence/ui-refresh-2026-11-17/baseline.md`、`tests/e2e/ui-refresh-baseline.spec.ts`、`tests/e2e/ui-refresh.helpers.ts`。快照放用户批准的项目外精确目录，不含 server-data、env、凭据、node_modules、dist、用户附件。

**Interfaces:** 消费 coverage-matrix.json 的 `pages[].id/family/context/surface/preserve` 与 `windows[].id`；产生每个ID的旧版页面/窗口、适用状态、角色/模式与请求触发映射。快照必须能恢复到独立目录且哈希一致；现有 protected-baseline 不是备份。

- [ ] 获得最终设计与执行确认；检查 git status、源哈希、原测试配置与实际隔离 fixture，不碰当前用户登录页及真实库。
- [ ] 写明确路径快照和恢复演练记录；本任务若无法证明可恢复则不开始修改源码。先记录执行前 typecheck/lint/unit/build/E2E结果，既有失败原样记录，不顺手改业务。
- [ ] 用现有演示与 createOnlineApp 隔离 fixture 捕获四角色页面/窗口；query/section/history/错误/dirty/AI分支遍历后追加台账。不得只测试路由标题。
- [ ] 添加并运行以下只读形态断言助手，后续每批复用：

```ts
// tests/e2e/ui-refresh.helpers.ts
import {expect, type Page} from '@playwright/test';
export async function assertUiFrame(page: Page) {
  const m = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    forbidden: [...document.querySelectorAll('[data-ui-decoration]')].some(el =>
      getComputedStyle(el).pointerEvents !== 'none' || el.getAttribute('aria-hidden') !== 'true'),
  }));
  expect(m.overflow).toBe(false);
  expect(m.forbidden).toBe(false);
}
export async function assertNoExtraCalls<T>(counter: () => number, action: () => Promise<T>) {
  const count = counter();
  await action();
  expect(counter()).toBe(count);
}
```

- [ ] 测试基线共享 helper 的负例：在隔离测试页面放宽于视口元素或可点击装饰，验证会失败；正常页面通过。不得为了绿灯放松检查。
- [ ] 运行：`npm run typecheck`、`npm run lint`、`npm run test:unit`、`npm run build`、`npm run test:e2e`。构建会生成已有派生文件，逐一核查其差异；在线用例只用测试内隔离 transport。失败阻断新增相关变更。
- [ ] 输出基线/快照/原行为和未覆盖分支，检查清单后再进入Task 2。

## Task 2: 背景底座、品牌与公共导航

**Files:** 创建 `src/styles/ui-scenes.css`、`tests/unit/ui-refresh-scenes.test.ts`、`tests/e2e/ui-refresh-public.spec.ts`；修改 `src/styles/tokens.css`、`src/main.ts`、`src/components/base/BrandMark.vue`、`src/components/public/PublicHeader.vue`、`src/views/PortalView.vue`、`src/views/LegacyPortalView.vue`、`src/styles/public.css`。

**Interfaces:** 页面根类 `.ui-scene` 加 `.ui-scene--campus|journey|paper|studio|pipeline|analytics|governance|service|status`；窗口同族类独立生效。优先 root 伪元素，不新增业务props/路由。CSS命名只负责显示；BrandMark保留size/wordmark/vertical原接口。

- [ ] 写失败测试：门户顶部品牌实际字标36px、徽记64px；390px字标30px，无全页横溢；原5服务/3准备/3角色入口的 href/query/hash 和原数量不变。
- [ ] 添加家族定义与只读颜色/透明度断言；创建场景 CSS。最小结构如下，其余八族按候选令牌palette及13图的原生矢量母题精确实现，不下载远程资产：

```css
.ui-scene { position:relative; isolation:isolate; min-width:0; }
.ui-scene::before {
  content:""; position:absolute; inset:0; z-index:-1;
  pointer-events:none; border-radius:20px;
  background:linear-gradient(135deg,var(--scene-a),var(--scene-b));
}
.ui-scene--campus { --scene-a:#d6e3ff; --scene-b:#c1e9e5; }
.ui-scene--paper { --scene-a:#e0e4fa; --scene-b:#ddd7ed; }
[data-theme="dark"] .ui-scene { --scene-a:#24395c; --scene-b:#194449; }
@media print { .ui-scene::before { display:none; } }
@media (forced-colors:active) { .ui-scene::before { display:none; } }
```

- [ ] 九家族不得仅换颜色：追加本地SVG航线、叠纸、声场、管线、坐标、秩序网格、航标、地形图形为CSS背景，或纯装饰节点；每页主体及纵向区块有明确色面，纸面/表格不透底。
- [ ] 修改纯品牌外观与public容器布局；宣传语独立格位，窄屏自然换行；主题图标复用AppIcon，不用字体月亮字形代替产品图标。仅调整size参数与样式，不改品牌链接条件。
- [ ] `src/main.ts`只新增 `import './styles/ui-scenes.css';`；复核导入后print/强制颜色规则优先级，不改任何启动行为。
- [ ] 运行：`npx vitest run tests/unit/contrast.test.ts tests/unit/public-resources.test.ts tests/unit/ui-refresh-scenes.test.ts`；`npx playwright test ui-refresh-public.spec.ts opportunities.spec.ts boot.spec.ts --project=msedge`。
- [ ] 对照01/02/03，记录P01/P02公共入口、320/390/1440/1920、亮暗、200%与键盘截图；所有入口能力未变才交付该批差异。

## Task 3: 基础控件、窗口与工作台框架

**Files:** 修改AppShell、AppButton/Input/Select/Card/Tag/Skeleton/Toast/Overlay/Modal/Drawer及business.css；新增 `tests/e2e/ui-refresh-overlays.spec.ts`、`tests/unit/ui-refresh-lifecycle.test.ts`。不改事件处理器/props/emits/原生type。

**Interfaces:** 复用ui-scene族CSS；AppOverlay仍接open/title/kind并emit close。若需要窗口族/尺寸，仅新增可选纯展示class接口且由现有静态调用点传入；不得根据标题文本猜业务类型，不新增watch请求。

- [ ] 写失败测试：AppOverlay包含家族色面且正文实底；focus trap、Tab/ShiftTab、Esc、mask、关闭后的焦点恢复与body滚动锁保持；loading的原按钮disabled条件相同。
- [ ] 写挂载保护测试：对同一个页面ref的主题/尺寸变化不增加mount/unmount计数；AppShell源码现有面试key表达式保持原样。测试至少包含开始输入后切主题/开帮助/缩屏再继续输入。
- [ ] 将导航连续色面/选中轨迹/文字图标、44px触点、工具换行应用到AppShell；保留原通知、授权开关、工作区图片、语音子菜单、退出和警告。
- [ ] 升级窗口头色带/正文/脚部以及全控件状态；确认danger不是品牌主按钮；长窗保留关闭可达与软键盘可滚。Teleport窗口在自身祖先配置族，不依赖页面inherit。
- [ ] 运行：`npx playwright test design-system.spec.ts help.spec.ts ai-connection.spec.ts ai-defaults.spec.ts assistant-pet.spec.ts ui-refresh-overlays.spec.ts --project=msedge`；`npx vitest run tests/unit/ui-refresh-lifecycle.test.ts tests/unit/ai-consent.test.ts tests/unit/pet-static.test.ts`。
- [ ] W01–W09/W35/W43逐项记录；W39–W42只验证原confirm分支，不替换同步逻辑。图14的全部状态在运行样页补截图，不能用静态图代替。

## Task 4: 驾驶舱与简历优先改造

**Files:** 修改 `src/views/counselor/DashboardView.vue`、`src/views/student/{ResumeView,ResumePreviewView,ResumeOptimizeView,DocumentOcrView}.vue`、相关图表展示样式与ResumeCard/PdfPreview/CertificateFiles；新增 `tests/e2e/ui-refresh-priority.spec.ts`。

**Interfaces:** 仅用已建立场景类与原控件；原数据、诊断/统计计算和handler不搬。Dashboard图表option若需改label/尺寸，精确展示diff单独审查，series/聚合/查询参数保持。

- [ ] 写失败测试：环图legend与漏斗labels在400px面板宽可见；四KPI/全部图/两种问数存在；六段编辑和全部工具入口存在，390px编辑早于诊断辅助。
- [ ] 按08/09/05图布局，实底绘图区及label对比度、全宽热图、两列宽图；不裁唯一信息。简历工具换行与草稿/保存/冲突/版本提示完整。
- [ ] 运行：`npx playwright test dashboard.spec.ts resume-studio.spec.ts draft-recovery.spec.ts certificates.spec.ts certificate-upload-race.spec.ts ui-refresh-priority.spec.ts --project=msedge`；`npx vitest run tests/unit/metrics tests/unit/resume tests/unit/resume-presentation.test.ts tests/unit/optimization-draft.test.ts`。
- [ ] 开编辑草稿/流式AI、切主题/缩屏/开窗后断言原输入及实例保留；无法证明脚本或事件不变就退回本任务修改，不进入后续。
- [ ] 登记T03、S02–S06、W10/W11/W26/W36及对应异常/深浅/打印证据。

## Task 5: 其余学生页面与AI工作区

**Files:** 修改学生Home/Jobs/MatchResults/OpportunityRecords/Applications/Destination/VoiceInterview/InterviewPractice/MockInterview/VoiceReport/MockReport，GlobalAssistant/AiConnectionDialog/AiConsentDialog/AiProvenance/OfferDocument/DestinationHistory，template/style为主；新增 `tests/e2e/ui-refresh-ai-invariants.spec.ts`。

**Interfaces:** 使用Task1的assertNoExtraCalls与现有strict-ai/online-ai隔离transport计数器；不是拦截生产请求。所有原handler、状态、mode、业务key不变。

- [ ] 在strict-ai现有fixture模式中加入下列检查；counter由测试注入transport累加，fixture内token为合成字符串，不能取用户凭据：

```ts
await assertNoExtraCalls(() => calls, async () => {
  await page.getByRole('button', {name: '切换到深色主题', exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(() => window.scrollTo(0,document.body.scrollHeight));
});
// 真正生成动作后，沿用原场景已有期望次数，而非统一假设所有动作只调一次。
```

- [ ] 测试先固定浅色主题；从ThemeToggle已核对的aria-label使用上面精确名称，对纯窗口操作加入同一计数断言，避免等待网络空闲误判生成状态查询。
- [ ] 按04/06/16与台账逐页套族；文字/语音独立，真实电平与背景区分，采纳/撤销/历史/来源/取消全部保留。S10/S14在线离线共享路径分开验。
- [ ] 运行：`npx playwright test student.spec.ts stage-two.spec.ts recruitment-supplement.spec.ts destination-history.spec.ts user-flow-fixes.spec.ts strict-ai.spec.ts online-ai.spec.ts offline-strict-ai.spec.ts workbench.spec.ts ui-refresh-ai-invariants.spec.ts --project=msedge`。
- [ ] 验授权关闭、失败、超时、取消、校验失败、过期结果、IME/快捷键、录音失败与TTS/ASR边界；真实麦克风需用户可见地授权与参与，不以合成录音冒称真机通过。
- [ ] 台账S01/S07–S19及W12–W16/W37/W38/W39–W42全部标注截图与测试，未适用状态写理由，不虚构不可达组合。

## Task 6: 企业、辅导员与管理员全部页面

**Files:** 修改company Workspace/Schedule/CompanyProfileEditor，counselor Students/Support，admin Console/Accounts/Governance/Opportunities，AccountStatusView、ServiceTicketsView、DataCheckView；新增 `tests/e2e/ui-refresh-roles.spec.ts`。

**Interfaces:** 当前section/query选中与权限判断均保持；按coverage的C/T/A/X每项记录，不能一个Workspace.vue算整角色完成。

- [ ] 写角色覆盖失败测试：每个原菜单、原action名字/启用条件与角色隔离一致；候选详情保留快照与历史，审核表格长内容不溢出，来源发布差异不被视觉简化。
- [ ] 按07/10/16图套pipeline/governance/service，表格与证据实底，所有菜单及弹窗应用同一体系；不改变选中项与业务排序。
- [ ] 运行：`npx playwright test company.spec.ts company-profile.spec.ts schedule.spec.ts offer-documents.spec.ts counselor.spec.ts support.spec.ts governance.spec.ts admin.spec.ts accounts.spec.ts invitations.spec.ts tickets.spec.ts online.spec.ts ui-refresh-roles.spec.ts --project=msedge`。
- [ ] 核查W17–W34原字段/原因字数/确认与busy限制，不能把学生驳回5字规则套到岗位或准入；离线复位测试只用隔离演示上下文。
- [ ] 核查四角色service/data-check与account分支：线上不可达不新增入口，历史H01不激活；每角色完成一批完整差异审查。

## Task 7: 身份、详情、状态页收尾与动效

**Files:** 修改Login/Register/AccountStatus/Opportunities/OpportunityDetail/Status/DesignSystem及剩余页面/窗口样式；ui-scenes.css/print.css；新增 `tests/e2e/ui-refresh-coverage.spec.ts`。

**Interfaces:** 公共头仍PublicHeader，独立身份布局；本地动效只读真实状态，不引入新生成/定时提交。装饰默认静态，减少动态模式无循环。

- [ ] 写覆盖断言：coverage中的每个活跃ID都有实现文件、实际进入方式、前后图、业务测试；对原生/站外例外要求明确宿主原因，不把undefined映射当通过。
- [ ] 按11/15/16和台账完成P03–P13与所有补漏；保留邀请query、重定向、正式/演示身份、来源和外链；print/pdf白纸与内容不变。
- [ ] 先验证静态显著变化，再加120/200/260ms反馈；不对业务RouterView加过渡包装，不卡住可点击状态；长内容自然增长，不用固定设计高度截断。
- [ ] 每个渐入先写reduced-motion和JS失败仍可见断言，再启用；若持续背景无可靠暂停/离屏实现，本次保持静态，不影响背景覆盖验收。
- [ ] 运行 `npx vitest run tests/unit/login-destination.test.ts`，以及 `npx playwright test opportunities.spec.ts invitations.spec.ts accounts.spec.ts boot.spec.ts ui-refresh-coverage.spec.ts --project=msedge`。
- [ ] 强制颜色、减少动态、打印、320px等效重排、200%缩放与实际软键盘逐项记录；页面主体/长页/窗口均有背景而非只标题角落。

## Task 8: 全量回归、真实设备与交付门槛

**Files:** 仅修复已定位的呈现回归；证据目录内 `coverage-results.json`、`ai-contract-results.md`、`visual-comparison.md`、`device-results.md`、`rollback.md`。若发现业务bug不顺手修，报告并单独授权。

**Interfaces:** 每ID记录 `design/implementation/before/after/behavior/theme/viewport/states/exceptions/reviewer`；空值不算通过。角色×状态×模式是适用矩阵，不把所有排列机械地声明已测。

- [ ] 执行 `npm run typecheck`、`npm run lint`、`npm run test:unit`、`npm run verify:contracts`、`npm run verify:seed`、`npm run build`、`npm run test:e2e`；确认脚本不访问真实库或外部服务后才运行。既有失败与新增失败分开报告。
- [ ] 执行 `npm run test:perf`，保留同机30样本/生产构建前后对照，不放宽现有阈值。不自动执行test:load:online或gateway/live脚本，以免接触真实配置/额度。
- [ ] 四角色隔离业务闭环、所有窗口按钮、危险取消与确认、权限负测、AI边界和source/script/template事件差异逐条复核。原完整source哈希此时预期有展示变更；不能继续要求unchanged=true来掩盖UI修改，保护业务脚本/配置单独比对。
- [ ] 在真实安卓/iOS测试触摸、键盘遮挡、录音/播放、旋转；Edge/Chromium桌面弱网/断网/缩放/长内容；没有设备的条目必须标未测并在交付前明确补验安排。
- [ ] 用户同屏比较门户品牌、九家族背景、驾驶舱、简历和各角色全页/子窗截图，确认“明显提升”，不得把自动化截图差值当美观分数。
- [ ] 任一新增业务/AI回归、漏页、遮挡、数据丢失或付费生成异常均阻断交付，修复或仅回退本任务精确差异；保留用户其他变更。
- [ ] 最终报告区分：完成/未完成、已测/未测、Figma状态、真实API费用授权与结果、宿主不可控例外、许可限制。由用户决定进入发布；不自动部署。

## 执行门槛与当前状态

原始计划制定时尚未执行；16张是静态代表稿，54/43是设计映射而非完成率。设计阶段源码185文件/71script身份未变，不等于功能已回归。

按设计技能保留最终确认门槛：用户确认候选设计后，采用当前会话的 executing-plans 分批执行，先Task1。Figma浏览器读取超时不是原生Design库完成；后续恢复后另核验旧Make任务，不重复提交、不导入真实业务文件、不覆盖现有云端项目。

### 执行补记：2026-11-17用户授权提交后

用户已批准正式施工和先提交再开发。现已建立初始提交`f67b540`、625文件精确恢复副本，并在`ui-refresh-20261117`分支实施首批品牌/九场景/页面根类/简历及驾驶舱布局/共享浮层样式；没有上传或部署。最新190项双浏览器E2E、532单元、契约/种子及6项性能通过；71个Vue script与业务冻结区未变。

上述各任务复选框仍保留未完成，因代表性改造和测试不能替代逐ID/逐状态完整验收；本批测试集中在`ui-refresh.spec.ts`及`ui-refresh-ai-invariants.spec.ts`，没有假称所有计划中拟定文件均已创建。后续依据`docs/evidence/ui-refresh-2026-11-17/execution.md`和coverage-results.json补齐控件、各窗口分支、真机/Figma及三方图证；不是全站最终完成。
