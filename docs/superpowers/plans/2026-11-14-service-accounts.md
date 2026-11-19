# 正式服务账号实施计划

> 当前会话使用executing-plans顺序执行；用户已批准单校身份方案并要求立即开始。不委派，不改冻结目录/历史证据，不伪造提交。

**Goal:** 默认在线启动、真实注册审核和受控邀请、独立空业务账号及有来源的公开资源入口。
**Architecture:** Vue保留；同源账号边界独立为server/accounts.ts，使用现有事务/密码与会话基础；未审批账号只可读取本人状态。新增持久安全记录及schema迁移，不覆盖旧库。
**Tech Stack:** Vue3/TypeScript/Node24/SQLite/Vitest/Playwright。
**Spec:** ../specs/2026-11-14-service-accounts-design.md。

## Task 1 账号生命周期服务

Files: server/accounts.ts、server/auth.ts、server/app.ts、server/database.ts、server/backup.ts、src/types/entities.ts、tests/unit/accounts.test.ts。

- [x] 写真实HTTP红测：`POST /api/register`学生/企业成功、未审核业务403、重复规范化账号409、公开admin拒绝；`POST /api/admin/accounts/review`批准后空简历、跨人401/403、旧revision409。
- [x] `npx vitest run tests/unit/accounts.test.ts`确认缺失接口失败。
- [x] 实现createAccounts：register、review、invite、readStatus；注册密码通过auth哈希、授权再次检查；持久限流、邀请hash、48小时/一次性/绑定账号。
- [x] 邀请接受→真实登录，禁用撤权；回归原online/backup测试，不记录密码/正文至审计。

## Task 2 入口和管理界面

Files: LoginView、RegisterView、AccountStatusView、admin/AccountsView、router、AppShell、http adapter、tests/e2e/accounts.spec.ts。

- [x] 浏览器先写注册→等待审核→管理员批准→空工作台→保存刷新、邀请、移动和敏感文案断言。
- [x] 接注册/邀请接受/状态/修改密码/审核/邀请界面；管理操作捕获id/revision，失败保留输入，身份由服务器决定。
- [x] 内置Browser先检查页面身份/非空/错误层/控制台和真实交互，双浏览器自动复验。

## Task 3 初始化和默认启动

Files: server/bootstrap.ts、server/cli.ts、package.json、start-service.cmd、public/runtime.js、README、tests/unit/bootstrap.test.ts。

- [x] 红测独立服务初始化不含旧投递/协议/证明和演示账号文案；现有库拒绝覆盖。
- [x] 新库创建管理员、字典/技能/题库及少量初始账号；空简历，企业待准入，不伪造认证和业绩；随机密码受控输出。
- [x] npm start默认正式服务；旧离线服务仅start:demo；不隐式初始化/清空已有库。

## Task 4 官方资源和全链收口

Files: server/public-resources.ts、src/views/PortalView.vue、tests/unit/public-resources.test.ts、docs/evidence/stage-four.md。

- [x] 核查官方公开来源/许可，记录访问失败或限制；仅有限公开数据、归一化去重、来源和时间，外部申请原站跳转，不伪造本地企业。
- [x] 先测不安全URL拒绝、重复幂等、日期未知不伪造、来源可追溯；不得网络故障阻断主服务。
- [x] typecheck/lint/unit/gateway/contracts/seed/build、两浏览器功能/性能、本机并发/同步/重启；独立新数据运行，不把历史数字填成新通过。
- [x] 更新策略和未放行：PostgreSQL/TLS/真实负载/个人信息留存/恶意文件扫描尚未验收；真实上线另需明确主机域名，不擅自公网开放。

## 实施收口

以上仅为本计划本机范围，不等于长期路线全部完成。最终411单测、114双浏览器功能、6性能、87网关隔离、47契约、17种子兼容通过；独立新库账号及招聘→去向→备份恢复已验。实际4174运行，初始密码仅本机私有保存。源码独立解压安装/构建/初始化/五账号及重启边界验证passed，最终hash见 `artifacts/stage-four-release-verification.json`。生产门禁、NCSS自动同步匹配及原P2/P3见 `docs/stage-four-issues.md`，不静默删项。
