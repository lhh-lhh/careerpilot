# AI Workbench Implementation Plan

> **For agentic workers:** Use executing-plans for inline integration. No Git commits: repository has no HEAD and all original files belong to the user. 代理未实际实现，本轮由主流程完成；审查代理未给有效审查，不计独立审查通过。

**Goal:** 完成学生求职闭环和全角色受控助手，真实供应商联调与证据交付。
**Architecture:** 独立workbench网关/存储及业务服务；Vue子页面沿用现有组件；共享契约先固定，各模块按文件所有权实现。
**Tech Stack:** Vue3, TS strict, Node24, SQLite, Vitest, Playwright, DeepSeek。
**Spec:** ../specs/2026-11-15-ai-workbench-design.md

## Global Constraints
沿用spec全部约束；不改稳定演示版；不创建Git提交；密钥不落明文；无自动付费重试；本机候选版不宣称生产放行。

### Task 1: 安全网关和共享契约
Files: src/types/ai-workbench.ts, server/workbench/*.ts, server/app.ts, server/cli.ts, scripts/configure-deepseek.ps1, tests/unit/workbench-http.test.ts。
- [x] 真实HTTP隔离测试覆盖无授权/跨用户/输出异常/额度/revision及新链路；音频格式由编码单测和浏览器WAV检查覆盖，超长/错误格式已有服务端校验。
- [x] 缺路由RED→白名单地址、持久次数、归属、输出校验、流式/ASR/TTS GREEN。
- [x] 真实合成TTS→ASR/JSON/聊天/简历/Search单次成功，记录耗时，不记录凭据或正文。
- [ ] usage/金额未采集；次数额度不是货币预算。

### Task 2: 简历优化草稿
Files: src/views/student/ResumeOptimizeView.vue, src/domain/resume/optimization-draft.ts, tests/unit/optimization-draft.test.ts。
Consumes: POST generate resume -> ResumeOptimization; existing appRepository SAVE_RESUME and history。
- [x] patch接受/原文冲突与草稿隔离单测；生成source过期行为RED→GREEN。
- [x] 独立页面、原文对照、部分/全部接受、手改、撤销、一次保存、历史载入草稿、未保存离开提示。范围仅项目/实习描述。
- [x] 单测、typecheck、接线和双浏览器主流程通过。

### Task 3: 语音面试
Files: src/services/interview-audio.ts, src/views/student/VoiceInterviewView.vue, src/views/student/VoiceReportView.vue, tests/unit/interview-audio.test.ts。
Consumes: sessions CRUD、speech ASR/TTS；turn {id,question,answer,evaluation}。
- [x] WAV编码/静音检测单测；音频重复释放、撤销授权、回答保全、慢旧请求均复现后修复。
- [x] 自动停顿、手动结束、打断、纠错、文本降级、本人历史和逐轮/综合参考报告；整段ASR，评分仍串行。
- [x] 单测、typecheck、假麦克风双浏览器通过，不访问真实设备。
- [ ] 真人物理麦克风/听感/弱网/真实整场体验待用户现场验收。

### Task 4: 匹配与全局助手
Files: src/views/student/MatchResultsView.vue, src/components/business/GlobalAssistant.vue, tests/unit/workbench-client.test.ts。
Consumes: matches、chat SSE、conversations；助手无数据库写能力。
- [x] SSE分块/拒答异常/未知字段覆盖，CRLF跨chunk、薪资清空和意愿排序问题已修复。
- [x] 匹配页、来源/缺失提示、面试入口；助手历史/流式/停止/删除/角色导航，授权撤销取消。
- [x] 单测、typecheck与全局挂载通过；上下文仅页面/角色/简历摘要，不含未保存优化或特定报告全文。

### Task 5: 集成与验收
Files: src/router/index.ts, src/App.vue, existing resume/jobs/mock entry views, tests/e2e or workbench browser tests, docs/evidence/ai-workbench.md。
- [x] 子路由/按钮/全局入口接线，保留原模块，实际库无QA夹具导入。
- [x] 60文件461单测、typecheck/lint/build、120双浏览器回归通过。
- [x] 桌面/390移动端真实浏览器自动化交互、截图、无横溢出/无pageerror；Browser插件交互故障用既有Playwright验收，未声称物理麦克风通过。
- [x] 主流程安全/并发/额度自查修复，README/运行说明/证据更新，原目录保留交付，不捏造Git基线。
- [ ] 独立代码审查未获得有效结果；公网生产放行、真人彩排未完成。
