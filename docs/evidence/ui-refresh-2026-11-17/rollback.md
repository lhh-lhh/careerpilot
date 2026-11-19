# 本批恢复依据

## 当前参考图落实版恢复说明（2026-11-18 UTC）

本次本地提交同时收录前轮控件/窗体/13图与本轮63图、纯展示组件和参考样式；具体提交用git log -- docs/evidence/ui-refresh-2026-11-17/final-verification.json定位。当前分支ui-refresh-20261117保留，无推送/合并/公网部署。

生产WebP共76幅、两份hash清单、素材处理脚本及本轮无密钥提示词纳入Git。原始PNG位于本机忽略目录outputs/reference-fidelity与outputs/ui-media-20261118；用户参考图仍在D:/Temp。丢失原稿不会影响已提交WebP运行，但不能声称Git包含原始生图文件。asset-sources/prepare.mjs只做本地机械裁切/压缩，不联网、不重新生图。

回退应先保护后续变更，再逐项反向应用本次提交，不reset/checkout覆盖现有文件；dist是忽略的构建产物，需要在恢复源码后重新build。实际业务数据库、用户账号、凭据及AI配置本次未改，不能用源码归档代替数据备份。原625文件精确基线与项目外恢复验证如下保留。

---

最终候选仍在ui-refresh-20261117本地分支；本轮补齐控件/窗体及13幅图文媒体，未push、PR、merge或部署。原始素材保留在本机outputs/ui-media-20261118（忽略目录，不属于Git恢复包），生产WebP及hash清单纳入本次提交。最终验收数据见final-verification.json；原625文件精确基线不变。

- 原版本提交：`f67b5404c4417ed1e82fcd444e6dc04b863352e9`；develop保留此基线，UI在ui-refresh-20261117分支。
- 项目外归档：`D:/Temp/careerpilot-ui-refresh-20261117/baseline-f67b540-exact.zip`。
- 独立恢复目录：`D:/Temp/careerpilot-ui-refresh-20261117/restore-exact`；625文件与提交blob逐文件SHA-256重验全部一致。
- ZIP SHA-256：`f81a5840bf01affa16eda74645fff0e4482a8dccdff2bae91d49e4c934328925`。
- 不包含实际业务库、凭据、依赖或生成产物；它是源码恢复点，不是生产数据备份。

如需撤回，本批提交建立后先读工作区/staging差异，只反向应用本批精确差异；有后续同文件编辑则逐块处理，不全库reset/checkout，不覆盖用户其他变更。恢复到新目录时检查绝对路径，不能解压覆盖现有项目或真实数据。

初次普通归档baseline-f67b540.zip含CRLF转换差异，不能当作字节精确恢复副本。最终exact归档使用命令级core.autocrlf=false生成；原目录未执行删除/回退演练。
