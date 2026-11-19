# 路鸣职引 CareerPilot

2026-11-16交互修复：登录返回地址按实际账号角色校验，跨角色旧链接返回本人工作台；403仍保留，新增返回本人工作台入口。全局助手支持Enter发送、Shift+Enter换行及中文输入法防误发。在线学生“模拟面试”下新增仿真语音面试、文字输入法面试、题库练习三个子栏；题库每张卡片均可直接选择文字或语音练习。开场/追问/评价继续调用DeepSeek，不以模板问题代答；打开题库或换一组不产生生成调用。语音卡片点击后进入房间并播放、申请录音权限，刷新只读取历史、不自动录音；撤销授权后需手动继续。原账号、旧链接和业务记录保留，刷新页面即可加载新前端。

2026-11-15最新改造：全平台可执行AI生成严格调用DeepSeek，失败不以回放/规则代答；新增真实OCR、动态文字面试、模型岗位推荐及调用凭据。全局入口使用原版dsh-pet动画，标注AI Chatbot，聊天关闭时长按约300ms也可拖动。使用原账号访问 http://127.0.0.1:4174/ ，不要重新初始化。最新范围见[严格AI与pet使用说明](docs/strict-ai-pet-runbook.md)及[本轮验收证据](docs/evidence/strict-ai-pet.md)，下文早期“三态AI”记录仅为历史。角色仅限非商业学习；来源与许可见[第三方声明](THIRD_PARTY_NOTICES.md)。

AI求职工作台候选版已接入：全局流式助手、可撤销简历优化草稿、意愿岗位匹配、TTS/整段ASR语音面试与报告。仍使用 http://127.0.0.1:4174/ 和原账号；最新启动/演示/验收边界见 [工作台运行说明](docs/ai-workbench-runbook.md) 和 [本轮证据](docs/evidence/ai-workbench-progress.md)。本轮已完成合成材料真实DeepSeek探测，不等于生产放行或真人麦克风验收。

第五阶段（2026-11-14）本机在线候选版：公开岗位搜索/筛选/详情、适量NCSS审核索引、个人求职记录和来源治理已接入；实际服务仍用 http://127.0.0.1:4174/ ，原五账号不变。首批20条中17发布/3未发布，另2条旧索引待审，无批量补抓。最新范围与验证见 [第五阶段证据](docs/evidence/stage-five.md)、[运行维护](docs/stage-five-runbook.md) 和 [未放行项](docs/stage-five-issues.md)。源码交付包为 `artifacts/stage-five-release/careerpilot-source.zip`，不是离线演示包；不包含实际数据库/密码。

面向高校毕业生的就业管理与智能服务 Web 应用。默认使用账号登录的同源在线服务，保留显式离线教学入口；原 C++ 工程、冻结版和原始课程文件保持不动。

## 当前阶段

当前范围以上述AI工作台运行说明为准；第五阶段公开机会、第四阶段账号底座继续保留。当前已验证本机运行，尚未获得公网生产放行。[第四阶段运行说明](docs/stage-four-runbook.md)、[第三阶段验收](docs/evidence/stage-three.md)及下述M1–M5记录保留为历史。

M1–M4 已实现：工程与设计系统、本机事务数据层、确定性领域算法、三态 AI 与受限 DeepSeek 网关，以及学生、企业、辅导员、管理员四角色闭环。学生端覆盖简历/匹配/投递/模拟面试；企业端覆盖岗位到协议；辅导员端覆盖去向审核、A7 驾驶舱、预警与帮扶；管理员端覆盖来源、版本、脱敏审计和复位。

M5历史阶段曾因缺少配置将GW11标为`not_run`；本轮已有7项合成材料真实DeepSeek探测，不能反向改写历史结果。姓名/学号/课程字段及真人彩排仍未提供或执行，因此G5完整放行与正式学号PDF不作虚假声明。历史边界见 [开发记录](docs/development-progress.md)。

## 运行

实测环境 Windows、Node **24.19.0**、npm **11.17.0**。支持预装 Node >=22.12 且 <25、npm >=10 且 <12。依赖版本锁定在 package-lock.json。运行包不能双击 index.html。

开发准备（首次且有网）：

```powershell
npm ci
npm run build
```

日常服务启动：首次初始化后双击 `start-service.cmd` 或 `npm start`，访问 **http://127.0.0.1:4174/**。不会隐式创建或重置数据库。旧离线入口为 `start-demo.cmd` 或 `npm run start:demo`（4173）；两种数据互不混用。Ctrl+C 关闭本次服务。

### 账号在线服务（Node 24）

在安装依赖并构建后，首次显式初始化：

```powershell
npm run init:online -- --credentials-file "D:/受控目录/全新账号表.json"
npm run start:online
```

访问 **http://127.0.0.1:4174/**。初始化生成五个独立随机密码账号：admin、teacher.lin、student.chen、student.li、hr.yuanxing。人员是经用户授权配置的初始服务身份，不等于已核验真人；企业资质需另外审核。没有旧版岗位/投递/协议/去向业绩。初始化可加 `-- --credentials-file <全新本机文件>` 避免密码出现在终端输出，文件应仅向操作者开放。首次登录后修改密码。重复初始化拒绝覆盖；本机改密用 `npm run password:online`，旧会话失效。

