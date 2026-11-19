# 第五阶段运行与维护

2026-11-14，北京时间。本阶段是本机在线服务候选版，不是公网生产放行。入口：http://127.0.0.1:4174/ 。正常启动 `npm run start:online`，默认只监听127.0.0.1；实际库 `server-data/service.sqlite` schema4，初始化账号/密码不变，勿再次初始化或导入离线种子。

## 日常机会维护

管理员登录后进入“机会来源管理”。固定来源每连续24小时最多实际同步一次，目标20条、硬上限30条；失败也消耗预算，没有翻页、定时任务或自动重试。首次实际批次为2026-11-14 17:28:38+08，下次最早2026-11-15 17:28:38+08。预算落库，重启和备份恢复不会清除。

新内容暂存，管理员核对来源、差异和资格，写明审核说明后发布/退回；已发布更新未审时仍展示旧版，下架不删除私人历史。只在实际核对后填写薪资与招聘类型，不推断缺失学历、人数、截止和资格。审核发布不是招聘主体或职位有效性的认证。超过7天提示待更新，超过30天移出默认发现。

命令行维护与网页共用预算及审核事务，限有权本机操作者；不要将这些命令开放为匿名任务：

```powershell
npm run opportunities:online -- preview
npm run opportunities:online -- sync
npm run opportunities:online -- review "ncss:来源ID" 版本号 publish "核对说明"
npm run opportunities:online -- migrate-legacy
```

最后一项仅将旧三条索引迁为待审一次，已有同ID不覆盖；本机实际已执行，新增2条，另1条与首批重合。重复执行不重建候选。网页发布失败/冲突时保留说明，先重新读取核对，不盲目反复提交。同步403/429/异常结构/超时/超限停止，保留旧公开内容；不绕过登录或验证码。

## 业务事实

公开机会支持关键词、地域、学历、来源、类型和分页。本站办理沿用企业审核与真实投递链；原站申请必须在原站完成。学生收藏与求职进展是本人记录，仅本人读写，不自动生成申请、企业候选、Offer、协议或已审核去向。收到意向后可进入既有站外去向表，手动填报和上传材料，辅导员按原流程审核。

独立会话保存后通过既有SSE重新读取；未保存输入不被推送覆盖，版本冲突需显式核对。保存过程中暂锁输入，避免异步返回丢失新编辑。公开匿名页面在刷新/重新聚焦时更新，不承诺毫秒同步或匿名SSE。

## 升级与回滚

本次先检查旧4174已停止、保留旧dist与第四阶段源码包，原生一致性快照schema3；恢复到独立目录试迁移后才切换实际库。`scripts/activate-stage-five.ts` 是本次一次性、本地显式确认工具，不是通用导入接口；需要本次QA批次与schema3快照，重复运行会拒绝。不导入QA账号、密码、私人记录或业务夹具。

本机保留位置（含受保护数据，不打包/不对外分享）：

- `artifacts/stage-five-rollback/database-before-upgrade/`：迁移前schema3快照与hash。
- `artifacts/stage-five-rollback/dist/` 与 `stage-four-source.zip`：完整旧版本输入。
- `artifacts/stage-five-migration-trial/`：恢复撤会话后的隔离试迁移。
- `artifacts/stage-five-cutover.json` / `stage-five-service-verification.json`：切换与五账号核验摘要，无密码。

需要回滚时：停4174；保留当前schema4库/完整版本并备份；核对快照之后的业务写入；用第四阶段源码包解压到全新目录，按其锁文件安装构建；用该版恢复工具将schema3快照恢复到另一全新受控目录，指定 `CAREERPILOT_DATABASE` 启动旧版。不要以旧程序打开schema4，也不要直接覆盖当前数据库。此次执行了前向迁移副本和schema4备份恢复测试，未将实际服务降级后再升级；旧版恢复继续办理证据保留在第四/第三阶段记录。

后续schema4备份/恢复：

```powershell
npm run backup:online -- "D:/实际库/service.sqlite" "D:/受控备份/全新快照目录"
npm run restore:online -- "D:/受控备份/快照目录" "D:/受控备份/全新恢复目录"
```

恢复产生新 `careerpilot.sqlite` 并撤销旧会话；停服指定恢复库后启动。不得只复制运行中主sqlite文件或删除WAL。运行中不覆盖dist；完整版本切换后让已有页面刷新。

## 验证与交付

按 `evidence/stage-five.md` 运行检查；功能与性能JSON分别归档，`online-load`仅本机隔离负载。第五阶段源码包在 `artifacts/stage-five-release/careerpilot-source.zip`，仅源码/公共资源/测试/文档，不含数据库、账号表、Key、QA批次或node_modules。解压后 `npm ci`、typecheck、build，再显式初始化自己的新库。交付独立验证由 `node scripts/verify-stage-five-release.mjs` 完成；真实运行数据不能通过源码包恢复，应另走受控快照。

生产条件、未测边界和延期项见 `stage-five-issues.md`。图像服务不是运行依赖，现有本地校园图和回退继续可用；概念图不作为产品截图。
