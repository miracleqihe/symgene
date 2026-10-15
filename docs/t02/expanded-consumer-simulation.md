# T02 扩展离线消费演练

本轮新增独立演练工具，从网站精确锁定的合成候选包建立夹具工厂，在 Git 外临时目录构建三个版本。原 lock、sim-1/2/3/4、vendor、现有源码、测试、storage v4、医学规则和搜索排序均不由此工具改写。运行结束只清理工具自己创建的临时目录。

每个版本包含 23 个实体、18 个 resource、92 条显式 simulation review。9 个机构中，8 个新增虚构院区使用相同展示名、不同永久 ID / legacy ID / providerRefs，并关联同一虚构总机构。另新增 8 个虚构资源。材料全部来自合成候选或程序构造，不读取真实浏览器存储、原始材料、第三方地图或人工审核记录。

三个版本依次采用。第二版为旧资源 ID 添加明确的两跳重定向，第三版再向新的永久 ID 前向重定向；legacy 存储 ID 保留。每一步运行真实 vendored `buildPack` / `verifyPack` 和现有 `validateData`。网站 count floor 原值保持不变，后续候选还必须满足当前 active 包计数。

新构建包的 `codeDigest` / `pipelineCommit` 来自当前逐文件摘要校验通过的 vendor provenance，不沿用旧候选包记录的构建器摘要。旧包原字节保留。当前导出的 producer commit 标为 `uncommitted`，报告如实保留该状态；这是已有导出快照的声明，不伪造 pipeline commit 或身份认证。输入包摘要与新包的 producer 摘要分别记录。

## 实际执行的场景

- 三个版本完整采用；采用中断后恢复 JSON 状态、重试第三版，再重放相同不可变第三版，档案仍为三个版本。
- source、claim、rights、resource facts review 四种独立撤稿。每种都先运行真实 storage 合并，包含本地 override、自定义案例、资源墓碑与备份；随后恢复 JSON、回滚第一版并恢复备份，撤稿依赖仍隐藏，emergency sequence 保留。
- 现有搜索的疾病 / 案例 / 药物返回值接受实际检查。资源使用现有目录与详情数据边界；工具没有增加资源搜索接口。机构消费使用知识投影返回的完整历史 deny 闭包，再调用原机构投影。撤回资源 review 时，无关知识与其余七条资源保留，依赖该总机构的九个院区隐藏。
- emergency 状态变陈旧后，全部高风险知识隐藏；投影前后原始合并对象、MemoryStorage 与备份字节不变。
- 实际运行六个采用阶段的故障注入。失败均保留 active digest、档案索引与历史安全状态。

负例分别经过对应真实边界，不把所有失败归为同一错误：

| 反例 | 实际拒绝码 |
| --- | --- |
| 同包重复 providerRefs | `PROVIDER_REF_CONFLICT` |
| 空白权利 / 审核证据 | `RIGHTS_EVIDENCE_MISSING` / `REVIEW_EVIDENCE_MISSING` |
| 审核待决 | `REVIEW_NOT_APPROVED` |
| 权利 / 审核过期 | `RIGHTS_EXPIRED` / `REVIEW_EXPIRED` |
| 危险 URL | `DANGEROUS_URL` |
| 包仍高于原 lock floor，但少于 active 包 | `ADOPTION_COUNT_DROP` |
| 构建器覆写已有内容版本 | `PACK_MANIFEST_HASH_MISMATCH` |
| 另一目录中同版本不同内容试图被采用 | `ADOPTION_VERSION_CONFLICT` |
| 包缺失 payload 文件 | `PACK_FILE_SET_MISMATCH` |

构建冲突后重新核验原版本摘要，证明没有覆写。失败采用后分别核对 active、archive 和 safety state 摘要，避免只检查返回错误而忽略局部状态变更。

## 重放与报告

使用 Node 22：

```sh
node scripts/t02/expanded-simulation.mjs
node --test tests/content-history-replay.test.mjs
node --test tests/content-pack.test.mjs tests/content-pack-overnight.test.mjs tests/content-history-replay.test.mjs
```

默认演练时钟固定为 `2026-10-14T12:00:00Z`，用于确定性校验 freshness / 过期边界，不代表线上时间或传播保证。报告仅含计数、摘要、状态 / 错误码，不包含实体正文、证据内容、输入路径或个人数据。`expanded-consumer-simulation.json` 是完整工具输出；重放测试在另一个新建临时目录再次运行，并要求报告逐项相同。

如演练代码或夹具的确定性输出确实改变，先审查差异，再用工具重新生成报告：

```sh
node scripts/t02/expanded-simulation.mjs > docs/t02/expanded-consumer-simulation.json
```

这是一轮扩大规模的合成网站消费演练，不替代两批合法真实输入双跑、T01.2 签收、人工四维审核、真实身份与可信撤稿通道、持久存储或生产验收。生产保持 legacy；未授予 public 权限、未创建人工审核身份、未发布三个临时内容包。

2026-10-15 Extended：producer核心指纹现排除legacy资产，精确vendor重导出后，当前聚合JSON已按新producerCodeDigest重新生成并重跑113项。原sim3/4包与lock字节保持，旧聚合版本仍在Git历史；派生归档摘要因producer provenance变化而变化，未删除断言或豁免摘要。
