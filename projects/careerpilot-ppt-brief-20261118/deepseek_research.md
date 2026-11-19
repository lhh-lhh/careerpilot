# DeepSeek API 展示资料核验补充

## Research Brief

基线：当前应用通过同源Node服务调用DeepSeek，已有聊天、结构化JSON、文本流与Search/TTS/ASR/OCR代码；旧报告对默认模式及真实调用状态的描述已经过时。本次只补核验外部协议，不调用付费API、不读取凭据、不下载图片。

缺口：聊天/鉴权/流式协议；JSON模式的适用边界；项目模型名和四类工具端点能否在当前官方文档中对应。受众为课程展示教师；用途为8分钟内开发展示的技术依据。查阅日为2026-11-18。

## 聊天、模型与鉴权

F001：官方“首次调用API”文档列出OpenAI兼容base URL、Bearer鉴权的聊天请求示例，以及deepseek-flash模型名。当前项目使用的模型名与该日官方文档可以对应。

F002：官方Chat Completions接口为POST /chat/completions，以messages和model构造上下文；stream为true时用SSE传输增量，以data: [DONE]结束。thinking.type可为disabled，safety_check.level可为high。

## JSON输出与应用校验

F003：JSON Output使用response_format的json_object类型；提示中需指示JSON并给出格式示例，还需合理设置max_tokens。官方说明可能出现只有空格的内容或因length截断的结果。

因此，JSON可解析只解决格式层问题，不能自行证明简历事实、引用与业务权限正确。后一句是应用设计推论，不把它伪装成供应商给出的正确性保证。本应用另有guardPayload和任务专用检查，属于项目实现事实，记录在项目来源表中。

## Search、TTS、ASR与OCR

F004：官方网页搜索提供POST /v1/tools/search，输入query，返回结构化results。搜索结果不是站内岗位审核结论，后者是项目业务边界。

F005：官方TTS提供POST /v1/tools/tts，支持pcm格式；pcm为24kHz、16bit、有符号单声道原始音频。官方另有WebSocket能力，但本应用不能因为文档支持就被描述为已采用WebSocket。

F006：官方ASR提供POST /v1/tools/asr，以multipart上传整段音频并返回完整文本与duration_ms；不是该接口的实时增量转写。

F007：官方OCR提供POST /v1/tools/ocr，multipart输入，按页返回结果，并标记stop/length。官方接受的文件范围比本应用宽，本应用当前只开放PDF/PNG/JPEG；不能把供应商全部能力算成本平台已实现。

## 冲突与范围说明

本次官方核验未发现模型名或上述四类端点缺乏文档对应，七个官方页面均HTTP200。无需保留“deepseek-flash未证实”“OCR不是官方接口”等假设。来源与链接只在配套facts JSON中维护。

官方文档证实协议存在，不代表本次已发起调用，也不证明账号配额、质量、时延和真人设备验收。既往真实合成探测独立列证，最新UI截图使用隔离测试环境，三类证据不可混称。未引用价格、模型性能排名、上下文长度或日期性发布宣传等展示不需要的外部事实。
