# T02 本地 Git 提交准备审计

审计日期：2026-10-14。范围：网站隔离实施工作树，分支
`codex/t02-content-contract`，审计基线 HEAD
`20ec83d9b0bed138299010da6d2cf9c4418f1cfc`。

本文件记录新增的提交准备审计，不改写原阶段的 `change-inventory`、
`verification` 或其他验收快照。它不是正式 T02 阶段签收，也不是推送、合并、
生产采用或部署授权。本次仅新增本文件，未暂存、提交、删除或移动其他文件。

## 1. 完整审计范围

新增本文件前，现场有 **50 个变更路径：2 个已跟踪文件修改、48 个未跟踪文件**。
索引为空；50 个路径均为普通文件，无符号链接。

| 类别 | 路径数 | 审查内容 |
| --- | ---: | --- |
| 根配置 | 4 | Node 版本、全部 package/lock diff、精确内容锁及独立数量下限 |
| sim-1/2 | 16 | 每包 8 文件，旧规范开发快照、自身文件表完整性、当前拒绝结果及引用关系 |
| sim-3/4 | 16 | 每包 8 文件，最终规范、合成审核、精确 manifest/包哈希及当前消费校验 |
| 文档与基线 | 3 | golden、持久 ID registry、模拟边界与运行说明 |
| 脚本 | 4 | golden 生成器、锁读取/采用/回滚、构建门禁、端到端模拟 |
| 浏览器 adapter | 1 | 字段/类型/顺序兼容及合并后的撤稿投影 |
| 测试 | 1 | 合成输入、真实包验证、存储兼容、故障与回滚回归及制品依赖 |
| vendor | 5 | 来源清单、唯一规范及三份生成的 Node 消费代码 |
| 合计 | **50** | 全部路径如下 |

```text
package-lock.json
package.json
.nvmrc
content-pack.lock
content-packs/sim-1/bundle.json
content-packs/sim-1/content-v1.schema.json
content-packs/sim-1/manifest.json
content-packs/sim-1/redirects.json
content-packs/sim-1/retractions.json
content-packs/sim-1/reviews.json
content-packs/sim-1/rights.json
content-packs/sim-1/sources.json
content-packs/sim-2/bundle.json
content-packs/sim-2/content-v1.schema.json
content-packs/sim-2/manifest.json
content-packs/sim-2/redirects.json
content-packs/sim-2/retractions.json
content-packs/sim-2/reviews.json
content-packs/sim-2/rights.json
content-packs/sim-2/sources.json
content-packs/sim-3/bundle.json
content-packs/sim-3/content-v1.schema.json
content-packs/sim-3/manifest.json
content-packs/sim-3/redirects.json
content-packs/sim-3/retractions.json
content-packs/sim-3/reviews.json
content-packs/sim-3/rights.json
content-packs/sim-3/sources.json
content-packs/sim-4/bundle.json
content-packs/sim-4/content-v1.schema.json
content-packs/sim-4/manifest.json
content-packs/sim-4/redirects.json
content-packs/sim-4/retractions.json
content-packs/sim-4/reviews.json
content-packs/sim-4/rights.json
content-packs/sim-4/sources.json
docs/t02/golden-baseline.json
docs/t02/legacy-id-map.json
docs/t02/website-simulation.md
scripts/t02-golden.mjs
scripts/t02/adoption.mjs
scripts/t02/check-content-pack.mjs
scripts/t02/simulate-adoption.mjs
src/content/adapter.js
tests/content-pack.test.mjs
vendor/t02/provenance.json
vendor/t02/schemas/content-v1.schema.json
vendor/t02/src/contract.mjs
vendor/t02/src/pack.mjs
vendor/t02/src/scanner.mjs
```

本文件是上述快照以外的第 51 个路径。建议提交原 34 个交付路径及本文件，
共 **35 个路径**；sim-1/2 的 16 个文件保持原路径、原字节、本地留存而不提交。
不为隐藏这些文件而改写共享 ignore 规则，也不执行删除、移动或重新生成。

## 2. 安全、来源与许可边界

对上述 50 个变更文件运行当前内容扫描规则，结果为 **0 条发现**；包文件使用
公开有效载荷规则。诊断只返回文件、规则和计数，没有输出受限正文。
这只说明本轮规则和结构审查未发现问题，不等于历史内容已全面清白或取得再发布权。
本次没有读取原始 raw/work、真实浏览器用户数据或受限资料。

