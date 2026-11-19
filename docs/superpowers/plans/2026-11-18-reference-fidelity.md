# 在线参考图落实 Implementation Plan

> 使用executing-plans在现有分支串行执行。用户已批准参考图与自主实施，不派发子代理。

**Goal:** 在线应用落实用户三张参考图的通栏横幅、紧凑图文布局和多样岗位配图，扩展主要角色功能页面并验证不动AI业务。

**Architecture:** 新增本地WebP、src/presentation映射、JobArtwork纯展示组件和reference-fidelity.css；保留原业务脚本，仅精确新增展示import，模板/样式升级。

**Tech Stack:** 现有Vue/Sharp/Vitest/Playwright，skill-1k/gpt-image-2.6。

**Spec:** ../specs/2026-11-18-reference-fidelity-design.md

## Task 1: 素材与失败验证

- [x] 按参考编辑3幅独立横幅；生成24+岗位/服务/功能插画；检查实际尺寸、裁切与hash，不自动重试失败付费请求。
- [x] tests/unit/job-artwork.test.ts验证同批不同岗位图、多主题、稳定身份、不接触业务数据；先观察缺失模块失败。
- [x] tests/e2e/reference-fidelity.spec.ts验证在线门户1536通栏277横幅、六岗位双列、5服务同行、3工具同行；同页岗位图不同；练习三列/主封面、主要路由标题无遮挡和手机无溢出。旧构建先失败。

## Task 2: 参考主界面

- [x] src/presentation/job-artwork.ts提供纯函数jobArtwork(title,id,index?)与路径白名单；JobArtwork.vue只显示装饰图，不操作状态。
- [x] OpportunityRows.vue使用JobArtwork传原job.title/id和列表index；JobsView.vue在原EntityMark位置加岗位主题图，原Logo保留为小身份徽记。无企业商标伪造。
- [x] PortalView.vue/PublicHeader.vue/BrandMark.vue模板与CSS落实通栏主视觉、双列六行岗位、五列卡及横工具卡，原链接/表单事件保留。
- [x] InterviewPracticeView.vue保留四主题随机3张与原start/stop/shuffle，换封面/面试横幅/强调标题与步骤带；仅变外观不将随机主题固定为参考的三张。
- [x] Build与专项E2E，截图逐项对比参考；修可修的素材/几何/字号/溢出差异。

## Task 3: 全站推广与在线交付

- [x] reference-fidelity.css及逐页静态场景类扩展简历、优化、OCR、报告、投递、去向、企业、辅导员、管理员、服务等主要功能；不隐藏任何控件/文案。
- [x] 审计器允许精确展示import/装饰节点，所有原事件/条件/script和后端保护区仍比较；新增主要界面路由截图及差异台账。
- [x] typecheck/lint/532单元及新增测试/契约/seed/build；串行完整双浏览器与性能测试，保存原始报告。
- [x] 读取4174的runtime.js与实际portal，标题/资产加载/搜索跳转/控制台核验，确保不是4173演示版；不改在线DB/AI配置。
- [x] 精确stage/commit本任务和前轮已授权未提交文件，保留分支不推送；最终给在线入口、实际截图、测试结果及真实设备/公网与视觉必要差异。

## 最终执行核对（2026-11-18 UTC）

以上实施/自动化步骤已按本次提交完成。当前reference-fidelity设计是editorial-media的后继展示升级：Jobs/OpportunityRows精确加入两组展示import，岗位通用图已替换为语义图；不是原计划文字所述“所有script逐字不变”。素材63新+13保留，共76幅。535单元/55契约/17种子/272双浏览器/6性能及type/lint/build、源码/媒体在线核查通过，详见final-verification.json。

交付为本机4174在线版与本地保留分支，不推送、不合并。实际真机、200%工具栏缩放、麦克风/音频、Safari/Firefox、独立代码/审美验收和公网发布仍未完成；这里勾选的是如实记录这些边界的步骤，绝不代表上述项目通过。Figma可调用接口缺失，未生成原生组件库。原生/站外窗口不由本站换肤。
