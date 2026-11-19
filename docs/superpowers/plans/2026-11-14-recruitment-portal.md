# 适量岗位资源与公共门户 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 顺序执行，不派发代理。用户已明确确认实施与收官测试，不再重复询问执行方式。

**Goal:** 以适量来源索引、公开发现与真实角色链路形成第五阶段本机可验交付。

**Architecture:** 独立SQLite机会/候选/个人记录表，既有Job和Company不变。固定NCSS采集适配器接入管理员治理，统一公开查询服务供门户、列表、详情与学生使用；个人记录不冒充业务投递。

**Tech Stack:** Vue3 / TypeScript / Node24 / SQLite / Vitest / Playwright。

**Spec:** `docs/superpowers/specs/2026-11-14-recruitment-portal-design.md`

## Global Constraints

- 首次目标20条，单次最多30条、6次HTTP、单并发/2秒间隔、10秒/1MiB/无自动重试，连续24小时仅一次手动同步。
- 无全站镜像、全文JD/个人信息/企业logo复制；来源与底层来源、发布时间/更新时间/采集时间分开。
- 新内容先暂存再审核；未知值不猜；外部记录不生成本站申请、企业认证、Offer、协议或落实统计。
- 保留用户数据/稳定版；develop无HEAD，不制造初始提交；独立测试库/构建，升级先快照。
- 公网/真实AI/部署条件不在本机放行范围；图像失败登记稍后重试，不自动付费重试。

## Task 1: 来源解析与schema4治理（completed）

**Files:** 新增 `src/types/opportunities.ts`、`server/ncss.ts`、`server/opportunities.ts`、`tests/unit/opportunities.test.ts`；修改 `server/database.ts`、`server/backup.ts`。

**Interfaces:** `parseNcssList(input:unknown, observedAt:string): ExternalOpportunity[]`; `createOpportunities(database).stage(rows) / review(actor,payload) / records(actor,payload?) / sync(actor)`。网络只在sync，HTTP只在app路由。

- [x] RED：解析缺失/超量/恶意字段，暂存不可公开、审核幂等/冲突、下架、私人记录隔离、持久预算/失败、恢复保存新表。测试核心：
```ts
expect(parseNcssList({data:{list:[{jobId:'abc',jobName:'开发',recName:'企业'}]}},now)[0]?.deadline).toBeNull();
await expect(service.review(student,review)).rejects.toThrow('FORBIDDEN');
expect(await service.publicExternal()).toHaveLength(0);
```
- [x] 运行 `npx vitest run tests/unit/opportunities.test.ts`，确认缺失实现失败。
- [x] GREEN：白名单解析，固定URL fetch/流式限额/超时，数据库迁移，暂存与版本、审核、私人记录、回执/审计、24小时预算，7/30天陈旧规则。
- [x] 复验单测与backup测试；自查SQL绑定参数/拒绝客户端任意URL，记录变更而非commit。

## Task 2: HTTP公开投影与权限闭环

**Files:** 新增 `server/public-opportunities.ts`、`tests/unit/opportunities-http.test.ts`；修改 `server/app.ts`。

**Interfaces:** GET `/api/public/opportunities?q=&location=&degree=&type=&source=&page=&pageSize=`，GET `/api/public/opportunities/<id>`；admin GET `/api/admin/opportunities`，POST `/sync`、`/review`；student GET/POST `/api/opportunity-records`。

- [x] RED：独立HTTP fixture，匿名列表分页/详情，未审不可见；学生不可同步/审核，pending403，CSRF403；外部收藏不产生申请；旧公开接口只返回被引用企业。
```ts
expect((await student.post('/api/admin/opportunities/sync',{})).status).toBe(403);
expect((await publicRead('/api/public/opportunities?pageSize=31')).status).toBe(422);
```
- [x] 运行 `npx vitest run tests/unit/opportunities-http.test.ts` 确认失败。
- [x] GREEN：独立服务端分页/筛选和最小详情，复用transaction/auth/CSRF/SSE，网络同步不持有长事务，提交前再查权限；旧接口兼容。
- [x] 复验HTTP及历史online测试，检查公开响应不泄漏其他公司/备注/联系人。

