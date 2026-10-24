# EVIDENCE-INTEGRITY-REPORT — 证据索引完整性(R1.1-A)

独立 Review 发现:`EVIDENCE-INDEX.json` 引用了 GitHub 上不存在的 `evidence/wpB-b9r2.log`。本报告完成修复与全量核对;校验器已公开(`repro/verify-evidence-integrity.mjs`),任何人可对分支 HEAD 独立重放。

## 1. 整改前实测(HEAD `2af0d2e`,机器可读:`evidence/integrity-before-2af0d2e.json`)

| 项 | 值 |
| --- | --- |
| 包内实际文件 | 200 |
| 索引条目 | 198 |
| 悬空引用(索引→树缺失) | **1**:`evidence/wpB-b9r2.log` |
| 未索引文件(树→索引缺失) | **3**:`ENVIRONMENT.json`、`EVIDENCE-INDEX.json`、`EVIDENCE-INDEX.md`(生成器从未将这三个锚点文件纳入索引) |
| 哈希不匹配 | **0**(197 个可比对条目全部一致) |
| 字段命名 | `sourceSha256` 误用:其值为实现 commit SHA,不是文件哈希 |

根因:`wpB-b9r2.log` 在 R1 打包时被索引,但仓库级 `.gitignore` 的 `*.log` 规则再次拦截了它(与 R0 的 13 份日志同因);三个生成文件则从未进入索引。

## 2. 整改内容

1. `wpB-b9r2.log`:本地原始文件存在(同一脱敏管线的产物),敏感扫描通过后以 `git add -f` 正常补交;**未伪造任何日志**。
2. 索引补全:三个生成文件以 `kind: 'integrity-anchor'` 纳入索引,哈希字段如实标注(见 §4)。
3. 字段更名:`sourceSha256` → **`sourceCommits`**(值为实现 commit SHA:9dfc403…/6a3eea2…);文件级哈希只有 `publicSha256`/`originalSha256` 两个含义,不再混用。更名记录在索引 `integrity.fieldNaming`。
4. 校验器公开:`repro/verify-evidence-integrity.mjs`——对任意分支 HEAD 做 git 树枚举、双向存在性检查、逐 blob SHA-256 比对,输出机器可读 JSON。

## 3. 整改后核验(方法与结果)

方法:对打包树的 git HEAD 执行与整改前相同的全量校验(git cat-file 逐 blob 哈希;GitHub 侧另抽样比对 raw 内容哈希),结果记录于 `evidence/integrity-after.json`(校验器:`repro/verify-evidence-integrity.mjs`,可对任意 HEAD 重放):

- 实际文件数 **224** = 索引条目 **224**
- 悬空引用 = **0**;未索引文件 = **0**;哈希不匹配 = **0**(221 个哈希核对一致 + 3 个完整性锚点文件按设计不携带包内自哈希,由分支提交 SHA 与 EVIDENCE-INDEX.md 交叉记录锚定)
- 验收要求"不存在未解释的悬空引用或哈希不匹配"——**满足**

## 4. 索引自身与生成文件的完整性保护方式

| 文件 | 保护 |
| --- | --- |
| `EVIDENCE-INDEX.json` | 生成后由 `EVIDENCE-INDEX.md` 记录其 SHA-256;包内自哈希不可能,故其最终锚点 = 审查分支的 git 提交 SHA(内容寻址) |
| `ENVIRONMENT.json` | 同上:SHA-256 记录于 `EVIDENCE-INDEX.md` |
| `EVIDENCE-INDEX.md` | 无法包内自哈希;由分支提交 SHA 锚定 |
| 全部证据文件 | `publicSha256`(公开副本)与 `originalSha256`(本地原始)分列;此后任何对已发布文件的改动,若无索引再生,即在重放校验中表现为哈希不匹配 |

## 5. 文件数 / 轮次 / 组数口径(R1.1 固定)

- **索引条目 = 已发布文件数**(证据 + 顶层交付物 + 锚点)。R1.1 后 = 225(见 `EVIDENCE-INDEX.json` 的 `packageEvolution.history` 与 `totals`)。
- **本地证据目录文件数**是另一个口径(172 → R1 增长 → 226),包含从未发布的 harness 内部文件;两者不可互换。
- **逐轮证据**:121 份 = 工作包 A/B 112 轮(36 组)+ 工作包 C 差分 9 轮。
- 演变:R0 172 份本地证据 / 181 条索引 / PR 184 文件 → R1 198 条索引 / PR 200 文件(2 个锚点缺口 + 1 个 gitignore 悬空)→ R1.1 索引 = PR 文件,**零缺口**。
- 实验组数口径:正式判定实验 36 组(A 14 + B 22,含 R1 的 B9R1/B9R2a/B9R2b 与 R1.1 的 R11B-EXP1..3、R11E 两组定向复现);C 差分 3 变体不计入"组"而以轮次计入。

## 6. 原始结果保护声明

本次整改未修改任何历史原始实验结果;所有更正以"新增对账文件 + 更正叙述"的方式表达,原始 JSON 原样保留于 git 历史。验收:无未解释悬空引用、无哈希不匹配——达成。