Golden 只保存公开条目的 ID、字段名、内容/引用/顺序/排序输入摘要、数量及相对
atlas 文件路径。当前重新测量与快照一致。Registry 有 1,788 条唯一 canonical ID
及唯一 typed legacy 映射，完整覆盖四类知识集合和机构的原 ID/类型/顺序，全部为
`legacy_unverified`；没有复制医疗正文、社交评论、患者字段或绝对私人路径。

四套包均为 `mode: simulation`，每包 7 个虚构实体、28 条明确的 simulation 审核；
审核者代号均带 simulation 前缀。Rights 为
`LicenseRef-Synthetic-Test-Only`；证明引用明确不是真人审批。
`publisherIdentity` 仍是 `not_configured/authenticated:false`。
它们不授予真实医学、事实、权利、隐私批准或公开发布许可。

Vendor 的四个文件均与当前数据管线源逐字节一致，并与 provenance 中的 SHA-256
一致；没有复制 raw、历史裁定数组、社交 snippets 或第三方依赖源码。

| Pipeline 相对源路径 | 文件 SHA-256 |
| --- | --- |
| `src/contract.mjs` | `0226846103650001907b4047e45f5d7e11248ec3f9ae5915f63cda51eda9fe3a` |
| `src/pack.mjs` | `6fce4587edc8001017c5d8a4905d8d16270da256e385eb30d6b0ac5f36ea694c` |
| `src/scanner.mjs` | `8cf6693c29095bafbec37aae7ddedbec801be58c5e1c8bae8a24f5853a397616` |
| `schemas/content-v1.schema.json` | `59036468857ecc34b06a756e96cad0fcba6291b01acb47008dff6a7040f7f6de` |

Provenance 的 codeDigest 为
`55c1307428b881c97c1fed525765e4436bc2602a36d17c782e285e7e2d756af4`。
生成时 `pipelineCommit: uncommitted` 如实标明本地模拟状态；后续提交不能倒填或
覆写已归档 manifest 来伪造它们生成时的来源。哈希是完整性证据，不是身份认证。

现场未找到网站项目明确的 LICENSE 文件。新增 Ajv 依赖链的 MIT/BSD-3-Clause 是所列
依赖的许可证元数据，不会自动成为网站、旧资料或整个新增交付的统一许可。
当前授权覆盖本地实现与本地逻辑提交，不推断进一步公开再分发授权。

对全部 159 条依赖锁包记录的许可元数据检查未发现缺失，resolved 均来自 npm
registry。它们包含 MIT、BSD、Apache、MPL 等声明；既有 remotion 与
@remotion/player 使用 SEE LICENSE IN LICENSE.md，已查看安装包中的专有条款，
本轮没有变更这两项依赖或判定组织是否满足其使用条件。元数据完整不等于全部
许可义务已获法律确认；node_modules 不进入 Commit。

## 3. sim-1/2 的保留与当前用途

四套包各自 manifest 所列 7 个有效载荷的字节哈希和大小全部自洽。
用当前受锁消费规范执行 `verifyPack(..., {allowSimulation:true})`：

| 版本 | 当前验证 | Manifest 文件 SHA-256 |
| --- | --- | --- |
| sim-1 | 拒绝：`PACK_SCHEMA_SOURCE_MISMATCH` | `44cbcd0d8f6998a904397739bbba19ef93b824b3a9bebf58fb4eafaa72351f6e` |
| sim-2 | 拒绝：`PACK_SCHEMA_SOURCE_MISMATCH` | `a555f5667709591475978bf691b07f196bfb5e5795fe2773220cf551bc39edc6` |
| sim-3 | 通过 | `b65319b2c6948a4ab26146516cdb7381fe9bbbac14877f70c3559fa53e7f105e` |
| sim-4 | 通过 | `953fa24a361bd2fd489ed8d930599c9610b45fce43285deda41cd116d2fbbfa3` |

sim-1/2 是规范冻结前的开发快照，内嵌较早的 schema，机构 payload 尚无最终地图
字段。它们保持不可变，不能因最终规范增强而原地修成新包，也不能作为当前有效
候选、回滚包或正式双跑证据。

