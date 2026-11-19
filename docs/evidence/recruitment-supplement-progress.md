# 招聘补充开发记录

> 历史记录保留。下文教育经历为空、472/134测试数与旧源码包对应上一阶段；本轮学生自行完善资料后的状态、476/144回归和简历增强交付见`resume-studio.md`，不把本人资料更新记为开发者填写。

Plan: docs/superpowers/plans/2026-11-15-recruitment-supplement.md

- 2026-11-15：用户确认自行参照真实平台补全企业，关联现有学生，再实施全部附件。原位保留数据；不创建初始提交。
- 新附件已完整读取，六项范围与前附件一致。已读取国家大学生就业服务平台岗位页，参照筛选和风险提示；不复制第三方雇主身份。
- 基线：60个单测文件、461个测试通过（本轮fresh run）。当前4174服务未运行，稍后安全启动，不重跑初始化。
- Task1: 完成。56个主要城市补齐到既有服务（INSERT OR IGNORE，不覆盖原目录）；关键词/企业/城市/收藏/面议/9档薪资及自定义区间相交筛选。岗位列表不依赖匹配完成。中宽208px图文导航，移动抽屉；4类独立面试模板含问题和答题提示，非投递岗位。
- Task2: 完成。证书新增、说明、PDF/PNG/JPEG上传、下载、移除引用与正式版本保存；每文件2MiB、每项5个、最多30项。引用必须归本人；企业只读本企业收到的固定投递快照引用文件，不读学生其他文件。旧简历和草稿兼容。
- Task3: 完成。旧A1/A2/A3/A7、新简历优化/匹配分析/助手/语音统一默认授权。点击即调用，无逐次勾选；保留服务端consent、masked prepare票据、额度、外发费用提示、停止与顶部总开关；关闭会中止生成/播放/录音并隔离迟到结果。页面加载不调用付费上游，业务保存/删除/投递确认不取消。
- Task4: 企业与岗位实际完成，真实学生投递待本人资料。正常注册/管理员审核/资料维护/准入审核/发岗提审/上架建立hr.pilot；3岗位全部published/approved，已为student.chen收藏。两学生原教育经历为空，APPLY按原校验拒绝，未编造学历或创建真实申请。setup-pilot幂等重跑返回education-required且保留原记录。四角色完整生命周期在临时库通过HTTP/SSE验收。
- Task5: 软件集成验收通过。最终65单测文件472测试；typecheck、lint、build退出0；Chromium+Edge端到端134/134通过（workers=4），0失败/跳过/flaky，含公司资料、证书异步竞态、全国筛选、模板、AI默认授权、pilot双端可见性和原有回归。实际学生投递仍待本人教育经历，不以测试通过替代真实业务完成。
- Ruling: 用户“参照…即可…继续实施”视为确认此前六项设计并授权名称细化；不再为企业命名反复暂停。已固化spec/plan。
- Ruling: 线上试运行停于面试邀约，后续全链签约在隔离测试库验证；当前无试运行统计隔离字段，不将试运行签约计为真实就业。

## 实际切换与数据完整性

服务已原位重启：http://127.0.0.1:4174/ ，健康status=ok/schema4；未重新初始化。备份`server-backups/pre-supplement-20261115-1638`及`server-backups/pre-restart-supplement-20261115-1710`。SQLite quick_check=ok；逐id原始JSON对照首份备份，原5个users、2份resumes、原companies全部字节一致。当前6账号/2简历/0申请/0协议/0去向，城市56。新增凭据仅存ignored本机`server-data/pilot-credentials.json`，未输出密码。

企业：路鸣校招实践企业（试运行），岗位pilot-recruitment-1/2/3分别前端（上海8–12k）、数据分析（杭州7–11k）、运营（南京5–8k）。资料与JD含本机试运行、非工商认证、非真实雇主/录用声明。只是实际软件里的工作流，不等于真实商业招聘。

## 测试与浏览器证据

