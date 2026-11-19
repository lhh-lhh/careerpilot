# 招聘补充 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:dispatching-parallel-agents for independent domains; keep file ownership separate and integrate with verification checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking.

执行记录：代理未产生有效代码/评审，任务已收回由主代理完成，不再重复派发。软件验收通过，实际学生投递因缺少本人教育经历待本人填写，不能标记为实际全链已完成。完成证据见`docs/evidence/recruitment-supplement-progress.md`。

最终检查：Task1/2/3软件功能完成；Task4企业与3岗位/收藏完成，实际投递待本人资料；Task5主代理代码复核、472单测/134双浏览器E2E、typecheck/lint/build及实际库完整性验证通过。证书上传异步旧草稿问题已先失败后修复。下列原始实施清单保留过程描述，以证据记录为实际状态；不将尚缺的实际投递记作完成。最终交付包`artifacts/recruitment-supplement-final/careerpilot-source.zip`。

**Goal:** 落实六项补充，新增当前平台试运行企业与岗位，关联现有学生并验证真实权限和同步。

**Architecture:** 保留Vue/SQLite现有业务命令与SSE架构；独立筛选/模板、证书、AI前端任务并行，主代理负责企业/实际数据/集成。企业资料编辑通过受权业务命令实现；不通过直接SQL绕过审核。

**Tech Stack:** Vue3, TypeScript strict, Pinia, Node24, SQLite, Vitest, Playwright.

**Spec:** docs/superpowers/specs/2026-11-15-recruitment-supplement-design.md

## Global Constraints

- 保留原五账号、原企业及资料；写实际库前进行SQLite一致性备份。
- 当前仓库develop无HEAD：不创建初始提交、worktree或重置。以工作记录与源码文件审查替代Git提交审查。
- 使用apply_patch编辑。不修改兄弟稳定版，不泄露key或密码，不自动重试付费生成。
- 测试使用独立临时数据库，实际服务只通过正常权限/业务命令推进试运行。
- 不伪造学生履历、真实工商认证、签约或就业证明。

---

### Task 1: 岗位筛选、图文导航、练习模板

**Files:** src/views/student/JobsView.vue, src/components/layout/AppShell.vue, src/views/student/MockInterviewView.vue; new src/domain/jobs/filtering.ts, src/data/reference/cities.ts, src/data/interview-templates.ts; tests/unit/job-filtering.test.ts, tests/e2e/recruitment-supplement.spec.ts.

**Interfaces:** 筛选消耗现有Job/companies与字典；导出纯函数 `filterJobs(jobs, filters, companyLabel): Job[]`，`filters`含query/cityId/salaryMin/salaryMax/negotiableOnly。城市参考目录包含稳定id/code/label，旧3个id不变。匹配结果可以为空，岗位列表不依赖它。

- [ ] 写失败测试：无匹配结果仍展示所有jobs、关键词企业命中、区间相交、面议、上下限无效、全国城市能在界面选择；模板在jobs为空时能打开练习。

```ts
expect(filterJobs([jobShanghai, jobBeijing], {}, label).map(j => j.id)).toEqual(['sh', 'bj']);
expect(filterJobs([jobShanghai], {salaryMin:15000}, label)).toEqual([]); // fixture salary 8000–12000
```

- [ ] 运行 `npx vitest run tests/unit/job-filtering.test.ts`，记录真实失败。
- [ ] 实现纯筛选并接入页面，结果保留可空match；模板只去语音入口不写jobs；侧栏中宽图文保留。AI顶部状态由主代理整合，避免与Task3重叠。
- [ ] 运行定向测试及typecheck；Browser检查桌面/移动的筛选与模板。
- [ ] 写完成说明与测试结果，不提交Git。

### Task 2: 简历证书与投递快照附件权限

**Files:** src/types/entities.ts, src/services/repository.ts, src/views/student/ResumeView.vue, src/views/company/WorkspaceView.vue; related resume validation/schema if needed; tests/unit/certificate-attachments.test.ts and existing draft tests.

**Interfaces:** certificate adds optional `description?: string; attachmentIds?: string[]`; existing addAttachment/readAttachment APIs unchanged. Company receives only snapshot-referenced file download permission for its own received applications.

