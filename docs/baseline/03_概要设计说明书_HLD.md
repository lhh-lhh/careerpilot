# 03 · 概要设计说明书（HLD）

> 路鸣职引 CareerPilot · v1.5 · 2026-11-12 · 最终开发文档基线
> 02定义范围；10定义数据/状态；11定义算法/统计；12及Schema定义AI协议；13定义验收；14定义执行顺序。本册不另造第二份字段或Provider协议。

## 1. 设计目标与原则

| 目标 | 设计约束 | 验证 |
|---|---|---|
| 合规且前端为主 | Vue 3 + HTML/CSS，TS编译为JS；Python只做受限AI Gateway，接入必做/运行按需 | 08组合②、13 B01/S03 |
| 默认不依赖外网 | 本地静态HTTP + IndexedDB + REPLAY/RULE；非file:// | B01–B05/E08 |
| 可解释与可测 | domain纯TS、全部数值本地确定性计算 | 11及ALG/MET |
| 业务一致 | 各实体独立状态机，事务提交后刷新派生数据 | 10及L01–L07 |
| AI可控 | Provider只返回文本增强，不直接写业务；Schema+语义双守卫 | 12及AI01–AI12 |
| 教学隐私边界诚实 | 全虚构、最小字段、作用域检查，不冒充生产安全系统 | S01–S04 |

品牌、四角色、MVP四模块、单机与双主题均沿用，不新增云平台或业务后端。领域逻辑不import Vue，组件不直接访问数据库，用户/模型文本不使用v-html。

## 2. 总体架构（L0–L5）

```
L5 交付：dist + 本地Node启动器 + 文档/测试证据 + PDF/演示
L4 Vue视图：Router/hash + Pinia + 设计系统 + ECharts/SVG
   ↓ 只经作用域services
L3 应用服务：授权/快照/命令/事务/复位/AI编排
   ↔ domain纯TS：T1/T3/T4/T5/T6、A7指标（T2仅P1）
L2 adapters：Dexie Repository；Live/Replay/Rule文本Provider
L1 必做FastAPI AI Gateway（离线不启动）：配对/校验/限流/SSE/DeepSeek/本机凭据
L0 现代浏览器：IndexedDB/Worker/Fetch/AbortController
   + 本机127.0.0.1:4173静态HTTP（默认必要，非业务服务）
```

这里的services是浏览器内部应用服务，不是远程服务器。纯函数只接收快照；持久化真相源只有IndexedDB。Gateway属于AIProvider的网络适配，不是DataRepository的HttpAdapter；**不保留业务HTTP双模**，不映射旧88条CRUD。

## 3. 技术选型

| 项 | 冻结选择 | 原因/边界 |
|---|---|---|
| 前端 | Vue 3 + TypeScript strict + Vite | 方向已定；原生JS/React均非不合规，但本轮不切换 |
| 路由/状态 | Vue Router 4 createWebHashHistory；Pinia | 深链刷新无需history服务器回退；会话、UI、派生缓存分离 |
| 样式 | 自研CSS变量/局部样式/组件 | 05 §11全量令牌；不用Bootstrap或重量级UI库 |
| 可视化 | ECharts本地按需打包 + 自绘SVG | 图表值来自11，不从模型或静态截图取得 |
| 数据 | Dexie/IndexedDB + 经校验SeedPack | 10的索引、外键服务校验、事务和revision |
| 校验 | Ajv 2020 + formats | 12/Schema与语义守卫，不接受任意UI自带Schema |
| 异步 | Worker、Promise、AbortController、防抖、可取消队列 | 单Worker分批让出处理取消，不声称改善算法渐近复杂度 |
| 测试 | Vitest/fake-indexeddb + Playwright | 13门禁；真实浏览器测试不可由内存模拟替代 |
| AI网关 | Python/FastAPI + httpx | 用户选定；DeepSeek首适配，接入必做/离线不依赖；凭据与运行详见15 |
| 启动 | 本地Node统一启动器，auto/live/offline三模式 | 静态4173、网关8787；不临时下载/安装/构建，不静默换端口；见15 |

Node/npm范围及锁定策略见14；准确依赖版本在M1实际解析并写锁文件，本轮不安装。无CDN、外部字体、BaaS、C++编译链或原SQLite库运行依赖。

