# GitHub双仓更新

2026-10-23 通过 GitHub 当前 PR 状态及远端分支复核：数据仓 [PR #3](https://github.com/y4ho0/symgene-data-pipeline/pull/3) 已于 2026-10-21 合入 `dev`，合并点为 `4555344860228c086dbe3e51e608b928b2f9b29b`；[PR #4](https://github.com/y4ho0/symgene-data-pipeline/pull/4) 已于 2026-10-23 合入 `dev`，合并点及当前 `dev` 均为 `c8e9c57e120515d7846dff90d2127896ec6e2c20`。PR #4 的主题 HEAD 为 `9c8094b1aa72633527876a0245546101f1a3492f`，不能与合并点混用。

网站 [PR #34](https://github.com/miracleqihe/symgene/pull/34) 仍为 OPEN、非 Draft，主题分支为 `codex/t02-local-split-20261016`，目标为 `dev`。本轮开工复核的主题 HEAD 为 `868b09399e7c5417b60d96b8210d1c536338cab4`；它是本轮修改前基线，后续提交与 CI 以 PR 的最新主题 SHA 为准。本轮允许必要修复、提交和正常推送，不批准或合并网站 PR，不部署或切换生产采用。

历史说明：2026-10-16 首次同步时，数据仓 `dev` 基线为 `384fd9bfd8bb083d958858a7ef397933eb02f2d1`，两项 PR 当时均为 Draft。该基线只保留为历史记录，不再代表当前数据仓 HEAD 或 PR 状态。

## 已接入的内容

114药物、122疾病、122案例及358份词条Prompt、全局与六模块指南、Skill，保留本机已有原稿、关联、修订和地区限定。没有在本轮工程接续中生成新的医学结论。结构检查不替代独立医学审校。

数据仓src/content为编写源；网站保留固定导出副本，可以离开数据目录独立构建。相同19文件digest为e2c3a7dc114ec2ae063b32bc7a811d23c19840291db5c4ae4521bc7cc8090489；legacy-content.lock用于现有legacy同步校验，不是正式T02发布批准。原content-pack.lock、搜索、存储和认证消费边界保持。

本轮对已合并数据仓 `dev` 的 19 文件逐一核对路径、字节数、SHA-256 和实际字节，19/19 相同；版本仍为 `local-e2c3a7dc114ec2ae063b`，未重新导入或改写正文，两份内容锁均保持原字节。完整清单及锁校验见[配对核验](local-data-handoff.md)。数据仓工程合并不构成医学、公众表达或来源使用/再发布批准。

参考工具在数据仓scripts/reference，资料原件、全文稿、索引、真实输入和个人配置仍在Git外。35项机构/地图工具与裁定材料仍在本机HOLD；未把它们或另一台电脑的原开发历史混入可交付历史。

## 保留的接续入口

用户负责范围、具体输入批准与保管；其他人员暂缺，保留接口。数据仓docs/acceptance保存确认、G2两报告槽、G3/G4交接和358项content-review-register.template.json。实际审读记录在Git外填写，不作为公众页面状态。

原仓B01–B09全文现已可读，A2仍待用户读后确认。G2实际输入和结果、G3专业审核及G4/G5继续独立验收。此次授权撤销本次代码增量的旧“暂不push”约束，历史本机报告中的未推送状态仅记录当时事实；不把代码推送记作业务验收通过。


评审修复补充：局部修订的静态Markdown现附逐点公开来源；工程与内容验收分开，Ready for review仍待实际Approve。网站已增加生产公开阻断及可下载的浏览器/恢复证据，最新说明见[评审修复](local-review-remediation.md)。