- [ ] 写失败行为测试：本人保存说明与附件能版本化；引用他人文件拒绝；企业投递前/无关申请不能读，投递快照引用后可读，其他本人文件仍不可读。

```ts
await expect(repo.readAttachment(otherCompany, certificate.id)).rejects.toMatchObject({code:'FORBIDDEN'});
```

- [ ] 运行定向Vitest并记录失败；修改最小权限/校验和UI上传、下载、移除引用、错误提示。
- [ ] 验证无附件旧简历兼容，保留草稿/版本/冲突与2MiB及magic校验；运行定向测试、typecheck。
- [ ] 自查并报告，不改其他任务拥有的文件，不提交Git。

### Task 3: 全部AI入口默认授权

**Files:** src/composables/useBusinessAi.ts, GlobalAssistant.vue, ResumeOptimizeView.vue, VoiceInterviewView.vue, MatchResultsView.vue, new src/services/ai-consent.ts if useful; tests/unit/ai-consent.test.ts and tests/e2e/workbench.spec.ts, online-ai.spec.ts.

**Interfaces:** 默认启用的会话级共享state（无需持久化敏感内容），显式关闭中止在途stream/录音；请求仍带consent:true，保留prepare票据；旧业务AIprepare后直接confirm，不要求对话框。

- [ ] 失败测试捕捉点击即生成、没有重复checkbox/confirm、关闭阻止生成、撤销停止、无页面加载自动调用；测试真实行为而非源码文字。
- [ ] 运行定向测试记录失败，实现默认授权和静态外发/费用提示；不删除服务端守卫或离线网关配对授权。
- [ ] 调整仅被明确改变的E2E期望，保留撤销/停止安全测试；定向运行+typecheck。
- [ ] 报告接口给主代理同步AppShell文案，不自行编辑AppShell，不提交Git。

### Task 4: 企业资料、试运行开户与实际交互

**Files:** src/services/company-command.ts (new), server/app.ts, repository command wiring (coordinate Task2), company profile UI (coordinate Task2), server/pilot.ts or scripts/setup-pilot.ts; tests/unit/pilot.test.ts and service-lifecycle.test.ts.

**Interfaces:** `SAVE_COMPANY_PROFILE`只改当前用户所属公司非认证字段；revision/字段白名单/字典校验，审核独立。setup pilot只新增，随机密码写ignored本机文件，重复运行返回现有状态不重置。HTTP或现有受权业务服务串接账号/审核/岗位/投递；线上不创建假的学校/就业证明。

- [ ] 失败测试：企业不能改别人或认证字段、revision冲突、只新增不覆盖；复用完整生命周期验证各角色消息与状态。
- [ ] 运行测试看到失败后实现；按正常流程建企业并发布3个有试运行说明的岗位。
- [ ] 实际写库前执行 `npx tsx server/cli.ts backup server-data/service.sqlite server-backups/pre-supplement-<unique>`。
- [ ] 运行实际预检：原账号数量/简历hash/已有申请与去向；保存输出仅含数量、id、状态，无密码。
- [ ] 关联student.chen可用简历快照投递→企业筛选邀约；不具备合法完整资料时保留岗位并报告阻断；后续Offer/签约/去向在隔离库自动验证。

### Task 5: 集成与交付验收

**Files:** docs/evidence/recruitment-supplement-progress.md, existing runbook; new release directory only after passing verification.

- [ ] 检查各任务全部文件和权限边界，修复评审发现；读取最终代码而不只依赖代理报告。
- [ ] `npm run test:unit`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:e2e`，记录实际数字及失败/跳过。
- [ ] Browser检查当前真实服务页面身份/非白屏/无错误覆盖层/控制台/截图/交互；保存证据到临时目录，正式进度仅引用结论。
- [ ] 切换实际服务并核查health、企业岗位与学生消息；输出新账号凭据的本机文件路径与清晰操作入口，不在交付包包含数据库、密钥、凭据。

## Pre-flight Review

Task1与Task3共享AppShell概念但文件只归Task1，顶部AI文案由主代理整合。Task2与Task4共享repository/WorkspaceView：Task4先只修改新company-command和server/pilot，待Task2交回后主代理合并命令分派及资料区。所有任务遵守旧数据兼容和不伪造结果；测试与实际服务分开。
