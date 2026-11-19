# 严格DeepSeek与dsh-pet：进度核查及验收

北京时间2026-11-15。已回读20:45:22原需求、20:59:17补充、21:07:43确认和两次中断后的实施记录；以实际文件与测试结果核对，不把摘要或代理“完成”状态作为证据。两份已批准规格位于`docs/superpowers/specs/2026-11-15-{strict-deepseek,assistant-pet}-design.md`。

## 实现与需求对照

| 范围 | 结果与关键文件 |
| --- | --- |
| 严格AI | `orchestrator.ts` LIVE错误向上传播；`useBusinessAi.ts`业务只传LIVE与空回放集；无密钥/离线/额度不足/校验失败不构造代答。显式REPLAY/RULE仅保留底层历史测试和设计静态示例，不进入业务生成 |
| 真实模型推荐 | `workbench/matching.ts`最多30个真实候选，最多15项模型排序/理由，拒绝未知/重复ID；六维规则事实分独立，不被模型改写。GET只读历史，空候选不调用模型 |
| 动态文字面试 | 正式`/student/mock`复用动态会话服务文字模式；首题/后续/评价来自模型，无自动TTS/ASR。旧规则报告只读、明确标签。回答先保存，失败不生成替代分 |
| OCR | `workbench/ocr.ts`与`DocumentOcrView.vue`；2MiB、PDF≤20页、PNG/JPEG签名、像素上限、授权、官方multipart、190秒窗口、HTTP200错误/页码/截断校验；逐页展示/复制，无自动保存，离页/撤销清除 |
| 来源凭据 | `provenance.ts`记录无正文最小元数据；成功经校验后展示模型/时间/trace/实际上游ID与用量。A1/A3/A7旧接口也已补齐凭据与schema、页面展示；旧记录兼容可选字段 |
| 全局pet | `AssistantPetLauncher.vue`、`assistant-pet.ts`；114段原版透明动画、AI Chatbot标识、约300ms长按、关闭面板可拖动、边界/刷新恢复/键盘、设置/暂停/睡眠/可选漫游、减少动态/后台暂停。原助手对话/历史/停止/删除/换用户清理保留 |
| 本地素材 | 固定上游提交`572cf0ff68e7ffbe76afe4ba5fd8ae99ec7e0733`；121个manifest载荷SHA256/字节全部核对，114段webm，合计59,747,152bytes（不含manifest自身）。代码MIT/素材CC BY-NC-SA4.0，署名和许可保留，无上游后端/热链 |

AI入口清单：学生表达建议A1、岗位解释A3→`/api/ai/prepare+confirm`；辅导员问数及帮扶A7→同路径；学生优化→`/api/workbench/generate`；岗位推荐/Search/单岗位分析→`matches`/`matches/analyze`；动态文字/语音提问评价→`sessions`；OCR→`documents/ocr`；语音→`speech/tts`和`speech/asr`；所有approved角色全局助手→`chat`（可选Search）。企业/管理员原本没有独立AI业务生成按钮，不强加新付费操作。原离线练习的确定性评分明确非AI；其可选AI辅助同样不可离线生成。

## 中断位置和本轮继续完成项

中断前核心改造、一次完整11环节真实烟测及Edge79项已通过；但旧接口时间/模型凭据尚未闭合，交付说明与最终包尚未更新，不能当作已交付。

继续后：旧接口凭据测试先失败再修复，13项在线AI单测通过；并列建议页凭据E2E先失败再修复，通过。新增TTS HTTP200 JSON错误不允许作为PCM、畸形/空JSON归一化失败的回归。种子检查对新增可选时间字段做类型兼容，不改变种子业务内容。

真实账号流程曾被pet透明角热区遮挡，trace定位`.pet-hit intercepts pointer events`；收紧角色热区后原账号测试及拖动测试通过。没有用强制点击绕过遮挡。新增控制台断言曾把登录前正常的`GET /api/session`401误判为应用错误，trace确认仅此请求；现按已登录业务阶段检查console，pageerror始终捕获。

## 自动验证

- 最新`npm run typecheck`、`npm run lint`：exit0；`npm run build`：exit0，898modules。
- 最新`npm run test:unit`：69文件516/516通过，0失败。
- 最终`npx playwright test --workers=3 --grep-invert PERF0 --output=artifacts/strict-ai-pet-final --reporter=list`：Chromium79+Edge79，共158/158通过，0失败/跳过/重试，2.8分钟。性能专项未在本次执行，不将功能回归当负载结论。原始终端结果session21519，exit0。
- 素材manifest121文件SHA256、字节及114动画总数核验通过。

自动化使用隔离SQLite、合成资料与受控供应商替身，不外发真实学生材料，也不代表真实API成功；真实调用单列如下。

