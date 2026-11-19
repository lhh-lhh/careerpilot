# 全站呈现覆盖总账 v0.1

状态：源码识别完成首轮，逐页设计/实现/运行验证尚未完成。路由源为 src/router/index.ts。每个编号后续必须附设计、实现、截图和回归证据；本表不以路由数或 Vue 文件数充当完成率。

通用状态 S：加载、数据、空、筛选无结果、失败、权限不足；可编辑项追加 dirty/saving/validation/conflict/recovery；AI 项追加未授权/服务不可用/生成中/取消/失败/过期/可用结果/历史来源。仅适用状态计入，不构造不可达组合。所有适用项覆盖浅/深、宽/窄屏、缩放、键盘和减少动态效果。

## A. 页面及动态分区

| ID | 角色/模式 | 路径或呈现分区 | 不可遗漏内容 |
|---|---|---|---|
| P01 | 公共/在线 | / | 搜索、校园图、岗位、国家平台服务、求职准备、来源 |
| P02 | 公共/离线 | / → LegacyPortal | 虚构岗位、搜索、准备入口、主题 |
| P03 | 公共/在线 | /opportunities | query 筛选、分页、来源/资格/更新时间 |
| P04 | 公共/在线 | /opportunities/:id | 详情、校外跳转、来源、求职准备衔接 |
| P05 | 公共/在线 | /login | 正式登录、重定向、错误与会话 |
| P06 | 公共/离线 | /login | 四角色演示身份选择，不当真实登录宣传 |
| P07 | 公共/在线 | /register 学生 | 学号、专业、届别与申请信息 |
| P08 | 公共/在线 | /register 企业 | 企业信息、审核状态 |
| P09 | 受邀员工/在线 | /register?invite&role&login | 辅导员/管理员邀请、绑定参数、失效/错误 |
| P10 | 四角色/在线 | /account | pending/rejected/approved、刷新、退出、改密码 |
| P11 | 公共 | /not-found 与兜底 | 404、返回入口 |
| P12 | 已登录 | /forbidden | 无权限、返回，不能泄露数据 |
| P13 | 离线 | /design-system | 全组件、主题、焦点、图表与窗口示例 |
| S01 | 学生 | /student | 本地完整度、任务、帮扶计划、岗位建议 |
| S02 | 学生 | /student/resume | 六类段落、附件、草稿恢复/冲突、保存/预览/打印 |
| S03 | 学生 | /student/resume/suggestions | editor/suggestions 两个 pane、策略、证据、逐条采纳 |
| S04 | 学生 | /student/resume/optimize | 外发说明、建议对照、采纳/撤销、草稿保存、版本恢复 |
| S05 | 学生 | /student/resume/import | 整文件外发警告、文件限制、识别、取消、逐页复制 |
| S06 | 学生 | /student/resume/preview | 已保存版本、PDF/预览/打印、无可导出状态 |
| S07 | 学生 | /student/jobs | 关键词/城市/行业/学历/薪资、收藏、权重、规则分 |
| S08 | 学生 | /student/jobs/matches | AI匹配结果、事实核对、来源与下一步 |
| S09 | 学生/在线 | /student/opportunities | 收藏/求职记录/准备衔接，外部机会不变本站投递 |
| S10 | 学生/在线 | /student/mock | 当前文字面试入口，独立于离线旧规则流程 |
| S11 | 学生/在线 | /student/mock/text | 准备/活动/暂停/完成、query id、历史与报告 |
| S12 | 学生/在线 | /student/mock/voice | TTS/录音/ASR/电平/纠错/自然轮换、不可安全录音 |
| S13 | 学生 | /student/mock/practice | 题库、开始确认、准备衔接、不可用 |
| S14 | 学生/离线 | /student/mock | 旧规则练习、提前结束、部分报告；不冒充真实AI |
| S15 | 学生 | /student/mock/report | 旧规则报告与新AI报告清晰区分 |
| S16 | 学生/在线 | /student/mock/voice/report | AI语音逐轮反馈、来源、历史查询/缺失 |
| S17 | 学生/在线 | /student/mock/feedback | AI文字逐轮反馈、来源、历史查询/缺失 |
| S18 | 学生 | /student/applications | query application、列表/详情、日程、意向、历史条款、时间轴 |
| S19 | 学生 | /student/destination | 协议确认、去向草稿/提交/驳回/通过、附件、历史 |
| C01 | 企业 | /company 或 overview | 招聘概览、资料维护、管线/待处理与原操作 |
| C02 | 企业 | /company/jobs | 岗位列表、编辑、提交审核/上下架等原状态操作 |
| C03 | 企业 | /company/candidates | query application、检索/阶段/排序、快照/证据/历史/动作 |
| C04 | 企业 | /company/agreements | 意向/协议、双方确认、版本和原状态操作 |
| C05 | 企业 | /company/schedule | 时间/状态筛选、日程、学生响应、反馈 |
| T01 | 辅导员 | /counselor | 学生名册、专业/届别/状态、选中学生/材料/历史 |
| T02 | 辅导员 | /counselor/review | 待审队列、通过、驳回、撤销、附件核对 |
| T03 | 辅导员 | /counselor/dashboard | 四KPI、环图/漏斗/八周/热图、预警、两种问数、打印 |
| T04 | 辅导员 | /counselor/support | 计划/复查/结案/重开、列表/状态/学生计划 |
| A01 | 管理员 | /admin | 版本、账号或离线角色、来源、计数、脱敏审计、离线复位 |
| A02 | 管理员/在线 | /admin/accounts | 审核、辅导员分配、原因、同事邀请/链接 |
| A03 | 管理员 | /admin/admission | 学生辖区交接、企业准入、岗位审核/分页/历史 |
| A04 | 管理员/在线 | /admin/opportunities | 同步限额、候选/发布差异、核实字段/说明、历史、来源 |
| X01a | 学生 | /student/service | 创建、搜索、状态、分页、详情、原角色动作 |
| X01b | 企业 | /company/service | 同上，权限保持企业本人范围 |
| X01c | 辅导员 | /counselor/service | 同上，权限保持辅导员本人范围 |
| X01d | 管理员 | /admin/service | 管理员处理、答复、结案等原动作 |
| X02a | 学生/离线 | /student/data-check | 数据检查、本人清除/整演示复位权限 |
| X02b | 企业/离线 | /company/data-check | 同路由实现，按实际角色权限 |
| X02c | 辅导员/离线 | /counselor/data-check | 同路由实现，按实际角色权限 |
| X02d | 管理员/离线 | /admin/data-check | 同路由实现，按实际角色权限 |
| H01 | 历史非路由 | src/views/WorkspaceView.vue | 早期占位实现，不激活新入口，不当当前功能页 |

