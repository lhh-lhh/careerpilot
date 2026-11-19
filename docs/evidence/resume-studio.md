# 简历工作台增强：实施与验收

范围：用户批准的证书预览、表达建议并列子页、参考图蓝白双栏简历与一键PDF导出。沿用Vue3设计系统、附件ACL、AI默认授权/脱敏票据、固定投递快照，不改变数据库schema或实际用户资料。

## 功能与边界

- `CertificateFiles.vue`按当前actor读取Blob，图片缩略图/预览/原件下载；用户或session epoch变化、ids变化及卸载时撤销Object URL并隔离迟到响应。企业仍只能读取其收到的投递快照证书。
- 原生PDF iframe有效文件预览测试失败（空白，未产生可见PDF）；最终使用`PdfPreview.vue`和锁定版本`pdfjs-dist@6.5.438`，延迟导入本机worker/canvas，仅逐页渲染，限制canvas像素/解码图像大小，关闭/换文件销毁任务。没有文档脚本/注释链接执行层。静态服务补`.mjs`正确MIME，`font-src blob:`只用于嵌入字体，保留script/worker self和object none；不再添加frame-src blob。
- `/student/resume/suggestions`与原编辑页复用组件，保留草稿；先完成路由后生成以免守卫取消新请求，双rAF避免路由滚动覆盖面板定位。桌面并列，390px切换后目标可见。采纳/驳回保留原版本/证据/字段校验，采纳创建新版本后旧建议禁写。
- `presentation.ts`为学生预览、投递确认、学生已投递、企业收到快照和PDF提供统一模板。全部文本XML转义，没有远程字体/图片或伪造事实。投递确认和企业卡片沿用email脱敏，snapshot仍来自原APPLY协议。
- PDF本机SVG→1588×2246JPEG→A4 PDF1.4，多页自动分页。它是高清图片式PDF，非可选文本PDF，不保证站外ATS解析；外站自行上传。站内无需重新上传PDF，直接固定授权的结构化快照并用同款模板展示。
- 姓名+完整教育才开放导出；长左栏摘要显示，完整原文追加补充信息。未提供照片/电话/性别/年龄/自评不生成。

## 本轮验证

最终命令（实际执行，不以计划替代）：

- `npm run test:unit`：66文件，476/476。
- `npm run typecheck`、`npm run lint`、`npm run build`：exit 0。
- `npm run test:e2e -- --workers=4`：Chromium+Edge共144/144，skipped0/unexpected0/flaky0/errors0，约110秒。单测与E2E不同时运行。
- `npm install --save-exact pdfjs-dist@6.5.438`：审计0漏洞；新依赖和lock随源码交付。

新增4个单测+5个E2E（双浏览器10次），原134回归全保留。覆盖XML注入、长字段完整保留、PDF多页/xref、图片预览、有效PDF真实像素渲染、损坏PDF下载fallback、多页证书前后翻页、建议自动定位/移动切换、空教育禁止导出、学生后编辑/企业旧快照不可变、临时SQLite中实际HTTP授权附件和企业PDF导出。不是只检查PDF扩展名或空iframe存在。

Poppler `pdfinfo`确认导出为A4/PDF1.4、1页及4页、无JS/加密；`pdftoppm`渲染后逐页目视检查中文、末尾成果和最后证书未裁切。临时渲染文件`D:/Temp/careerpilot-export-pdf.png`及`careerpilot-long-pdf-1.png`至4.png，不随源码交付。

## Browser与视觉验收

环境：应用内Browser可用，无回退；正式入口`http://127.0.0.1:4174/#/student/resume/preview`只读，隔离演示4173和独立临时SQLite验证写入。桌面1280和手机390×844均检查；PDF渲染在另一个临时端口的隔离HTTP库复核，未向实际用户上传测试证书。

| 检查 | 证据 |
| --- | --- |
| 页面身份、非白屏 | URL/title/DOM为CareerPilot工作台、正式预览/建议子页内容可见 |
| 框架错误覆盖层 | 无 |
| 控制台 | 正式预览、隔离PDF可见后相关warn/error为空 |
| 交互 | 图片点击→放大→关闭；生成→建议并列→采纳新版本；手机切换→目标可见；PDF→真实像素→翻页/关闭；企业旧快照→导出 |
| 响应式 | 390宽无横向溢出，PDF canvas约310px、dialog358px，不覆盖下载操作 |
| 截图 | `D:/Temp/careerpilot-resume-card-final.png`、`careerpilot-advice-desktop.jpg`、`careerpilot-advice-mobile.jpg`；均隔离示例，不是真实个人简历 |

关键序列：reload→url/title/domSnapshot→getByRole交互→可见状态/像素与布局检查→dev.logs→screenshot；viewport结束reset。参考图与最终卡片均用view_image在同轮比较，保留A4原生卡宽794；参考图为811×877的裁切样板，并非完整A4。

| 对照点 | 参考与实现 / 有意差异 |
| --- | --- |
| 配色 | 淡蓝左栏、白色右栏、亮蓝标题及浅色分隔线，未改暖白/渐变 |
| 比例 | 参考左栏约30%；实现234/794≈29.5%，保留双栏层级 |
| 标题与图标 | 教育/实习/项目/技能/证书的蓝色圆标+分隔线；圆内用“学/职/项/技/证”文字，非复制原水印图标 |
| 字体与间距 | 姓名28px、章节20px、正文13px，留白与A4分页；长左栏完整内容转补充信息，防裁切 |
| 文案真实性 | 不复制样例学校、量化结果、GPA或水印；只呈现当前授权数据，缺项不补造 |
| 照片与敏感字段 | 没有用户照片时显示姓名首字圆头像；省略未提供的电话/性别/年龄/自评，企业邮箱脱敏是原权限规则 |
| 正文排布 | 顺序依参考；日期/学校使用可换行的纵向组合以适配真实长名称，未强行同一行左右对齐 |
| 首屏文案差异 | 工作台外壳新增保存版本/图片式PDF/外站自行上传说明是功能所需，不属于简历正文 |

本轮依前端验收技能修复建议结果首屏定位、手机切换滚动和PDF空白；按上述有意差异核对参考的配色、双栏与标题层级，没有剩余已知裁切/遮挡。未宣称逐像素复制样板或真实就业闭环完成。

独立复核代理两次只返回环境约定，未产生有效代码审查，因此不声称独立审查通过。主代理已逐项检查上述实现、附件ACL和APPLY固定快照链路，结合全量测试与Browser验收交付。构建更新时旧标签页曾触发已有的“页面资源加载失败”恢复提示；刷新后新资源正常，已用刷新后的最终截图替换旧证据，使用者需刷新加载新版。

## 实际数据与交付安全

重启前备份：`server-backups/pre-resume-studio-20261115-1940`。最终实际库只读quick_check=ok；users6/resumes2/applications0/companies2/jobs3/resumeVersions4/attachments1，按id逐行JSON与本轮备份一致。本人此前更新的资料原样保留，未重新初始化、未代投递、未向真实DeepSeek发起收费验收。服务health=ok/schema4，仍仅本机候选版。

本轮源码包：`artifacts/resume-studio-final-20261115/careerpilot-source.zip`；包含源码、测试、lock与说明，不含实际库/备份/凭据/API密钥/node_modules。旧包不冒充本轮交付。另一台电脑需npm ci、build并单独初始化自己的新库。
