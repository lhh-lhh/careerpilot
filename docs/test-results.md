# 测试结果

当前AI工作台：60文件461单测、typecheck/lint/build通过；完整双浏览器功能回归结果见 [本轮证据](evidence/ai-workbench-progress.md) 和 `artifacts/ai-workbench-functional-results.json`。真实DeepSeek合成探测7项成功，替身/假麦克风E2E与真人设备验收明确区分。下文均为历史阶段记录，GW11旧not_run不代表本轮未探测。

第五阶段当前结果见 `evidence/stage-five.md` 与 `artifacts/stage-five-*-results.json`：54文件430单测、双浏览器功能（最终118项）、6独立性能、87网关、47契约、17种子；typecheck/lint/build及源码解压验证分别核对，不把历史门禁与生产边界合并。实际五登录四角色、有限索引/预算和schema4恢复也有独立证据；包仅在release-verification为passed时视为通过。

最新第四阶段（2026-11-14）见 `evidence/stage-four.md`：411单测/114双浏览器功能/6性能/87网关隔离/47契约/17种子兼容、typecheck/lint/build通过。包含新库账号和招聘至去向/恢复链；不等于生产部署、真实AI或目标设备容量。下表为历史快照，不替换本次证据。

环境：Windows，Node 24.19.0，npm 11.17.0，Python 3.13.9；日期 2026-11-13。精确产物清单见 release 目录 manifest。

| 门禁 | 最近实测 | 状态 |
| --- | --- | --- |
| TypeScript strict | `npm run typecheck`，exit 0 | passed |
| ESLint | `npm run lint`，0 warning | passed |
| 前端/领域单测 | 40 个文件，310/310 | passed |
| 网关离线/mock | pytest 87/87；1 条依赖弃用警告 | passed |
| 种子/契约 | `verify:seed` 17/17；`verify:contracts` 46/46 | passed |
| 生产构建 | Vite 779 modules；最大 ECharts 块约 408 KiB，无大块警告 | passed |
| 双浏览器功能 E2E | Chromium 158.0.8127.18 + Edge 156.0.4314.58，共 68/68 | passed |
| PERF01 | 100 岗 Worker 30 次：Chromium p95 2.8ms、Edge 3.7ms；初次预处理 0.3/0.6ms | passed |
| PERF02 | 筛选 p95 53.64/90.11ms；路由 p95 22.54/36.36ms（Chromium/Edge） | passed |
| PERF03 | 30 个全新上下文首屏 p95 105.27/109.66ms（Chromium/Edge） | passed |
| B05 Demo ZIP | 解压后直接启动；四角色路由、0 外部请求、0 控制台错误、工作区文件 404 | passed |
| GW09 包扫描 | Demo/source manifest 均 `passed`、0 findings | passed |
| V05 历史稳定版 | 本机仅安装上述当前 Chromium/Edge；未伪造各自第二个历史稳定版结果 | not_run |
| GW11 真实 DeepSeek | 无费用许可、有效本机配置与额度证据 | not_run |
| DEM01 两次完整彩排 | 尚未由真人按 7:30 分镜计时执行两次 | not_run |
| DEM02 正式学号 PDF | 姓名、学号、专业、课程名、完成时间未提供 | not_run |

性能环境为 Windows 10.0.26200 x64、Intel Core i5-13500H、16 逻辑处理器、15.7GiB 内存。PERF01 边界为主线程发起、结构化克隆、Worker 响应；PERF02 从 Playwright 输入到首个结果渲染、从 hash 导航到目标标题可见；PERF03 从全新浏览器上下文导航开始到登录标题可见。每项均为 30 个样本，性能套件固定单 worker 独立运行。

`passed` 仅代表表内明确范围。由于 GW11、DEM01、DEM02 仍未执行，G5 完整门禁不得标为 passed。