- 单测新增company-profile、pilot、job-filtering、certificate-attachments、ai-consent及student-tasks；新行为均先有失败测试再实现。service-lifecycle验证从空实际式账号出发：资料→审核岗位→本人填简历→授权投递→SSE与阶段通知→面试确认/结果→Offer接受→双方协议→证明→辅导员审核→备份恢复后继续。
- 新增E2E覆盖证书上传保存重载、默认AI上游脱敏/加载零调用/关闭阻止、默认助手撤销stream和语音录音取消、企业和学生同岗可见、学历不限标签、全国城市与自定义筛选。AI上游为合成替身，不消耗真实余额。后端原consent拒绝测试保留。
- Browser可用，使用应用内当前实际学生会话。验证路径：岗位页→自定义最低10000→3变2岗位→清空恢复3；1024图文导航可见、390总开关切换状态且无横向溢出、移动抽屉导航到4模板。身份/非白屏/无框架覆盖层/无相关控制台warn/error/截图/交互均通过。截图在D:/Temp/careerpilot-supplement-desktop.png与mobile.png，非交付包内容。
- 本轮按测试驱动/完成前验证与浏览器验收技能执行，额外发现并修复数字输入v-model变number后.trim异常、企业区块条件分支隐藏原页面、空学历要求显示degree-null等问题。代理无有效产出，最终由主代理集成审查，不声称独立代理审查。

## 最后收尾与可重复验证

- 证书上传竞态：在独立SQLite/HTTP服务中延迟上传响应，另一会话保存导致简历草稿对象替换；原实现把附件写到过期对象，测试实际失败。修为上传完成后按id找到当前证书再附加，双浏览器均通过；正式保存并刷新后下载仍存在。新增`tests/e2e/certificate-upload-race.spec.ts`，不触碰实际学生资料。
- 8 worker全量曾132/134：注册测试未等待注册页，可能误填登录页的同名输入框；去向历史用例整体20秒超时。注册测试补页面标题就绪断言，未放宽业务断言；4 worker完整重跑两次134/134，最终一次约103秒。并行跑单测/E2E时另有2个纯超时，单测单独运行最终472/472（约19.6秒），无增大超时或删测试。
- 最终命令：`npm run test:unit`、`npm run typecheck`、`npm run lint`、`npm run build`、`npm run test:e2e -- --workers=4`。E2E JSON为expected134/skipped0/unexpected0/flaky0。
- 最终实际库只读复核：quick_check=ok，原账号/简历/企业与备份逐id原始JSON完全一致；6账号、2简历、0申请/协议/去向、56城市；3个pilot岗位published/approved。health=ok/schema4。
- 最终安全源码包：`artifacts/recruitment-supplement-final/careerpilot-source.zip`。源码和文档、测试同版；不含数据库/备份/凭据/node_modules/真实密钥。逐项SHA256及zip条目校验，安全扫描无发现。旧的`recruitment-supplement-release`包保留，交付以final为准。

### 实际界面QA

环境：`http://127.0.0.1:4174/`，应用内Browser可用，无回退；390/768/1024/1280宽度。最后构建后reload再次检查实际学生首页/简历/岗位页。

| 检查 | 结果与证据 |
| --- | --- |
| 页面身份、非白屏 | URL及标题为CareerPilot，实际学生首页有教育待办和3岗位 |
| 错误覆盖层 | 无Vite/框架错误覆盖层 |
| 控制台 | 相关warn/error为空 |
| 截图 | `D:/Temp/careerpilot-supplement-desktop.png`、`D:/Temp/careerpilot-supplement-mobile.png` |
| 交互 | 实际岗位自定义最低10000：3→2；清空：2→3；移动总AI开关可开关，导航到4模板 |
| 响应式 | 四个检查宽度无横向溢出，侧栏图文/移动抽屉可用 |

关键Browser序列：reload→url/title/domSnapshot→导航与selectOption/fill→检查岗位数量→dev.logs→截图。证书写入/保存/同步竞态在隔离真实HTTP库验收，不向实际学生填入测试证书。剩余物理语音与真实教育资料由本人验收/填写。

## 尚需本人完成与限制

student.chen在本轮前已自行补充资料；请本人核对学校、学历、专业和起止日期并保存，再从已收藏岗位正常投递。hr.pilot在候选人流程接收、筛选、邀约；学生在我的投递回应。本轮未代为投递，不得用测试院校或就业证明填入实际库。完整签约/审核的自动化通过不等于实际用户已完成闭环。

ASR为整段识别，非实时双工；物理麦克风与听感仍需本人短练习验收；OCR/Fetch未接入，不宣称已完成。当前仅本机候选版，不是公网生产放行。密钥此前出现在聊天，公开部署/分享前应在官方控制台轮换。
