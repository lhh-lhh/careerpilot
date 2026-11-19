# AI 与业务不变量：首批证据

## 当前参考图落实版保护核查（2026-11-18 UTC）

以final-verification.json、source-audit-final.json为当前数据：535单元、55契约、17种子、272双浏览器回归全部通过。71个既有Vue脚本仅允许OpportunityRows/Jobs两处成对展示import；扣除此精确例外后原脚本无差异，3,208原属性约束与业务冻结区无差异；新增纯展示模块不导入服务/存储，不发AI请求。

所有原AI授权、参数、模型、提示词、计费/配额、重试、取消、竞态、结果校验、历史与路由生命周期保持。UI切主题/窗口/缩屏/滚动不会增加生成调用，原面试route key保持。当前新参考用例还断言仅进入岗位/练习页生成请求为0。隔离在线transport回归不是生产提供方、真实ASR/TTS或麦克风最终验收。

素材生成是独立开发工作：前轮5次成功，本轮11次尝试（9成功、job-atlas-b及features-atlas-c连接错误2次；未自动重试）。均为用户授权的Nebula/gpt-image-2.6；未变更平台内AI业务模型，不上传真实业务数据/密钥。费用以提供方账单为准。下方“5次”仅指前轮历史，不是本轮总数。

---

## 最终图文补记（2026-11-18，北京时间）

本次新增静态本地插画及纯展示模板/CSS。源码审计现为71个既有Vue script及3,208项原属性约束；server/gateway及services/adapters/stores/domain/router/types/contracts/composables/data、依赖与配置冻结；原面试专用route.path key不变。审计是有限证据，不是绝对风险担保。

最终回归覆盖原AI默认授权/显式开始、关闭授权的取消、题库异步启动竞态、OCR撤销/离开、流式聊天草稿/IME、提供方失败不造假、历史只读、主题/窗口/缩屏不重复生成。测试仅使用临时SQLite、合成身份及注入transport，不读取或调用生产AI/密钥。完整执行项数量和结果以final-verification.json为准，不将模拟transport称为真实提供方验收。

与首批不同：用户现已授权开发期gpt-image-2.6素材生成，共5次成功请求（3概念、2生产图集），未自动重试；不含真实业务数据/凭据。费用以提供方账单为准，本地不推算。素材生成与平台用户AI业务链路相互独立；没有变更业务模型、提示词、配额、重试、默认授权、参数、取消或输出校验。

以下首批数字为历史，不作为最终数字。

基线：`f67b540`。这是一份有限范围验证记录，不是“绝对无风险”保证。

## 源码冻结

2026-11-17提交前比对：71个Vue script区块未变，2,017个非展示指令及静态链接/type/role未变（class与BrandMark尺寸属于批准的展示差异）。server、gateway、src/services、src/adapters、src/stores、src/domain、src/router、src/types、package.json/package-lock.json相对基线均无差异。

AppShell原面试专用route.path key保持；未添加KeepAlive、out-in、watch请求、自动保存或动画触发业务。CSS装饰pointer-events:none，无脚本/网络/持续动画。

## 新增实际链路测试

`tests/e2e/ui-refresh-ai-invariants.spec.ts`：createOnlineApp + 临时SQLite + 合成测试身份，在提供方transport边界注入响应；真实应用授权、API、路由、状态和提交链保留，不拦截为静态整页。

| 动作 | 原有预期 / 已观察 |
|---|---|
| 进入面试、填目标，未开始 | 生成调用0 |
| 主动开始，第一题transport挂起 | 调用1 |
| 挂起时切深色、打开/关闭帮助、390px、滚动 | 调用仍1 |
| 放行第一题，输入回答，切浅色/桌面/帮助 | 调用仍1；草稿原文保留 |
| 主动确认并提交回答 | 原流程评价1次+下一题1次；累计questions2/evaluations1/calls3 |
| 页面运行错误 | 收集pageerror为空 |

此用例在Edge和Chromium均通过。不能把“一个按钮必调一次”当通用规则：提交回答原流程本来会评价并请求下一题；未改流程以迎合错误测试假设。

全量190项E2E包含既有strict-ai/online-ai/offline-strict-ai、授权/连接、草稿、附件、角色和相关业务测试；契约55项通过。并不等于所有真实提供方输出、真机麦克风、ASR/TTS和外部故障已验收。

未读取真实密钥/数据库，未发起生产/付费模型、生图、来源同步；未修改默认授权、提示词、模型、参数、额度、重试、取消或输出校验。真实调用和费用测试仍需用户另行批准。
