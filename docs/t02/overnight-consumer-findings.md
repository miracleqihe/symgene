# T02 夜间网站消费边界复核

本轮仅加固本地合成采用流程。生产继续读取 legacy；网站原有数据、医学规则、排序、UI、storage v4、备份实现、golden 与永久 ID 基准未改。未访问真实原料、个人浏览器存储或真实审核材料，未制造 public 审批身份。本报告不授予正式 T02 验收或发布权限。

## 可重现发现与处置

初始基线是网站提交 `dafbbc71cdfafb2594f794ace172c901031b4704`。红队在 Git 外创建虚构夹具，通过真实 `buildPack` / `verifyPack` 构建并核验完整包；配置反例使用真实合成候选包的临时副本。完整红队结果保存在工作区外层 `.t02-evidence/overnight-stage2-website-red.json`，不作为内容包发布。

| 等级与边界 | 修复前实际结果 | 本轮处理及回归 |
| --- | --- | --- |
| P1：依赖药物直接撤稿 | 病例的 `drugIds` 指向撤回药物，而其疾病只关联另一安全药物时，病例仍可见；本地 override / custom case 同样绕过 | 所有实体的 `disorderId` / `diseaseId` / `relatedDrugIds` / `drugIds` 参与依赖图。storage 合并后对四类知识记录检查全部关系并反复隐藏完整依赖记录，不改关系或正文；真实合并、墓碑、备份恢复、搜索和详情边界均有回归 |
| P1：采用后的权利或审核过期 | 包在有效时采用，权利随后到期，重新验包已报 `RIGHTS_EXPIRED`，但 fresh emergency 状态仍令四类内容可见 | adapter 保留 rights / reviews 的最近截止时间；到期即保守隐藏本包全部高风险知识和机构。更新 emergency 不能延长审批或权利有效期；检查到期边界和到期之后 |
| P1：跨包永久身份 / 重定向被重用 | 两个分别合法的包可让同 canonical ID 改绑 legacy ID，或让历史 redirect 改指另一仍活动资源 | 与全部已采用档案及保留身份比较，拒绝 canonical 类型或 typed legacy 绑定变化、未明确 redirect 的 legacy / provider 迁移、历史 redirect 删除 / 改绑 / 重新激活。已有 ID→新 ID 的明确重定向链可以继续；真实包链、JSON 恢复及旧包回滚后撤稿仍隐藏 |
| P2：真值代替明确授权 | `{ok:false}` / `"false"` 被当成网站校验成功；字符串 review / trusted 同样放行 | review、网站验证及 emergency trust 必须严格为布尔 `true`；采用和回滚均验证 |
| P2：模拟状态范围损坏 | `scope: public` 或 `production: candidate` 仍可采用和回滚，并保留错误范围；独立复核还证实，保留正确模拟标签但把恢复状态的 active bundle 改为 public 后，四类内容仍可投影 | 采用、回滚、emergency 更新及知识投影均要求 `scope: local_simulation_only` 与 `production: legacy`；投影入口另行要求 active bundle 的 mode 严格为 simulation，拒绝 `ADOPTION_ACTIVE_MODE_REJECTED` |
| P2：描述符解析与路径边界 | lock / provenance 重复键被最后值覆盖；lock 文件、候选目录和 vendor 根 symlink 被放行 | 新增本地配置读取器，拒绝重复键（含转义后同名键）、错误 UTF-8、超大 / 过深配置；逐个检查 checkout anchor 下路径组件，拒绝 lock、候选和 vendor 的符号链接，vendor 源必须是普通文件 |

未来生效的包内撤稿在生效前可见、生效后隐藏；过期 emergency 状态隐藏全部高风险内容。这两项红队正向对照原已符合预期，保留现有测试与行为。

恢复状态的 mode 反例先记录于外层 `.t02-evidence/overnight-stage2-restored-mode-red.json`：正确模拟标签及 fresh emergency 下，故障注入的 public mode 曾被接受并显示四条虚构知识。此反例只修改内存中的合成状态，没有创建 public 审批记录；新增独立回归验证明确拒绝，结果纳入同轮 green 测试日志。

## 最小实现选择

`read-local-config.mjs` 只读取本地 lock / provenance 配置，限制 1 MiB 与 64 层嵌套。它没有内容字段 schema，也不替代 pipeline 的唯一规范。网站仍消费受 provenance 摘要锁定的规范与完整包 verifier。本轮未手改 vendor、lock 或不可变内容包。

运行期有效期采用保守的整包截止：任一已使用 rights / review 到期，全部高风险条目隐藏，等待重新核验与审核后的新快照。此策略不推断新的医学风险分级，也不自动续期。历史依赖仍作保守并集，撤稿不因重新采用或回滚而清空；用户 storage 与备份字节保持原样。

永久身份检查允许显式前向重定向链。例如历史 `A→B` 更新为 `A→C` 时，候选还必须明确给出 `B→…→C`；不能把既有别名直接改指无关机构。回滚重新核验精确历史包，同时保留后来已知的撤稿与身份图。

## 本地验证与边界

新增 `tests/content-pack-overnight.test.mjs`，与原 `tests/content-pack.test.mjs` 一同运行。所有新包、审核和存储均为确定性合成夹具；有效采用的回调执行真实网站 `validateData`，拒绝路径才注入明确的假值。外层 `.t02-evidence/overnight-stage2-website-green-tests.json` 和同名日志记录本轮 Node 22 的实际结果；正式完整验证由汇总流程另行记录，不能用此聚焦测试替代。

T01.2 签收、合法真实输入双跑、人工事实 / 医学 / 权利 / 隐私审核、发布者身份、可信撤稿通道、持久可信 sequence、生产缓存 / 离线与应急下线权限仍是独立门禁。本地 JSON 状态恢复不证明线上持久存储或真实撤稿时效，第三方资产 HOLD 不由本轮测试解除。
