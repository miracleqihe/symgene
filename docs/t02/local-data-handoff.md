# 已合并数据仓与网站固定副本核验（2026-10-23）

本轮重新读取GitHub PR状态及数据仓远端dev，并用Node.js 22.23.3对实际checkout逐文件核验。这里记录工程来源与字节一致性；医学、公众表达、隐私及来源使用/再发布审批仍须独立完成。

## 当前来源

| 对象 | 已核实状态与精确提交 |
| --- | --- |
| 数据仓 [PR #3](https://github.com/y4ho0/symgene-data-pipeline/pull/3) | MERGED；2026-10-21；合并点 `4555344860228c086dbe3e51e608b928b2f9b29b` |
| 数据仓 [PR #4](https://github.com/y4ho0/symgene-data-pipeline/pull/4) | MERGED；2026-10-23；合并点 `c8e9c57e120515d7846dff90d2127896ec6e2c20`；主题HEAD为 `9c8094b1aa72633527876a0245546101f1a3492f` |
| 数据仓远端 `dev` | `c8e9c57e120515d7846dff90d2127896ec6e2c20`，与PR #4合并点一致 |
| 网站 [PR #34](https://github.com/miracleqihe/symgene/pull/34) | OPEN、非Draft；`codex/t02-local-split-20261016 → dev`；本轮开工主题基线 `868b09399e7c5417b60d96b8210d1c536338cab4`，后续修复提交/CI以PR最新主题SHA为准 |

旧 `384fd9bfd8bb083d958858a7ef397933eb02f2d1` 仅是2026-10-16首次同步的数据仓历史基线，不能作为当前dev。PR合成merge-ref、PR主题HEAD和实际合并点分别记录，不能互相替代。

## 19文件配对

对 `legacy-content.lock.files` 的完整19路径，分别读取网站副本和当前数据仓dev原文件，检查实际字节相等、字节数相等、两端SHA-256相等且匹配锁；结果为 **19/19 PASS**。同时使用两仓既有 `createSnapshot` 重新计算完整manifest并深比较，未仅依赖声明的digest。

| 两仓同名路径 | 字节数（两端） | SHA-256（两端与锁一致） | 逐字节 |
| --- | --- | --- | --- |
| `scripts/build-teaching-materials.mjs` | 7321 | `b4988d0ff937b2ddb9bdd85f3fe31241df9c355d12b114aca658af3e32a7a6b9` | PASS |
| `src/content/agentGuide.js` | 9707 | `0fe0b011180f5e18a5f5724b885a6c57bb8935f2a5bfac036edf66089aa4ac29` | PASS |
| `src/content/caseProfiles.json` | 1762862 | `c6ae57c441723a0db7b566bb9a4dd2ebc9a289925d03cfa1c06bc851e5adc894` | PASS |
| `src/content/cases.js` | 1150 | `9e10e5ffb0fe8e28e9abd3c9cfdd0884412ab520264fc6200b0329406c0d5fe6` | PASS |
| `src/content/communication.js` | 2366 | `8cba195dc2de52320d0b55ddce69dfa707fff92c1ab53a83e4d5e95b05595ced` | PASS |
| `src/content/disorderProfiles.json` | 2887743 | `e702ad477ced17beee8cf7c16622bc780c3d75e2cc1ef6b64ba4a2594cc10229` | PASS |
| `src/content/disorders.js` | 1158 | `07fcdcfb5a841e97401d9af27de666af3f8588dfd85f5ac3574446386de87d05` | PASS |
| `src/content/drugProfiles.json` | 2751453 | `6122f0c1fcd3dd9ee6c0ba5e1c410fc084adc1c71fa22fcb733ded001c7b4939` | PASS |
| `src/content/knowledge.json` | 604719 | `8c0a9f4138d33e0276c7058c82c57535c0295233d58d6ad7c956f93c9be9da4a` | PASS |
| `src/content/medicalText.js` | 198 | `63d647ff0a6c75b4ea52a442019529beec22b7072a8286c86d188a6877c6857c` | PASS |
| `src/content/professional.js` | 1765 | `6811a89115606ed92a351cf6314f188703b35c8315adb80c7662937e258da8a0` | PASS |
| `src/content/profileAmendments.js` | 4837 | `edec823d88be9bcdd20330018b55452efa6e57e979e4487e22b82562669f0b74` | PASS |
| `src/content/profileAudit.js` | 3674 | `1c9012079e24abb1e3374b83cf6b0b33377639d54d1bfd50649712d81a1fc04f` | PASS |
| `src/content/profileOverlay.js` | 2095 | `c5055099a59d31aa50141226a3716e20ed75be1b73ece752336d53bbf4c2a22f` | PASS |
| `src/content/reading.js` | 11869 | `c9bf71a13d513063a8b1e7295d6e42945070123e99cb28860acf87b86a77fe3f` | PASS |
| `src/content/readingProfileAudit.js` | 5673 | `294f7baa356148fa1ad4d1bd2cba2bc10c014f18fca434767470e21dc26c2720` | PASS |
| `src/content/regionalAudit.js` | 3572 | `c14ef7a9fbb726c585cc4621f9003bb7d211eca53bbbad8e6db3e9345b067736` | PASS |
| `src/content/regions.js` | 3374 | `04475b8e9c791e38caa4c62eb71b1c1e5793ebab7dd5b7c150649a402d05f56a` | PASS |
| `src/content/sourceLinks.js` | 1330 | `bb48e59c77438378d3181c26ee7c4341151e7e47b35ede6deea14683cde8ac2b` | PASS |

## 版本与锁

| 检查 | 实测值/结果 |
| --- | --- |
| 完整19文件digest | `e2c3a7dc114ec2ae063b32bc7a811d23c19840291db5c4ae4521bc7cc8090489`；两端与锁一致 |
| 快照版本 | `local-e2c3a7dc114ec2ae063b` |
| 重新序列化数据仓manifest的SHA-256 | `4d8bf5950fa81659cbb6a5e4646161c193f175170ace4e0bed4b93f9553de34a`；匹配 `legacy-content.lock.manifestSha256` |
| 来源验证器SHA-256 | `e4c2db8f8337b4f25d8df4f8887b4f8c97a2d8af3daa3a1e6dae6991b4ccadc4`；数据仓 `src/legacy-snapshot.mjs`、网站vendor和锁一致 |
| `legacy-content.lock` 文件SHA-256 | `a21fdf93f17c93d9c5ecfcb44f80ded8fa194447f79275956672803820e7d0b5` |
| `content-pack.lock` 文件SHA-256 | `d32000bcf1479ecd2198bf74f362e17ced9eebde98e22d9c86c487c54b9d84b0` |
| 内容数量 | 114药物、122疾病、122案例、4资源；profile分别114/122/122 |
| 与网站本轮开工基线比较 | 19文件及两份内容锁全部原字节不变 |
| 认证T02采用状态 | `adoption=legacy`、`scope=local_simulation_only` 保持 |
| 发布/审批状态 | `publication=local_migration_unreviewed`；医学和权利均为 `not_asserted` |

19文件没有变化，因此本轮没有重新导入、修改正文或更新内容锁。数据仓工程合并只确认代码集成；不会签收358项医学/公众表达审读、来源权利、T01.2 A2、G2真实双报告、G3/G4/G5，也不会解除网站 `check:publication` 的当前阻断。

后续验证仍须运行 `npm run check:legacy-content`、`npm run check:split` 和PR完整工程检查；上述来源绑定不替代最新网站主题SHA的测试或CI。浏览器artifact须同时核对source HEAD、checkout HEAD和本页digest，不能沿用旧artifact证明后续依赖修复。