## Task 3: 全表面视觉与角色入口

**Files:** 新增 `src/components/public/PublicHeader.vue`、`OpportunityRows.vue`、`src/views/OpportunitiesView.vue`、`OpportunityDetailView.vue`、`src/views/admin/OpportunitiesView.vue`、`src/views/student/OpportunityRecordsView.vue`、`src/styles/public.css`、`tests/e2e/opportunities.spec.ts`；修改Portal/router/AppShell/JobsView。

**Interfaces:** 公共`/opportunities`、`/opportunities/:id`；学生`/student/opportunities`，管理员`/admin/opportunities`。使用api/既有session/onDomainChange，不另造会话。

- [x] 用skill-1k生成协调概念；失败按批准的书面设计+既有设计系统继续，素材接口保留，登记差异。
- [x] RED：独立浏览器测试公共搜索→详情→登录返回→显式关注→另一会话可读；管理员发布/下架；手机导航/无溢出；原站点击无投递。
```ts
await page.goto(origin+'/#/opportunities');
await page.getByLabel('岗位关键词').fill('开发');
await page.getByRole('button',{name:'搜索',exact:true}).click();
await expect(page.getByRole('link',{name:'开发工程师',exact:true})).toBeVisible();
```
- [x] 用独立构建运行E2E确认新路由未实现失败。
- [x] GREEN：按批准首页顺序与现有tokens构建开放岗位列表/服务区，统一来源、分页/筛选/空错态/详情/登录返回；个人记录显式保存；管理员差异/原因/幂等/冲突，删除重复静态岗位块但保留官方服务链接。
- [x] Browser/IAB先走查，375/390/768/1280/1440/1920、深浅色/键盘/200%截图；实际截图复核与五点差异表（原生系统缩放/全面读屏未验收，见证据边界）。

## Task 4: 有限真实初始化与全链交付

**Files:** 新增维护命令 `scripts/sync-opportunities.ts`、第五阶段runbook/issues/evidence和验收输出；更新package/README/进度/限制/测试记录/源码打包。

- [x] 隔离新库运行真实固定来源单次同步（目标20条，结果不足不补抓），只保存白名单事实；人工抽样原站≤3条，记录资格/薪资未核口径。审核成功后初始化实际服务，保持预算，绝不复制业务夹具。
- [x] 运行 `npm run typecheck`、`npm run lint`、`npm run build -- --outDir artifacts/stage-five-dist`，全单测、contracts、seed、gateway、audit、Chromium+Edge功能/性能和online负载；保存JSON报告，不把隔离数据当实际业务。
- [x] 独立新库站内完整生命周期和站外记录→站外去向→审核、迁移/恢复撤会话复验。
- [x] 实际库快照，停旧服务后迁移/切换完整构建，验证health/schema4、五账号四角色可登录、公共内容与隔离学生记录持久；实际学生记录未人为制造，失败恢复迁移前快照。
- [x] 生成源码包、解压安装验证、秘密排除和hash，文档列明未放行项；所有复验事实确认后收官，不宣称公网生产。

最终收官：54文件430单测、118双浏览器功能、6性能、87网关/47契约/17种子均通过；独立源码解压安装构建/CLI验证passed。详细边界及最终包hash见 `../../evidence/stage-five.md` 和 `artifacts/stage-five-release-verification.json`。开发结果留在当前无HEAD工作区，不执行merge/push；未放行事项见stage-five-issues。

## Self-review

采集和治理覆盖spec3–4；HTTP覆盖5.2与安全；首页/角色覆盖5–6；Task4覆盖7–8。无自动调度，无外部记录进入业务统计。UI与网络上游失败可分别收口，安全/数据一致性失败不放行。
