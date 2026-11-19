# 全站 UI 升级：执行前检查记录

用户已明确回复“好的，正式执行”，批准以最终设计候选 v1.0 为视觉与覆盖基线。本文记录实际检查，不代表 UI 改造或全部基线任务完成。

## 已运行检查

执行目录：`D:/web程序设计作业（合）/期末大作业/careerpilot`。

| 检查 | 本次结果 |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run test:unit` | exit 0；70 个测试文件、532 项测试通过；25.97 秒 |
| 对设计前 protected-baseline.json 的只读 SHA-256 比对 | 185 个文件无变化/缺失，71 个 Vue script 区块无变化 |
| Git 状态 | develop 无初始提交；源码等仍未跟踪；无已附加工作树 |
| Figma create_session | 官方接口返回不支持当前 Make 文件；仅支持 Design / Figjam / Slides / Figspec；未获得会话，未写入云端 |

以上命令输出已在本聊天工具记录中核实。工具系统时间显示 `2026-11-17T19:27:02.8889876+08:00`；不将其冒称为环境设置中的用户时区时间。

## 已核对的测试隔离依据

`tests/unit/online.test.ts` 在系统临时目录创建测试 SQLite；`tests/e2e/online-ai.spec.ts`、`strict-ai.spec.ts` 和 `online.spec.ts` 使用独立临时库及注入 transport。此处是源码核查；本轮尚未执行 E2E，不表示其全部分支已通过。

未运行生产 AI、gateway/live、来源同步、在线初始化、真实账号操作或部署。未读取真实数据库、环境凭据或用户云端业务文件。未操作用户当前浏览器标签页。

## 修改前的安全门槛

批准的计划要求：项目外精确路径的源码快照、恢复到独立目录并核对哈希后，才能修改应用。尚未有经用户确认的快照目录。仓库没有提交，不能创建以现有源码为基础的正常 Git worktree；不能据此擅自执行全库 add/commit。

待用户确认：允许在原目录施工，先将不含凭据/业务数据的源文件快照保存于 `D:/Temp/careerpilot-ui-refresh-20261117/`，在该目录内的独立恢复子目录进行恢复演练；如目录已存在则不得覆盖，需重新核对目标。

确认前不修改生产源码。使用 executing-plans / using-git-worktrees 的安全门槛停在这里，并不是重新请求设计或功能授权。

## 尚未执行

- 可恢复快照和恢复演练。
- build（其 prebuild 会重写生成的 AI validator，需先保护快照）、E2E、性能及全角色/窗口截图基线。
- UI 源码、CSS、模板、公共品牌、任何业务/AI 逻辑的修改。
- Figma 旧 Make 任务的浏览器核验或原生 Design 组件库创建。

功能、AI、设备或全站视觉回归均不能仅凭上述类型/Lint/单元检查宣称通过。

## 后续执行补记：用户授权提交后（2026-11-17）

以上各节是当时的暂停记录，保留原文；不再代表当前施工状态。用户随后明确要求“那先进行提交再进入开发”。现已完成本地初始提交，并在独立分支实施首批纯展示升级，未上传 GitHub、未部署。

- 初始提交：`f67b5404c4417ed1e82fcd444e6dc04b863352e9`，625 个文件。
- 施工分支：`ui-refresh-20261117`；`develop` 保留初始基线。采用原目录、单会话串行施工，不派发子代理。
- 精确源码归档：`D:/Temp/careerpilot-ui-refresh-20261117/baseline-f67b540-exact.zip`；恢复目录：`D:/Temp/careerpilot-ui-refresh-20261117/restore-exact`。
- 恢复重验：625 个恢复文件与初始提交逐文件 SHA-256 一致，无缺失/差异。ZIP SHA-256：`f81a5840bf01affa16eda74645fff0e4482a8dccdff2bae91d49e4c934328925`。
- 初次普通归档遇到 CRLF 转换差异；随后用 `git -c core.autocrlf=false archive` 生成上述 exact 副本并验证。旧 `baseline-f67b540.zip` 不作为精确恢复依据。
- Git 作者只对提交命令设置为 `Codex <codex@localhost>`，未修改全局身份。

| 检查 | 已观察结果与范围 |
|---|---|
| 改造前基线 | typecheck / lint / build、532 单元、168 E2E 通过 |
| 改造后 typecheck / lint / build | 最新复跑均 exit 0；build 903 modules；未新增依赖 |
| 改造后全量 E2E | `npx playwright test --grep-invert PERF0 --workers=2`：190 通过，0 skipped / unexpected / flaky；Edge + Chromium；2026-11-17T12:20:03.371Z 开始，202350.819ms |
| 改造后单元 | `npm run test:unit -- --maxWorkers=2`：70 文件、532 通过，41.89s |
| 契约 / 种子 | `npm run verify:contracts`：13 文件、55 通过；`npm run verify:seed`：2 文件、17 通过 |
| 性能 | `npm run test:perf`：6 通过，两浏览器、每类 30 样本，28.6s；详见 performance-results.json |
| 冻结区 | 后端、gateway、服务、适配器、store、领域、路由、类型和依赖无差异；71 个 Vue script 区块无差异 |
| 模板契约 | 2,017 个非展示指令及原静态链接/原生 type/role 比对无变化；仅排除 class 与 BrandMark 展示尺寸 |

最新默认并发单元复跑曾出现 1 个原有 online 工单用例 5s 超时（531 通过），无断言失败；该用例不加载 UI。原样单独运行通过（2.36s），降低并发至 2 后全量通过，未改业务/测试断言或超时配置。较早 4-worker E2E 曾有历史窗口超时及 ResizeObserver 尚未稳定的瞬时溢出断言；保留原业务，在新 UI 检查中等待真实尺寸稳定，最终 2-worker 全量如上通过。

具体实现、AI保护、视觉差异与未测设备分别见本目录 execution.md、ai-contract-results.md、visual-comparison.md、device-results.md。coverage-results.json 逐项保留待验状态；54 页面/分区、43 窗口组仍不是完成率。

尚未完成：所有窗口/异常状态逐项视觉验收、真实安卓/iOS及软键盘/麦克风、Figma旧Make任务核验与原生Design库。未执行真实付费AI、云端写入、来源同步、真实库操作或部署。