## 4. 模块和目录

以下仅为未来目录规划，当前不创建：

```
careerpilot/
  src/
    domain/{matching,resume,interview,lifecycle,metrics,policy,ai-guard}/
    services/                 # scope、命令、事务协调、快照、reset与AI编排
    adapters/repository/      # Dexie db及内部读写
    adapters/ai/              # AIProvider、live/replay/rule
    data/seed/ data/replay/   # 全虚构种子；独立不可变回放资产
    prompts/ types/ workers/
    stores/ router/ views/
    components/{base,business,charts}/
    styles/
  tests/{unit,e2e,fixtures}/
  scripts/                   # start-demo.mjs与契约/种子核验
  gateway/                   # 必做DeepSeek适配；专用.env不交付/不暴露；离线不运行
  docs/ artifacts/
```

P1 retrieval目录只在A5启用后建立。依赖为views/components→stores/services→domain/adapters→types；domain只依赖types与纯函数工具，不依赖services/adapters/Vue。数据适配层不得反向import视图。

## 5. 核心机制

| 编号 | MVP地位 | 职责 | 唯一详细规格 |
|---|---|---|---|
| T1 | Must | 六维匹配、贡献分解、技能图谱、What-if、Worker | 11 §2 |
| T2 | P1可选 | BM25检索、引用、阈值拒答 | 11 §6；启用后补Schema |
| T3 | Must | 脱敏、Schema/语义守卫、取消/超时/降级与审计 | 12 |
| T4 | Must | 三主题题本、最多两追问、六维证据评分 | 10 §6、11 §4 |
| T5 | Must | 多实体状态迁移、幂等与原子事务 | 10 §3–5 |
| T6 | Must | 体检/ATS、保真改写、三种文本用同规则重评 | 11 §3 |
| A7指标 | Must | 作用域统计、预警、六类白名单问数 | 11 §5 |

### 5.1 T5：业务叙事不等于单实体枚举

Application只有applied/screening/interview/offered/rejected/withdrawn/closed。
Interview、Agreement、Destination、Assistance、MockSession各自有状态表，不能拼成一条“10态链”。模拟面试不推动招聘；预警只派生Alert，不写EXCEPTION。签约需双确认和单生唯一有效协议，独立升学/创业等去向不要求内部协议。

所有命令经services授权，domain验证迁移，Repository事务写对象+事件+审计+receipt。事务提交后才派发刷新通知；事件总线不是事务替代品。

## 6. 数据模型（D1–D7）

| 分组 | 主要实体 | 关键约束 |
|---|---|---|
| D1 身份组织 | User/Student/Company/Dictionary/Config | scope与counselorId、公司归属；非空字典 |
| D2 简历 | Resume/ResumeVersion/SkillOntology | 7段结构、版本只追加、技能DAG |
| D3 招聘 | Job/Application/ApplicationEvent | 稳定ID、唯一投递、同意的脱敏快照、事件独立 |
| D4 面试 | Interview/MockSession/MockQuestion | 真实与模拟分离、可续答、证据评分 |
| D5 内容 | contents/Appointment/Fair/KnowledgeChunk | 内容示例标识；可选域不建伪成功 |
| D6 结果治理 | Agreement/Destination/Attachment/Assistance及可选问卷等 | 协议双确认、去向审核、Blob持久化、帮扶不清风险 |
| D7 运维 | AiRun/AiReplay/Notification/AuditLog/CommandReceipt | 来源真实、脱敏审计、幂等、取消epoch |

10是所有字段、索引、关系、删除与复位的唯一数据字典。ResumeVersion不嵌套自己的历史；Application不再冗余events[]。附件Blob写入IndexedDB，临时URL仅渲染时生成；不能只存内存URL。

完整SeedPack的40学生/100岗位/120投递等数量与固定KPI严格见10 §8，不在本册另写不同下限。原始个人数据不直接迁移。

## 7. 接口边界

### 7.1 作用域服务与Repository

业务命令统一形状见10 §3：
`execute({type,commandId,entityId,expectedRevision,payload},actor,clock)`。
具体命令为discriminated union，payload依事件及实体校验，不使用任意Partial<T>修改status。