新服务数据位于 `server-data/service.sqlite`，不覆盖旧 `careerpilot.sqlite`，不可静态公开，不进入交付包。环境变量 `CAREERPILOT_DATABASE` 可指定独立库，`CAREERPILOT_PORT` 可指定端口；CLI 仍仅允许 loopback，等待 TLS/部署安全验收。学生与企业自行注册后待审，辅导员和管理员凭邀请开通。未审核账号无业务、附件、SSE和AI权限。HttpOnly会话、CSRF、密码哈希、一次性邀请及持久限流由同源服务管理。

第三阶段提供原生一致性快照，包含WAL最新提交并生成SHA256清单，备份和恢复均要求全新目标目录，不会覆盖已有目标：

```powershell
npm run backup:online -- "D:/受控备份/原库/careerpilot.sqlite" "D:/受控备份/快照-新目录"
npm run restore:online -- "D:/受控备份/快照-新目录" "D:/受控备份/恢复-新目录"
```

恢复得到新目录中的 `careerpilot.sqlite`，切换前停服务、保留原库并核对快照之后的业务写入；恢复会撤销旧会话。用 `CAREERPILOT_DATABASE` 显式指定恢复库再启动。不要运行时仅复制主库。发布使用完整版本目录、停服务后切换并让用户刷新；不支持无缝热替换dist。运维步骤见 [运行手册](docs/stage-three-runbook.md)。

### 同源AI

在线模式不开放本机配对网关，由服务端重建权限内上下文。当前CLI读取项目外DPAPI加密密钥或 `CAREERPILOT_DEEPSEEK_API_KEY`；有密钥且 `CAREERPILOT_AI_ENABLED` 不为false时启用，不再要求旧版COST_APPROVED。默认官方DeepSeek、deepseek-flash，全局100/每用户40次每UTC日，新旧网关共享次数额度（不是金额预算），失败不自动付费重试。AI按用户要求默认授权，点击生成才外发并可能产生费用，顶部总开关可停止未完成请求与录音，刷新恢复默认开启；无法撤回已经发出的内容。业务保存和投递确认仍保留。配置、数据范围及限制详见 [运行说明](docs/ai-workbench-runbook.md)。

六项招聘补充与新企业试运行操作见 [补充使用说明](docs/recruitment-supplement-runbook.md)，实际推进阶段及验收结果见 [开发证据](docs/evidence/recruitment-supplement-progress.md)。新企业与3岗位已上架，现有学生须本人补教育经历后再投递，不以测试履历替代真实资料。

简历与去向草稿按账号/模块暂存在当前标签页sessionStorage，刷新后可明确恢复或丢弃，保存仍检验原revision；退出清理。不是跨设备草稿、关闭浏览器长期恢复或离线自动提交队列。

开发服务器 `npm run dev` 固定 5173，与正式 4173 不共享 IndexedDB，不能把切换 origin 误称为数据丢失。

## 验证

```powershell
npm run typecheck
npm run lint
npm run test:unit
npm run build
npm run test:e2e -- --project=chromium
npm run build:release
```

Playwright Chromium已预装，另配置本机Edge的 `--project=msedge`。B03同时覆盖已有4173服务的占用场景，不会关闭不属于测试的服务。`verify:seed`执行实际种子与聚合校验；`test:perf`验证PERF01（100岗位Worker往返30次）；`verify:contracts`和`test:gateway`分别运行AI协议与本机网关测试。`build:release`生成 `artifacts/release/careerpilot-demo.zip` 与 `careerpilot-source.zip`，前者无需 `npm install`。

## 架构与边界

Vue 3 + TypeScript strict + Vite / Vue Router hash / Pinia；Dexie、纯TS领域内核、预编译Ajv Schema及本地ECharts已接入。自研CSS/组件，无CDN或外链字体。领域不依赖Vue，业务组件通过服务层访问数据。

离线四角色是本机教学模拟；在线四角色由服务端会话和归属授权。国家平台资源为可追溯外链索引，外部申请在原站办理，不映射成本平台企业的发岗、认证或投递记录。离线FastAPI网关与在线同源adapter分离，均不把上游Key交给网页。真实调用需明确授权；本轮真实合成探测与隔离替身测试分别记录。

## 视觉与素材

灯塔 Lighthouse Design：清晰、指引、不喧哗。全站按业务页面族设计，避免单调模板。精确色值与无障碍规范见05 §11；实现规格与偏离见 `docs/visual-spec.md`。

`outputs/login-concept.png` 和 `outputs/student-home-concept.png` 为 Nebula / gpt-image-2.6 生成的设计参考（均为1536×1024），不作为产品截图或可交互界面；`outputs/rendered-student-home.png` 是真实实现截图。登录页独立插画生成曾连接失败，未重试、未换模型，当前使用项目原生品牌路径图案。提示词在 work/ 下，均无凭据与个人数据。

开发工具链的 typescript-estree 依赖经审计存在 minimatch 放大风险，已定向锁定 minimatch 11.0.1（相同公开匹配 API），不是大范围自动升级。npm audit 已复查，后续仍随锁文件持续审计。

公共门户主图为 Nebula / gpt-image-2.6 生成的虚构校园场景，首次失败后按用户授权延后重试一次成功；实际接入 `public/media/campus-ai.jpg`（1200×800），保留 CC0 备用图和缺图占位。来源与处理见 `docs/media-manifest.json`。

## 原始文档

`docs/baseline/` 是开工时复制的不可变参考；新增决策与实际运行记录单列，不覆盖原件。正式报告只能陈述已经实现、实际验证过的结果。