排除制品自身后，网站脚本、测试和文档没有对精确版本 sim-1/2 的引用。
`content-pack.lock` 只锁定候选 sim-4，`simulationArchives` 只有 sim-3/4。
构建门禁只读取该候选；模拟回滚读取锁中的另一个归档，不枚举所有包目录。
测试按锁读取当前包，并在自己的临时目录创建
`sim-history-old/new`、`sim-source-only` 和 `sim-unmapped-resource`；现有及已编写的
回归不依赖 sim-1/2。

因此本次将其 16 个文件排除在暂存清单之外，原样保留在本地。未来若需要明确的
“旧规范应被拒绝”历史回归，应另行说明预期拒绝结果并加入专门测试，不能把尚未
实现的未来用途说成本次提交的必要依赖。

## 4. 实际依赖与锁变化

完整 tracked diff 只涉及 `package.json` 和 `package-lock.json`。除了新增构建门禁、
模拟脚本及 Ajv 依赖，锁文件还有以下实际版本变化，不能只描述为三项安全补丁：

| 范围 | 原版本 | 新版本/状态 |
| --- | --- | --- |
| `vitest` 及 7 个 `@vitest/*` 包 | 4.1.10 | 4.1.11 |
| `ajv` | 无 | 8.20.0，开发依赖 |
| `ajv-formats` | 无 | 3.0.1，开发依赖 |
| `fast-deep-equal` | 无 | 3.1.3，新增传递开发依赖 |
| `fast-uri` | 无 | 3.1.8，新增传递开发依赖 |
| `json-schema-traverse` | 无 | 1.0.0，新增传递开发依赖 |
| `source-map-js` | 1.2.1 | 1.2.2，锁中属于生产传递依赖 |
| `@jridgewell/sourcemap-codec` | 1.5.5 | 1.6.0，传递开发依赖刷新 |
| `chai` | 6.2.2 | 6.3.0，传递开发依赖刷新 |
| `tinyrainbow` | 3.1.1 | 3.2.0，传递开发依赖刷新 |

共 17 个新增或版本变化的包记录。顶层产品 dependencies 未改。
`.nvmrc` 固定 Node 22.23.3。建议保留已验证的完整 lockfile，并准确记录传递刷新，
不在提交准备期间重新无范围解析依赖。

## 5. 原工作与验收保护

网站实施工作树的既有 `src/data.js`、`src/search.js`、`src/main.jsx`、hook、storage、
atlas 和原 `.github` 工作流均无 tracked diff。生产仍走旧静态入口，不改变医学
内容、评分、搜索、存储 schema v4 或 UI，也没有将合成候选接到生产界面。

原两个工作树再次只读核对，均无未提交修改，原分支及 HEAD 保留：

| 原工作树 | 分支 | HEAD |
| --- | --- | --- |
| `symgene` | `codex/fix-china-map-northeast` | `8778c7a6f1e93771cd7c2e86d92b0cd76d9139e1` |
| `symgene-research-data-integration` | `codex/social-evidence-pilot` | `b40dca68ec8bbb15338d5bcd657a675955add284` |

网站 origin 仍为既有 `https://github.com/miracleqihe/symgene.git`。
本次没有推送、合并、重写历史、生产发布、修改 ignore 或移动旧包。
`git diff --check` 通过。本轮提交前另以 Node 22.23.3 新鲜运行 npm ci 和
npm run verify：263/263 单元、24/24 UI 测试，以及构建和产物门禁均通过；
npm ci 的 audit 为 0 漏洞。simulate:content 通过，sim-4 采用后可回滚 sim-3，
六个失败阶段均保留有效包。只有原有大 chunk 警告（主包 1071.79 kB、图谱
1752.62 kB）。这些本地结果不作为正式验收。

T01.2 签收、合法真实全路径双跑、人工事实/医学/权利/隐私审批、责任人与身份权限、
生产撤稿通道和缓存时效仍按原阶段报告处理。本地提交不解除这些正式门禁。

## 6. 本地逻辑提交建议

本轮采用三个逻辑提交：golden/持久身份与其生成器 3 路径；内容包消费、合成包、
运行时及完整依赖锁等 31 路径；本审计文档 1 路径。package.json 与依赖它的
脚本在同一 Commit，避免中间提交引用缺失脚本。所有分组均使用明确路径清单，
排除 sim-1/2，不使用宽泛暂存替代审查。

暂存过程中不要重新运行 `scripts/t02-golden.mjs` 来重设基线；它是生成并写入
golden/registry 的命令。当前兼容基线继续锚定 `20ec83d9`，旧审核和许可状态不升级。