read/list由services注入Scope；原始Repository只对services导出。创建时expectedRevision=0，更新需当前revision；成功更新递增1。CommandReceipt跨业务/审计与事件同事务。错误使用FORBIDDEN、VALIDATION_ERROR、INVALID_TRANSITION、REVISION_CONFLICT、COMMAND_COLLISION等类型码，不能静默吞错。

### 7.2 AIProvider

以12 §2的AiRequest、AiResponse、AiFailure及配套Schema为唯一接口。complete与stream均返回通过本地守卫的同一结构；module限MVP A1/A2/A3/A7，扩展需独立Schema。

ViewModel合并当前本地数值与文本增强，回放不能携带旧score。默认REPLAY，失配→RULE；LIVE失败→REPLAY→RULE；取消不降级。来源MODEL/RULE/CURATED和requested/effective态分别记录。

### 7.3 真实AI Gateway

端点/Origin/配对/凭据/统一启动详见15；12定义业务payload、守卫与回退。DeepSeek首适配为Must，离线不启动网关。无配置显示未启用并本地降级；stub只测失败边界，四模块真实联调最迟G5验收。

### 7.4 纯函数

14 Task4固定导出transition、match、diagnose、scoreAnswer、calculateMetrics；参数及返回字段由10/11定义。T1预处理O(K(K+E))，批量O(n·m·r+n log n)，内存O(K²)，符号及计时边界见11，不再使用旧O(n·m·k)口径。

## 8. 安全与隐私

本地教学模拟不抵御设备拥有者/开发者工具，不能宣称具有服务端隔离。仍需路由与services两层授权：学生仅本人；企业仅自己职位的同意快照；辅导员仅所辖；管理员全量管理但读取简历须留审计。

无公开注册、无真实密码；前端/种子/仓库无上游Key；角色只能管理员授予，保留最后管理员。变更会话/角色/reset令旧任务失效。本人清除包含关联删除、审计匿名化与退出，见10 §7。

LIVE须显式同意脱敏外发，附件不发送；前端不保存上游凭据；短期配对令牌只存内存。禁止自动采纳、自动投递/签约/审核。改写不虚构数字或职责；保留原文，strategy/keepMyTone约束风格，REPLAY/RULE确定性、LIVE不承诺重复字面一致。未来Key仅在15的本机网关配置；本轮不配置密钥或实际调用。

## 9. 运行与交付

默认production包：dist + scripts/start-demo.mjs + 启动说明 + 本地种子/回放，预装Node和现代浏览器。入口固定http://127.0.0.1:4173；开发5173是另一套存储，不能误称丢数据。端口占用明确停止，不能自动换端口。

reset-demo是应用内授权命令：取消请求、epoch递增、原子种子复位、Clock/REPLAY恢复、退出P01。不能用外部Node脚本直接改浏览器IndexedDB。打印由浏览器完成，不冒称已有自动报告生成器。

真实网关由15统一启动器按需启用；公网托管仍为范围外演进，不能分发含Key配置。若改origin，IndexedDB不共享，须在该origin重新初始化并验证。默认无跨设备同步。

## 10. 六章课程证据

HTML/CSS：设计令牌/布局/主题/打印；JS：TS纯函数和人工复核；DOM事件：表单、拖拽、焦点；SPA：Router/Pinia；Web Server：静态HTTP的MIME/404/路径安全及原服务器协议对照；异步：Worker、取消、队列与回放分块。

SSE真实网络属于正式LIVE接入，默认回放只是本地分块模拟，报告不能混称。T2/BM25仅实现且验收后写入成果。

## 11. 关键技术与证据

T1/T3/T4/T5/T6、A7与设计系统构成核心技术故事。每项需13运行报告，性能阈值不是已经达标，规则rubric不是通用招聘能力测量。未启用扩展记not_enabled，不拿规划当成果。

## 12. 开发衔接

本轮已冻结文档接口，但没有创建应用工程。用户另行授权后按14执行G1–G5：骨架→领域→三态/真实网关与三招牌→四角色+A7接线→含真实联调的交付。07的G0文档准入不替代后续运行门禁。