## B. 子窗口、展开区与浏览器确认

| ID | 来源 | 窗口/呈现分支 | 保护点 |
|---|---|---|---|
| W01 | AppShell | 移动导航抽屉 | 全部角色菜单、语音/文字子入口、路由权限 |
| W02 | AppShell | 帮助抽屉 | 在线/离线文字、隐私/费用与功能真实说明 |
| W03 | AppShell | 清除我的本机数据确认 | 原影响范围、确认、错误 |
| W04 | AppShell | 消息中心抽屉 | 无消息、未读、标已读、通知跳转 |
| W05 | AppShell | 工作区形象抽屉 | 选图、预览、保存、取消、恢复默认、限制 |
| W06 | AiConnectionDialog | 本机连接窗口 | 配对/启用/关闭、错误，不泄露密钥 |
| W07 | AiConsentDialog | 特定调用确认窗 | 目前可达性需运行核实；不恢复旧离线回放语义 |
| W08 | GlobalAssistant | 助手窗口 | 四角色上下文、历史、来源、联网选项、停止、IME |
| W09 | AssistantPetLauncher | 动作与设置菜单 | 原资产/全部动作、大小/睡眠/暂停/漫游/拖动/键盘、许可 |
| W10 | CertificateFiles | 图片/PDF证书预览 | 页码、加载失败、下载/移除权限 |
| W11 | ResumeView | 简历版本对比 | 原版本、对照、载入语义 |
| W12 | JobsView | 匹配依据抽屉 | 规则/权重、what-if、AI解释与来源，原按钮条件 |
| W13 | JobsView | 投递确认 | 当前保存快照、授权、必填限制、重复保护 |
| W14 | ApplicationsView | 撤回投递 | 原原因/确认/状态限制 |
| W15 | ApplicationsView | 面试/意向响应 | 确认、拒绝、取消等不同文案与原因条件 |
| W16 | MockInterviewView | 提前结束旧练习 | 部分报告，不冒充完成 |
| W17 | CompanyProfileEditor | 企业资料维护 | 已核准更名限制、草稿/保存，非工商认证 |
| W18 | Company Workspace | 新增/编辑岗位 | 全部字段、时间/校验、提交审核原语义 |
| W19 | Company Workspace | 安排/调整面试 | 时间/地点/说明、原因、状态与修订 |
| W20 | Company Workspace | 取消面试 | 原原因/确认门槛 |
| W21 | Company Workspace | 记录面试结果 | 原结果/反馈/后续流转 |
| W22 | Company Workspace | 结束候选流程 | 原原因/确认/阶段限制 |
| W23 | Company Workspace | 签发录用意向 | 全部条款、有效期、快照、确认 |
| W24 | Company Workspace | 撤销录用意向 | 原原因、历史文书保留 |
| W25 | StudentsView | 驳回材料/撤销审批 | 两分支、原因5字/300上限、危险确认 |
| W26 | DashboardView | 记录行动/复查/关闭 | 三分支、时间、确认勾选 |
| W27 | SupportView | 创建/复查/结案/重开 | 四分支、原字段/原因/确认 |
| W28 | GovernanceView | 企业准入/暂停 | 岗位联动影响、原因、历史保留 |
| W29 | GovernanceView | 岗位通过/退回/下架 | 三分支、原校验与修订冲突 |
| W30 | GovernanceView | 学生辖区交接 | 原归属权限撤销、原因、在职辅导员 |
| W31 | ConsoleView | 停用账号 | 会话撤销、记录保留、本人保护 |
| W32 | ConsoleView | 复位演示环境 | 仅离线、清除影响、勾选与退出 |
| W33 | DataCheckView | 清除本人/整环境复位 | 两分支、影响、回滚，不改真实库 |
| W34 | ServiceTicketsView | 工单详情 | 历史、回复、关闭/重开等实际权限分支 |
| W35 | DesignSystemView | 展示抽屉/确认窗 | 仅离线展示，不发请求 |
| W36 | ResumeCard/PdfPreview | 简历、PDF翻页/打印 | 真实保存版本、无溢出、原导出限制 |
| W37 | OfferDocument | 当前/历史意向文书 | 版本、条款、响应/撤销，不自动覆盖 |
| W38 | DestinationHistory | 历次办理展开 | 操作人/原因/时间等原展示范围 |
| W39 | GlobalAssistant | 原生删除会话确认 | 同步确认替换需专项验证，当前不改 |
| W40 | ResumeOptimizeView | 原生重生成/保存/恢复/离开确认 | 四分支，不悄悄丢稿或自动保存 |
| W41 | VoiceInterviewView | 原生结束/删除/离开确认 | 三分支，不中断清理/修订/未提交保护 |
| W42 | InterviewPracticeView | 原生开始练习确认 | 成本与主动触发条件不变 |
| W43 | Router/App | 路由加载失败、全局toast、会话/存储警告 | 重试/登出/恢复，信息不被浮层遮挡 |

## C. 已发现需核实的差异

1. 源码仍有旧“回放/离线三态”提示，但当前真实 AI 生成严格在线。逐项核实可达性后只修正文案，不启用回放或修改调用逻辑。
2. VoiceInterview 等保留浏览器 confirm。全站视觉范围包含这些交互的方案，但在专项验证前不批量改异步应用弹窗。
3. 宠物停靠区是首稿建议，尚未实施或改变位置配置；保留已有全部动作和来源许可。
4. 通配 section、query、history、details、按钮条件不能仅靠静态清单判全；实现前还需运行遍历，新增发现补入总账，不拿当前行数宣称100%覆盖。
