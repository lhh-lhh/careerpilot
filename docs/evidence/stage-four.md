# 第四阶段本机账号服务实施证据

北京时间2026-11-14，Windows / Node24.19.0 / npm11.17.0，i5-13500H、16逻辑核、15.7GiB。承接 `../stage-three-traceability.md` 八段讨论，只记新增事实，不覆盖历史或冻结目录。

## 实施与实际启动

- 默认在线启动，独立空业务库schema3，初始化拒绝覆盖；学生/企业待审、员工48小时绑定一次邀请、审核revision事务建空档案、本人改密撤全部会话。规范化账号唯一、scrypt、邀请hash、CSRF/同源、持久限流/审计，未审批不得访问业务/附件/SSE/AI。
- 注册/状态/审核/邀请/改密界面；待审不再显示正常、审核院系可见；空简历增加教育入口。正常在线页面无演示身份选择和无关解释，必要来源/授权/风险说明及功能性“模拟面试”保留。
- NCSS仅3岗位+4服务的有限链接索引，保留来源、发布时间/核对时间、未知截止，原站查看申请。未批量爬虫/全量匹配，未取得批量转载许可，robots404不是授权。
- 实际 `server-data/service.sqlite` 已初始化五账号，密码仅存受控 `initial-credentials.json`，ACL仅当前操作者/SYSTEM。五账号均通过实际HTTP登录/本人状态/退出，四角色approved；无密码输出或预造招聘业绩。
- 4174实际服务已运行：健康ok/schema3、runtime在线、仅127.0.0.1。实际门户/官方资源/登录注册入口已手工浏览器核对，新页error/warn为空、登录页目视通过。另在隔离4188新库实际操作注册、等待和管理员审批。

## 本次自动验证

| 验证 | 结果与边界 |
| --- | --- |
| typecheck / lint / build | exit0 / exit0 / exit0；0 lint warning，最终构建825模块/748ms（非页面性能） |
| Vitest | 52文件411/411，含SQLite/HTTP/账号/初始化/资源/备份恢复 |
| contracts / seed | 47/47、17/17；seed仅历史兼容，不是正式业务数据 |
| gateway | 87/87隔离测试，1条Starlette/httpx弃用警告，非真实供应商联调 |
| npm audit --omit=dev | 生产依赖0漏洞 |
| Chromium + 本机Edge功能 | 最终构建后114/114，`artifacts/stage-four-functional-results.json` |
| 新账号UI | 4项计入114：注册→待审→批准→空工作台→邮箱/教育保存刷新/390px；员工邀请→开通→改密重新登录；审核院系/状态断言先失败后修复 |
| 独立性能 | 6/6，`artifacts/stage-four-performance-results.json`；历史100岗位夹具/离线静态服务，不外推新账号后端或公网 |
| 本机并发 | 12会话+12SSE，120读/60写，p95 183.36ms、max187.73ms、错误0、总1927.4ms，07:56:28Z；`artifacts/stage-four-online-load.json`。隔离历史夹具、单Node/SQLite/loopback，不承诺生产容量 |
| 独立新库全链 | `service-lifecycle.test.ts`：服务初始化→企业/岗位审核→补教育→投递→面试→签发接受Offer→双方协议→证明/去向审批→一致性备份恢复→旧会话401→重新登录继续保存，1/1计入411 |
| SSE/重启 | online单测/双浏览器验证会话同步、漏发补查/撤权/草稿冲突；accounts测限流重启持久。不是物理手机/WAN或多实例验证 |

114项包括离线兼容和在线隔离会话，不全是新账号验收。新库全链使用隔离身份/证明，不污染实际业务；magic校验不是病毒扫描。没有真实DeepSeek或新增付费生图。

## 源码交付

独立目标 `artifacts/stage-four-release/careerpilot-source.zip`，不覆盖第三阶段包。排除server-data/初始密码/会话/Key/依赖/临时资源；允许清单含服务入口、源码、测试和本阶段文档。

`node scripts/verify-stage-four-release.mjs` 解压至全新临时目录，核manifest集合/长度/SHA256、敏感路径/扫描，再独立npm ci/typecheck/build、初始化、四角色登录退出、CLI重启读回。最终状态和ZIP hash仅以 `artifacts/stage-four-release-verification.json` 为准；没有passed不得称已验证副本。不是公网发布或schema2降级证明。

## 八段讨论继续追踪

| 讨论 | 本阶段接续 | 未放行 |
| --- | --- | --- |
| 12:17 AI真实性 | RULE默认、同源授权接口/隔离测试 | 真实Key/费用/质量GW11 |
| 12:23 框架联网 | Vue保留、权威后端、账号 | PostgreSQL/TLS/部署目标 |
| 12:35 在线升级 | 审核/邀请/改密/持久同步/新库恢复 | 真实设备/负载/多实例运维 |
| 13:17 角色完整性 | 五身份、空档案和归属、招聘全链 | 真实组织/资质、原P2/P3 |
| 17:04 公共首页 | 门户→登录→工作台、官方资源 | 自动同步/内容运营 |
| 17:23 图片 | 现有素材/回退复验，无新增生成 | 公开素材治理、需图时延后重试 |
| 18:04 视觉统一 | 新入口沿用品牌/控件，精简说明，移动/空态复验 | 目标设备最终视觉签收 |
| 18:22 延期实施 | 已确认账号计划落实并追加文档 | 不将测试数当全路线完成 |

生产条件集中见 `../stage-four-issues.md`；本机运行不等于可收集真实敏感材料或公网交付。
