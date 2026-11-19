# 路鸣职引 · 全站 UI 升级首稿评审

更新：2026-11-17 已形成[最终设计候选 v1.0](../ui-refresh-final-2026-11-17/README.md)，整合品牌强化、显著多场景背景、全站映射与施工计划。本文件及v0.2保留作历史比较，不再作为背景强度的最终依据。

2026-11-16 · v0.1 · **待评审，未实施到应用**

方向：**灯塔·清晰工作台**。保留品牌蓝、AI 紫、现有标识与资产，通过排版、布局、信息密度、组件状态及克制动效提升观感和使用体验。

## 先看这六张

以下是静态可编辑 SVG 及其 PNG 预览，数字、姓名、岗位和服务状态均为虚构排版样例，不是应用运行截图。手机与简历桌面稿是有明确注释的布局节选；不是六张图就代表全站完成。

| 图纸 | 本次具体设计 | 预览 | 可编辑源稿 |
|---|---|---|---|
| 01 驾驶舱·深色 | 双列宽图、独立预警、全宽热力图、可读标签 | [PNG](<D:/web程序设计作业（合）/期末大作业/careerpilot/docs/design/ui-refresh-2026-11-16/01-dashboard-dark.png>) | [SVG](<D:/web程序设计作业（合）/期末大作业/careerpilot/docs/design/ui-refresh-2026-11-16/01-dashboard-dark.svg>) |
| 02 驾驶舱·浅色 | 相同结构，检查主题语义和层级 | [PNG](<D:/web程序设计作业（合）/期末大作业/careerpilot/docs/design/ui-refresh-2026-11-16/02-dashboard-light.png>) | [SVG](<D:/web程序设计作业（合）/期末大作业/careerpilot/docs/design/ui-refresh-2026-11-16/02-dashboard-light.svg>) |
| 03 简历·桌面 | 保存优先、工具完整、编辑主列、六维体检/建议辅助列 | [PNG](<D:/web程序设计作业（合）/期末大作业/careerpilot/docs/design/ui-refresh-2026-11-16/03-resume-desktop.png>) | [SVG](<D:/web程序设计作业（合）/期末大作业/careerpilot/docs/design/ui-refresh-2026-11-16/03-resume-desktop.svg>) |
| 04 简历·手机 | 390px 单列布局研究，体检/建议完整区后置 | [PNG](<D:/web程序设计作业（合）/期末大作业/careerpilot/docs/design/ui-refresh-2026-11-16/04-resume-mobile.png>) | [SVG](<D:/web程序设计作业（合）/期末大作业/careerpilot/docs/design/ui-refresh-2026-11-16/04-resume-mobile.svg>) |
| 05 窗口与组件 | 驳回材料窗、焦点/错误/禁用、AI 三类状态、动效时长 | [PNG](<D:/web程序设计作业（合）/期末大作业/careerpilot/docs/design/ui-refresh-2026-11-16/05-components-overlays-motion.png>) | [SVG](<D:/web程序设计作业（合）/期末大作业/careerpilot/docs/design/ui-refresh-2026-11-16/05-components-overlays-motion.svg>) |
| 06 公共门户 | 搜索/岗位、五项国家平台服务、三项准备、三类角色与页脚入口 | [PNG](<D:/web程序设计作业（合）/期末大作业/careerpilot/docs/design/ui-refresh-2026-11-16/06-portal-desktop.png>) | [SVG](<D:/web程序设计作业（合）/期末大作业/careerpilot/docs/design/ui-refresh-2026-11-16/06-portal-desktop.svg>) |

## 设计如何保护原业务

- 业务、权限、字段、校验、数据范围、在线/离线差异、AI 请求与结果处理不变；不引入 React 或整套模板。
- AI 授权、连接状态、当前任务分开表达；不新增每次强制确认，不通过服务标签增加按钮禁用条件。简历稿的禁用来自现有未保存条件。
- 动效只响应展示：120ms 操作反馈、200ms 状态切换、260ms 面板过渡、240ms 滚动呈现；支持减少动态效果，不滚轮劫持、不虚构进度、不触发额外 AI 请求。
- 宠物侧栏停靠仅为可选待审建议，不能自动改变原有位置、漫游与动作；素材沿用原来源许可。
- 原生 confirm 替换为自定义窗需专项确认与回归，不在首次换肤中批量替换同步行为。

完整约束见[设计规范](<D:/web程序设计作业（合）/期末大作业/careerpilot/docs/superpowers/specs/2026-11-16-full-ui-refresh-design.md>)。全站边界见[页面/动态分区/43组窗口总账](<D:/web程序设计作业（合）/期末大作业/careerpilot/docs/design/ui-refresh-2026-11-16/surface-inventory.md>)，包含历史非路由例外；清单是迁移依据，不是完成率。

## 已验证与未验证

交付前本地重渲染六张 PNG，并逐图目视检查中文、布局与标签。浅/深主题共 16 组指定文字色/背景色对比均达到 4.5:1，结果见[静态验证记录](<D:/web程序设计作业（合）/期末大作业/careerpilot/docs/design/ui-refresh-2026-11-16/design-validation.json>)。这不等同于所有图形配色、运行态或无障碍检查均合格。

[源码身份核对](<D:/web程序设计作业（合）/期末大作业/careerpilot/docs/design/ui-refresh-2026-11-16/baseline-verification.json>)对比本轮开始捕获的 185 个源文件/配置及 71 个 Vue script 区块，结果无变化、无增删。它不是备份或业务正确性证明。应用代码未实施改造，本轮未运行应用单测/E2E，也未访问真实库、凭据或发起业务 AI 请求。

## Figma 与资源状态

Figma 库发现规范使本轮先保持本地设计交付：已确认账号连接及当前 View 席位，但没有指定目标文件，尚未检查文件页面/组件库，未创建或写入云端对象。不能声称“无组件库/无冲突”或“Figma 库已完成”。本地 SVG 不具备原生 Figma 变量绑定、组件实例或可运行交互原型。

发现阶段状态：P0.a 本地源码/组件/AI 边界首轮完成；P0.b 账号已核验，目标文件待指定；P0.c 文件/库检索未执行；P0.d 本地首稿与说明已交付。后续如进入 Figma，须先指定可编辑文件或明确批准新建，再完成发现和范围确认。

amber-frontEnd 仅参考图表叙事，不复制许可不明内容；skyroc 参考令牌/变体/组件分层方法，不迁移技术栈。没有安装或运行这两个项目。本轮复用现有校园图与图标，没有新生图或付费生成。

## 本轮请确认的设计

1. 是否认可现有品牌配色下的“清晰工作台”层级、留白和控件密度？
2. 是否认可驾驶舱“两列宽图 + 全宽热力图”，以及简历“编辑优先、辅助后置”？
3. 是否认可统一窗口/组件状态与上述克制动效规范？宠物停靠作为可选单独意见。

方向确认后，继续展开企业、管理员、其他学生/辅导员页面、各子窗口和异常状态的具体图纸，再形成分批实施计划。**当前不进入应用代码改造。**

## 本地复现

在项目目录用现有 Node 环境运行，无需安装依赖：

```text
node docs/design/ui-refresh-2026-11-16/render-review.mjs
node docs/design/ui-refresh-2026-11-16/verify-protected-baseline.mjs
```

第一条仅生成本目录内图纸与静态验证记录；第二条只读检查指定源码并在本目录生成核对记录，不启动应用或访问数据库。
