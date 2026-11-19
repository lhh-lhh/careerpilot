# AI 求职闭环设计（已获用户批准的对话方案）

用户于 2026-11-15 批准按推荐方案开发，并授权必要的真实 DeepSeek 调用。目标：全局助手、分部分简历优化草稿、可信岗位匹配、自动轮次式语音面试及有证据的逐轮报告。

## 约束
- 保留 Vue3/TypeScript/Node/SQLite、既有权限/CSRF/revision/幂等与离线演示。稳定演示兄弟目录不动，不创建Git初始提交，不重置任何文件。
- 密钥不进入源码、浏览器、日志、数据库或交付包；Windows 当前用户 DPAPI 加密保存，可由环境变量覆盖。付费调用使用合成材料，次数与输出上限，无自动付费重试。
- 所有新接口位于 /api/workbench，沿用登录和CSRF；所有记录按用户隔离。模型上下文后端按权限重建，简历事实保真，未知岗位信息不补造。
- 对话型流式文本独立于结构化业务输出。后者使用内容安全+文本JSON，再经服务端验证，不假设JSON mode与扩展参数可组合。
- 简历建议先应用到草稿，最后一次SAVE_RESUME生成版本；关闭提示，撤销草稿，恢复历史仍新增版本。
- 语音：浏览器16kHz单声道16bit WAV，最长120秒；自动检测停顿+手动结束；DeepSeek整段ASR，TTS流式PCM24k。不声称流式ASR或无延迟双工。
- 面试提问结合岗位与回答；每轮AI参考分保留依据、量规版本；服务端计算逐轮均分，报告页对有效逐轮参考分等权平均；旧规则报告不改。音频默认不落盘；个人记录可删除。
- 真实岗位源为已审核本地/外部索引或用户JD。Search仅在明确联网操作中执行，不绕过已有来源同步限制；外部最小字段只做部分匹配，unknown不视为通过。

## 接口
GET /status -> {enabled,model,limits}; POST /generate {kind:'resume',context:{sourceRevision?},consent:true} -> {data,requestId,mode:'LIVE'}；仅简历生成独立开放，提问和评分由会话动作服务端生成并验证。
POST /chat {conversationId?,message,page,consent:true,web?:boolean} -> text/event-stream delta/done/error；GET /conversations，GET /conversations/:id，DELETE /conversations/:id。
POST /speech/asr 原始audio/wav，x-ai-consent:true -> {text,duration_ms}；POST /speech/tts {text,consent:true} -> audio/pcm。
GET /matches -> {items,resumeVersionId,asOf}；POST /matches {preferences,consent?:true,discover?:boolean} -> 同上（缺信息不生成完整分）。
GET /sessions，POST /sessions {target,consent:true}，GET /sessions/:id，POST /sessions/:id {expectedRevision,action:'answer'|'next'|'complete',text?,consent?}，DELETE /sessions/:id。answer/next需要consent:true，complete无外发。问题及评价是服务端保存的权威内容。
前端 http.ts 新增 aiFetch（携带当前CSRF，不复用20秒短超时）；类型在 src/types/ai-workbench.ts。

## 交付验收
真实TTS→ASR→模型至少一次合成材料验证；新增单元/HTTP/E2E覆盖授权、跨用户、预算、取消、过期revision、JSON异常、音频长度、无结果和草稿不自动保存；typecheck/lint/build与原测试回归；浏览器检查桌面及移动端、主子页和会话交互。物理麦克风与真实设备体验如未测试明确保留，不冒充验收。
