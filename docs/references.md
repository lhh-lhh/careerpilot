# 引用与 AI 辅助说明

## 技术资料

- Vue 3、Vue Router 4、Pinia 官方文档。
- TypeScript strict、Vite 8 / Rolldown 文档。
- Dexie 4 与 IndexedDB API 文档。
- Apache ECharts 6 按需引入与 SVG Renderer 文档。
- Ajv 2020、JSON Schema 2020-12、RFC 8785 JSON Canonicalization Scheme。
- Playwright、Vitest、FastAPI、httpx、jsonschema 官方文档。
- DeepSeek API 文档仅用于网关协议实现；本轮未发起真实付费请求。

精确依赖版本以 `package-lock.json`、`gateway/requirements.lock` 与 release manifest 为准。前置需求、数据、算法、AI 与测试契约位于 `docs/baseline/`，开发中不改写基线原件。

## AI 辅助开发声明

项目开发使用 Codex 辅助阅读规格、生成候选实现、编写测试、排查构建/浏览器问题和整理文档。人工验收边界包括：所有关键业务先以失败测试复现；数值算法与状态迁移由确定性代码和固定夹具验证；AI 输出经 JSON Schema 与语义守卫；生产页面通过真实 Chromium/Edge 与截图检查；秘密与交付包走允许清单扫描。

视觉概念图 `outputs/login-concept.png`、`outputs/student-home-concept.png` 使用用户配置的 Nebula gpt-image-2.6 生成，只作设计参考，不作为可点击产品界面。驾驶舱和管理台不使用生成图片，图表、文字和控件均由实时数据与原生代码渲染。
