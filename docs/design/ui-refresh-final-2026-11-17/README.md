# 路鸣职引 · 全站 UI/UX 升级最终设计候选 v1.0

2026-11-17 · **最终评审与施工准备包，待确认执行；未修改应用。**

方向：**灯塔·多场景全站界面**。在已认可的布局上强化品牌与全区背景，保持全部功能、权限、数据、业务及 AI 调用契约。此前 v0.1/v0.2 保留作比较，不再作为背景强度的最终依据；冲突处以本设计规范为准。

## 本轮具体收敛

1. 门户徽记64px，中文名称36px/700、品牌蓝；英文14px，宣传语17px独立排列。窄屏采用56/30px并自然换行，工作台44/24px，不挤压任务与导航。
2. 背景由零散浅渐变改为覆盖主内容与长页分区的大面积色面，配航线、叠纸、声场、管线、坐标、秩序网格、航标与地形。内容表面保持实底；不是每页贴同一张图或只换一种底色。
3. 公共、学生、企业、辅导员、管理员、身份、详情/报告、服务/状态与导航/帮助/AI窗口均有设计映射。驾驶舱宽图、简历编辑优先、全部原入口和按钮条件保留。
4. 背景之外同时升级字体、图标、控件、表格、提示、窗口、焦点、触摸与适量动效；动效不触发业务、不重挂载活动任务。

## 评审入口

- [完整设计规范与边界](../../superpowers/specs/2026-11-17-full-ui-refresh-final-design.md)
- [逐批施工计划](../../superpowers/plans/2026-11-17-full-ui-refresh.md)
- [54项页面/分区＋43组窗口逐项映射](coverage-matrix.md)（含1项不激活的历史页面，不是实施完成率）
- [本地全图浏览索引](index.html)
- [候选令牌](design-tokens.final-candidate.json) / [静态校验报告](design-validation.json) / [交付文件自检](handoff-check.json)

图纸为静态 PNG 与可编辑 SVG；岗位、姓名、数值、状态和文案中的说明均为合成排版样例，不是产品运行截图、实际 AI 结果或真实业务数据。细节图展示结构，不代表删除未画出的原字段。16张是代表性组合设计，不冒称每条路由/每个状态都已逐像素绘制；全部页面的结构/背景/保护项已分配，执行时逐ID补实际截图验收。

| 图纸 | 重点 | PNG | SVG |
|---|---|---|---|
| 01 门户浅色 | 显著品牌、原分区顺序、多段背景、完整入口 | [查看](01-portal-light.png) | [编辑源稿](01-portal-light.svg) |
| 02 门户深色 | 同结构主题适配 | [查看](02-portal-dark.png) | [编辑源稿](02-portal-dark.svg) |
| 03 门户390px | 完整分区的手机重排 | [查看](03-portal-mobile.png) | [编辑源稿](03-portal-mobile.svg) |
| 04 学生概览 | 旅程背景、任务/计划/建议层次 | [查看](04-student-home.png) | [编辑源稿](04-student-home.svg) |
| 05 简历编辑 | 叠纸背景、编辑优先、体检/建议 | [查看](05-resume-editor.png) | [编辑源稿](05-resume-editor.svg) |
| 06 面试工作区 | 深色声场、问题/输入优先 | [查看](06-interview-studio.png) | [编辑源稿](06-interview-studio.svg) |
| 07 企业候选人 | 招聘管线、列表/详情/证据 | [查看](07-company-candidates.png) | [编辑源稿](07-company-candidates.svg) |
| 08 驾驶舱浅色 | 宽图、完整标签、全宽热图、坐标背景 | [查看](08-dashboard-light.png) | [编辑源稿](08-dashboard-light.svg) |
| 09 驾驶舱深色 | 同结构主题适配 | [查看](09-dashboard-dark.png) | [编辑源稿](09-dashboard-dark.svg) |
| 10 治理审核 | 秩序网格、实底证据、原操作 | [查看](10-governance.png) | [编辑源稿](10-governance.svg) |
| 11 公共机会发现 | 公共头、检索/来源/详情入口 | [查看](11-opportunity-discovery.png) | [编辑源稿](11-opportunity-discovery.svg) |
| 12 窗口与导航帮助 | 六类窗口标题背景与实底正文 | [查看](12-overlays-navigation-help.png) | [编辑源稿](12-overlays-navigation-help.svg) |
| 13 九类背景总览 | 每类图形母题与适用页面 | [查看](13-background-atlas.png) | [编辑源稿](13-background-atlas.svg) |
| 14 控件与动效 | 按钮/焦点/错误/状态/减少动态 | [查看](14-components-motion-states.png) | [编辑源稿](14-components-motion-states.svg) |
| 15 身份入口 | 独立登录/注册/邀请布局 | [查看](15-identity-entry.png) | [编辑源稿](15-identity-entry.svg) |
| 16 详情报告与状态 | 文书、报告、服务、空/错/权限 | [查看](16-details-reports-service-status.png) | [编辑源稿](16-details-reports-service-status.svg) |