## 真实DeepSeek调用证据

原始安全元数据汇总：[strict-ai-pet-live.json](strict-ai-pet-live.json)。本轮严格AI系列累计8次显式测试运行、38次外部请求尝试，无自动付费重试，独立临时库。此前工作台阶段的7次合成探测不计入此38次。

| 运行 | 结果 |
| --- | --- |
| `P1MCtB`（13次） | 9/11环节通过；A1/A7语义校验失败，未代答 |
| `InT0WB`、`jAZ6s6`、`2N4D1f`（合计4次） | 定位A1引用UTF16下标/A7裸数字等约束；包含失败与诊断成功，未删除记录 |
| `CMKdwS`（2次） | 服务端提供精确证据范围、提示词说明数字占位符后，两项通过；schema/semantic未放宽 |
| `xdxr4b`（13次） | 完整11/11环节通过：A1/A3/A7、优化、Search+模型推荐、OCR、首题、下一题+评价、SSE对话、TTS、ASR |
| `R0T4hh`（5次） | 新凭据与TTS内容类型补验4/5通过：A1/A7/TTS/ASR；A3一次SEMANTIC_INVALID，被拒绝未代答 |
| `IQ6TFe`（1次） | 单次A3诊断通过，ID/维度/技能引用及无裸数字检查有效，凭据完整。无法事后还原上一失败的具体字段，不伪称已定位根因 |

完整成功运行不是供应商永不失败的保证。严格约束下模型可能输出不合格内容，用户会看到未完成提示；可人工核对后主动重试，程序不自动重试、不输出规则替代。调用凭据可追溯不代表事实绝对正确，不将练习分作为录用依据。

## 页面核验

Browser插件/skill未列出，按前端验收技能使用既有Playwright。之前IAB窄屏AX能读取，但截图/输入连接超时，未把该次算作完整视觉通过。现已实际查看隔离测试截图：

- `D:/Temp/careerpilot-pet-desktop-msedge.png`：1280×900，原版透明角色、标识与全局位置可见，无黑底或页面错误覆盖层。
- `D:/Temp/careerpilot-pet-mobile-msedge.png`：390×844，助手标题、历史、输入、发送与关闭均在视口内；正文区域可滚动。
- 交互：关闭聊天长按拖动→释放不打开；刷新保留；方向键；取消手势；四角打开面板；跨页；减少动态暂停；114动作选项；原聊天成功与凭据。已登录页面无捕获到的相关console error/pageerror。

参考差异：使用原角色动画而不是用户截图重绘；网页保留原形象和动作，但不复刻上游桌面壳、独立聊天、余额/天气/系统通知。Safari采用完整静态回退。桌面截图捕获的是某个原版待机动作，不表示角色永远保持同一姿态。

## 数据与运行保护

实际库`server-data/service.sqlite`与`server-backups/pre-strict-ai-pet-20261115/database.sqlite`逐表id/data排序SHA256一致，quick_check均ok。保留6用户、2学生、2企业、2简历/4版本、3岗位、原有1申请/1附件，未创建新申请或改写资料。未初始化/改密/导入QA记录。

服务已从原库启动 http://127.0.0.1:4174/ ，健康检查`status:ok,schema:4`；无公网监听，正式共享前仍须TLS/安全和部署验收。

在线资源检查：`/runtime.js`为在线配置、manifest为JSON、原动画为`video/webm`，均200；`/server-data/service.sqlite`404，不可通过静态服务读取数据库。重启后再次运行数据一致性检查仍`unchanged:true`。

## 交付

新增交付目录`artifacts/strict-ai-pet-release-20261115-final/`，保留所有旧交付包。源码ZIP包含本轮代码/测试/使用说明/安全元数据/完整素材及许可，不包含实际数据库、备份、账号密码表、环境凭据或node_modules。具体清单和安全扫描以包内`release-manifest.json`及生成后终端核验为准。

已逐文件重新计算547个文件的字节/SHA256并匹配release-manifest，114个原动画与第三方许可在包中，安全扫描passed、禁止文件0。源码包不是带本机数据库/密钥的即插即用备份；另一电脑按说明安装依赖、构建并单独安全配置。

## 审查和未验收边界

此前独立审查代理仅返回配置确认，未生成审查报告或执行检查，不计独立审查通过。主流程已逐文件自查严格调用、权限/revision、取消、配额、响应上限、素材与手势，但自查不等于独立审查。此项仍未完成。

物理触屏、Firefox透明动画、Safari动态、真人麦克风/听感/回声、真实弱网、完整无障碍和生产负载未验收。ASR整段而非流式/双工；Fetch未接入；OCR不认证证书、不自动写入简历。密钥聊天暴露后公开发布前应轮换。角色只限非商业学习，商业用途须另获授权或替换。
