# 图文资源层 Implementation Plan

> **For agentic workers:** 使用superpowers:executing-plans，在当前已授权分支串行执行，不派发子代理。用户已明确免除再次询问设计意见。

**Goal:** 在全站原功能不变的基础上增加贴切、生动、多样的图文表达并用运行证据验收。

**Architecture:** 既有Vue业务脚本冻结。生产插画本地WebP化，以全局独立CSS家族映射补标题/导航/窗体，少量template纯展示节点补岗位与入口。无媒体运行时服务。

**Tech Stack:** 现有Vue/CSS/Sharp/Vitest/Playwright；gpt-image-2.6仅开发时素材制作。

**Spec:** docs/superpowers/specs/2026-11-18-editorial-media-design.md

## Global Constraints

原路由、事件、条件、model、数据、AI调用与71个script不变；不新增依赖，不上传/发布；真实Logo只用可信授权资料，否则通用图形。用户允许自主设计和本地提交，不允许虚构真机/Figma完成。

## Task 1: 概念与生产插画

Files: work/ui-media-20261118/*.txt; outputs/ui-media-20261118/*.png; public/media/editorial/*.webp; docs/evidence/ui-refresh-2026-11-17/media-manifest.json。

- [x] 使用skill-1k生成门户/岗位/题库三幅独立概念，用view_image读取并自审文字层次、图片比例、密度、连贯性、手机适配。
- [x] 生成9主题无文字生产插画，测实际尺寸，使用sharp按严格3×3格切片为本地WebP；记录hash/来源/用途，不自动重试失败。

## Task 2: 测试先行与全站展示层

Files: tests/e2e/ui-media.spec.ts; src/styles/editorial-media.css; src/main.ts; src/components/public/OpportunityRows.vue; src/views/{PortalView,LegacyPortalView}.vue; src/views/student/InterviewPracticeView.vue; src/components/base/BrandMark.vue。

Interfaces: `.editorial-thumb`仅展示；CSS通过已有.ui-scene--*配置家族图，不读业务状态或标题猜类型。既有script不加import。

- [x] 新E2E检查岗位身份图可见、准备链接图文可辨、标题图存在、题库封面可见、深浅与320px无横溢、减少动态、图片错误不隐去文字。先在旧构建运行观察缺图失败。
- [x] `src/main.ts`仅新增`import './styles/editorial-media.css'`；纯展示CSS定义图文排版、家族图、导航图标容器、时间轴密度及窗口小图。静态图节点使用aria-hidden和pointer-events:none，不包裹原控件。
- [x] `OpportunityRows`增加通用企业视觉，Portal准备链接增加本地主题图片；题库原article增加图像框，文本按钮保持。BrandMark只精修原SVG几何/配色，不变尺寸判断/props。
- [x] build后运行新E2E及旧UI专项，发现问题写失败回归后修复呈现。

## Task 3: 视觉与业务全回归

Files: docs/evidence/ui-refresh-2026-11-17/{coverage-results.json,execution.md,ai-contract-results.md,device-results.md,visual-comparison.md,rollback.md}；audit-ui.mjs。

- [x] 比较概念与运行截图的文字/布局/配色/素材/响应式5类，逐活跃ID映射证据，缺失记录不标通过。
- [x] `npm run typecheck`; `npm run lint`; `npm run test:unit -- --maxWorkers=2`; `npm run verify:contracts`; `npm run verify:seed`; `npm run build`; `node docs/evidence/ui-refresh-2026-11-17/audit-ui.mjs`。
- [x] `npx playwright test --grep-invert PERF0 --workers=2`；先保存报告，再`npm run test:perf`，不并发两个Playwright。
- [x] 浏览器插件不可用使用项目Playwright；真机/真实200%/麦克风未测须如实列出。静态站本地预览，不触碰真实库/生产AI。
- [x] 精确stage本任务文件，检查diff后命令级身份commit；不push/部署。报告完成边界与最终应用入口。

## 最终执行核对（2026-11-18 UTC）

以上实施/自动化步骤已按本次提交完成。当前reference-fidelity设计是editorial-media的后继展示升级：Jobs/OpportunityRows精确加入两组展示import，岗位通用图已替换为语义图；不是原计划文字所述“所有script逐字不变”。素材63新+13保留，共76幅。535单元/55契约/17种子/272双浏览器/6性能及type/lint/build、源码/媒体在线核查通过，详见final-verification.json。

交付为本机4174在线版与本地保留分支，不推送、不合并。实际真机、200%工具栏缩放、麦克风/音频、Safari/Firefox、独立代码/审美验收和公网发布仍未完成；这里勾选的是如实记录这些边界的步骤，绝不代表上述项目通过。Figma可调用接口缺失，未生成原生组件库。原生/站外窗口不由本站换肤。