## 覆盖边界不能含糊

站内可控的页面、子页面、同站跳转窗口、弹窗、抽屉、菜单、导航、帮助/指引/消息、预览外框、提示与状态全部纳入；Teleport窗口在自身层级渲染，不能只给父页面铺背景。

站外国家平台/招聘网站、系统文件选择框、浏览器confirm/原生select展开面板、内置PDF工具条由宿主控制，本站CSS不能改造。W39–W42原生confirm继续保留同步语义，定制替换须专项批准验证；不把它们伪称已换肤。打印和简历/意向文书内页保持原白纸内容，不把背景装饰污染导出。

## Figma 状态

[用户现有 Make 文件](https://www.figma.com/make/NIFIpOIrWYCf0yCrv07sZn/Bootstrap-and-Verify-Deployment)已定位。此前官方会话接口明确不支持 Make 文件类型，已通过Edge提交过独立样稿任务；本轮Edge读取仍超时，未重发请求，结果未核验。未创建/覆盖原生Design组件库，也未把旧云端任务当作完成证据。

Figma技能要求先发现现有组件/变量/字体再写入，因此没有可用Design目标和映射时不绕过门槛。本地SVG是可编辑设计源，但不具有已验证的Figma组件实例/变量绑定。连接恢复后先核实旧任务、目标权限和文件差异，云端仅使用设计材料与合成内容，不上传数据库/密钥；新增导入或覆盖另行确认范围。

## 实施与验收

批准后按当前会话分批执行：可恢复基线 → 品牌/场景底座/公共门户 → 控件与全局窗口 → 驾驶舱和简历 → 其余学生/AI → 企业/辅导员/管理员 → 身份/状态/补漏 → 全量验收。每批按清单勾选，不以“通用组件已改”直接推定全站完成。

每批同时检查源码/模板事件差异、角色闭环、AI触发次数与取消异常、深浅主题、键盘/手机/缩放/减少动态、打印和性能。真实API费用与设备验证单列；外部API不确定性不是可以改动原调用链路的理由。

本轮仅运行设计渲染与静态/源码身份检查，未执行应用单元/E2E/构建/性能测试，未发起业务AI、新生图、来源同步、数据库操作或发布。185个源文件/配置与71个Vue script区块身份核对未变，见[核对记录](../ui-refresh-2026-11-16/baseline-verification.json)；这不是备份或功能正确性证明。

## 本地复现

在careerpilot目录运行，无需新依赖：

```text
node docs/design/ui-refresh-final-2026-11-17/render-final.mjs
node docs/design/ui-refresh-final-2026-11-17/verify-final.mjs
node docs/design/ui-refresh-2026-11-16/verify-protected-baseline.mjs
```

只生成设计目录中的图纸/报告并只读检查指定源码。旧首稿不覆盖，稳定版不修改。最终确认问题：是否将本包作为正式执行的视觉和覆盖基线？
