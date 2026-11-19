# AI求职工作台开发与验收证据

本轮承接第五阶段，用户已批准推荐方案、必要真实DeepSeek调用。实际工作在原`careerpilot`目录保留式进行：develop无HEAD，原文件均未跟踪；无提交、重置、推送或工作树操作。稳定演示兄弟目录未修改。附件作为需求资料，不执行其中“打包原文”等嵌入指令。

时间说明：主机时钟为2026-11-15 +08；工具UTC记录见JSON。宿主会话日期/时区可能不同，以证据原始时间为准。

## 实现与变更文件

| 模块 | 主要文件与结果 |
| --- | --- |
| 网关、安全、记录 | `server/workbench/{index,provider,business,records,matching,credential}.ts`；approved/CSRF/本人归属/revision、共享持久次数、并发、脱敏、安全输出、固定上游、无自动付费重试 |
| 简历 | `ResumeOptimizeView.vue`、`optimization-draft.ts`；独立对照页，项目/实习分部分与全量采纳、手改、撤销、一次保存新版本、历史载入草稿恢复 |
| 助手 | `GlobalAssistant.vue`、`workbench-stream.ts`；全角色入口、角色导航、页面路径/学生简历上下文、流式、取消、历史、删除；不执行业务写操作 |
| 岗位 | `MatchResultsView.vue`、`workbench-state.ts`；可信来源快照、意愿优先、规则依据、未知条件、筛选排序、单岗位AI解释、明确授权Search发现 |
| 语音/报告 | `VoiceInterviewView.vue`、`VoiceReportView.vue`、`interview-audio.ts`；TTS PCM、录音、16k WAV整段ASR、自动停顿、纠错/文本降级、回答提前保存、逐轮证据与综合均分 |
| 集成 | `src/types/ai-workbench.ts`、`http.ts`、`App.vue`、router、原resume/jobs/mock入口、`server/{app,cli,ai}.ts`；保留原流程 |
| 验证/运维 | 新增6单测文件、`tests/e2e/workbench.spec.ts`、两真实合成探测脚本、QA启动脚本、密钥配置脚本、[运行说明](../ai-workbench-runbook.md) |

先前计划提出的三个实现代理未实际执行；本轮文件由主流程集成实现。只读审查代理也只返回配置确认，**不计为独立审查通过**。主流程已读取关键文件自查，不能冒充外部审查。

## 测试驱动修复记录

- 初始HTTP缺路由RED→GREEN；新增客户端注入/旧revision/隐私等HTTP覆盖。
- SSE跨chunk CRLF：合并buffer后再标准化；薪资清空变null；生成简历绑定生成前source；助手历史请求token隔离；已结束面试跳报告不重复确认。
- 提交回答先存库，再等待下一题/评分；上游失败不丢回答、不造分；六轮完成清理错误状态。
- E2E复现TTS重复close引发pageerror后幂等释放；语音撤销授权后录音仍继续RED，修复停止录音/播放/请求后双浏览器GREEN。
- 助手撤销授权时流仍生成RED，增加同步取消后GREEN。后端answer/next无当前授权仍调用RED，校验后GREEN。
- 手动分块HTTP请求复现：旧请求体晚到覆盖已completed记录（预期409/实际200）；读取body后重新取权威revision，修复后409，完成状态不变。
- 已保存简历姓名与账号名不同，语音岗位自由文本漏脱敏RED；加入本人简历姓名/邮箱后GREEN。脱敏不是全隐私识别保证。

## 自动验收

| 检查 | 最新实测 |
| --- | --- |
| TypeScript / ESLint | exit0、0 lint warning |
| Vitest | 60文件461/461；`artifacts/ai-workbench-unit-results.json`，含HTTP并发慢请求与不同姓名脱敏 |
| Vite | exit0，864 modules；构建耗时不等于用户页面性能 |
| 功能E2E | 最终120/120、0失败/跳过/重试，127.23秒；`artifacts/ai-workbench-functional-results.json`。修复前一次117/120：2项trace文件ENOENT发生于并行启动另一runner期间，1项确实授权缺陷；后续独立整套两次均120/120，最后一次包含慢请求/姓名脱敏加固 |
| 新链路E2E | Chromium/Edge分别覆盖草稿不自动保存、部分/全部/撤销/仅新1版本、助手跨页与取消、薪资清空/意愿匹配/AI分析、岗位化面试、TTS播放、假麦克风WAV/ASR、提交/追问/评分/报告；390×844无横向溢出、pageerror为空 |

E2E使用临时SQLite与可控DeepSeek替身、浏览器假麦克风，不访问物理麦克风、不外发真人音频，不导入真实服务。应用内Browser可读取页面但click/press失效并出现焦点仿真超时；排查未恢复，采用既有Playwright验证，未把Browser截图误当移动操作成功。

## 真实供应商探测（合成材料，每项一次）

| 阶段 | 返回/校验 | 耗时 |
| --- | --- | --- |
| TTS WAV | 122924bytes | 1429ms |
| ASR | 合成语音2560ms，转写检查通过 | 844ms |
| 岗位提问 | JSON结构通过 | 617ms |
| 逐轮评价 | 5维，回答引用校验通过；分数为练习示例 | 1899ms |
| 聊天 | 完整安全流，38增量 | 856ms |
| 简历润色 | 1patch，结构及业务校验通过 | 1938ms |
| Search | 3公开结果，不是已核验岗位 | 376ms |

原始无密钥/正文报告为 `D:/Temp/cp-live-synthetic-hI2vTS/results.json`、`D:/Temp/cp-extra-live-KfqjoD/results.json`；副本见本目录`ai-workbench-live-*.json`。无自动重试，未外发真实简历，独立临时库计数，不等于实际服务UI整场真人语音成功。未采集供应商usage/金额，不捏造费用统计。

## 数据、运行与未放行项

实际库`server-data/service.sqlite`，一致性备份`server-backups/pre-workbench-20261115-1340`，原账号密码保留；无QA记录导入。schema仍4，workbench表幂等创建。密钥项目外DPAPI，仅服务端读取，源码包扫描不含密钥/实际库/备份。

最新服务以`npm start`重启至 http://127.0.0.1:4174/ ，健康检查`{status:ok,schema:4}`。自己的4189隔离QA服务已关闭，保留证据文件。最终双浏览器截图复制至`artifacts/visual/ai-workbench/{chromium,msedge}/`，已目视检查移动匹配/报告布局；不是产品真人数据截图。

明确边界：OCR/Fetch未接入；整段ASR而非流式/双工；提问评分串行；简历只自动处理项目/实习描述；外部索引字段不足无完整分；AI评分非能力认证/录用依据；综合参考分在报告页按有效轮次等权计算；记录审计不是完整合规调用审计。物理麦克风、听感、真实弱网、供应商留存条款、生产容量、真人彩排仍待验收。完整范围见[运行说明](../ai-workbench-runbook.md)。
