# R2-FINDINGS-DISPOSITION — 逐项处置(确认/部分确认/反驳)

- 对象:PR #40 @ `d814f3c7`(R1 末)→ R2 整改至 `6e61994`
- 方法:每项 Finding 先在旧实现上写**负向测试**复现(红=确认),修复后转绿;不存在"直接接受定性"。21 项新断言中 19 项复现为真实缺陷,2 项为无回归对照(见 R2-ADVERSARIAL-TESTS)。
- PR #40 上无人工 Review 评论(已核 `pulls/40/reviews` 与非 Bot 评论均为空);以下 Finding 按任务书逐项独立复现。

## R2-A Governance 审计器

| Finding | 处置 | 复现证据(旧实现红) | 修复后 |
|---|---|---|---|
| A1 Branch policy 字符串匹配无法证明执行语义 | **确认**(含两子缺陷:包含匹配可被死字符串/多余语句绕过;job 级 `if` 可跳过门禁) | `R2-A1: signature inside a dead string...`、`R2-A1: extra statements...`、`R2-A1: a job-level if...` 三测红 | 模板全等(extractRunScript + 归一化 == v1/v2 规范模板);job 级 if 仅允许 v1 main 门控形态;step 级条件拒绝 |
| A2 continue-on-error / 条件跳过 / 脚本伪装 / 吞失败 | **确认** | `R2-A2` 四测红(coe on branch-policy step、Governance job、deploy verify job、`|| true`) | FAILURE_SWALLOWED,作用域=branch-policy/governance/deploy-pages 全部 job;模板全等同时杀死伪装 |
| A3 重复键 / 动态字段 / Flow Mapping / 未知语法 | **部分确认**:重复键的**语义**(last-wins)旧扫描器与 YAML 一致,结论不被颠覆(反驳"结论错误"的强定性);但解析器混淆面确为真实风险(确认卫生缺陷);Flow jobs 与动态名是真漏报 | `R2-A3` 五测红 | YAML_DUPLICATE_KEY(有意标记)、flow jobs/条目 UNSUPPORTED_YAML_CONSTRUCT、JOB_NAME_DYNAMIC |
| A4 pull_request_target 不可信 PR 输入(title/body/表达式插值) | **确认**(R1 只封 head.sha/ref;title/body 插值 = 代码注入通道) | `R2-A4` 三测红 | PR_TARGET_UNTRUSTED_INPUT:仅 `pull_request.number`/`pull_request.base.*` 允许插值;其余全拒 |
| A5 Pages deploy 权限白名单 / needs / 失败终判 | **确认**(deploy job 加 `contents: write` 旧实现放行;needs 无校验;`if: always()` 可绕过 verify 失败) | `R2-A5` 四测红 | DEPLOY_PERMISSIONS_UNEXPECTED(白名单 write⊂{pages,id-token}, read⊂{contents,actions})、DEPLOY_NEEDS_MISSING/UNKNOWN、DEPLOY_FAILURE_FINALITY |
| A6 同名必需检查冒充 / 动态名漏检 | **确认**(动态名逃逸碰撞扫描) | `R2-A3: dynamic job display names...` 红 | JOB_NAME_DYNAMIC(动态名不可静态核对 → 显式失败) |
| 解析器/可信签名评估 | **按要求评估,维持现状** | — | 理由与结论见 verification/VERIFICATION-LOG.md §"解析器与可信签名评估":零依赖是抗篡改属性;子集外一律 fail-closed;模板全等即轻量可信签名;未来可由 Owner 评估 actionlint/vendored 解析器 |

## R2-B 平台负测可信性

| Finding | 处置 | 修复 |
|---|---|---|
| NEG-03 最后推送者身份未绑定、缺正向对照 | **确认** | GH_A/GH_B 双变量 + `assert_identity`(token↔用户);push 经 `authed_url`;API 证据 `last commit author.login == GH_A_USER`;正向对照:B 批准 → expect_accepted |
| NEG-05 skipped/neutral 官方语义 | **确认(并修正 R1 文档错误)** | 官方原文:skipped/neutral **均满足**必需检查;NEG-05 改为平台行为测量(MEASURED);项目要求=门禁不可跳过(审计器强制);MATRIX §1.4 重写并引用原文 |
| NEG-08 push 用本地默认凭据 | **确认** | 全部 git 操作经 `authed_url(GH_A)`;`require_actor_not_admin` 前置 |
| NEG-09 dispatch 参数与 Run 关联、失败源证明 | **确认**(旧脚本 `-f '[{...}]'` 为畸形参数;204≠证明) | 移除畸形参数;run 按 head_sha+event 关联;PASS 要求失败 job 日志含 environment 拒绝文本 + 该 SHA 零 Deployment |
| NEG-01/04/06/07/11 其他门禁干扰(假阳性) | **确认** | NEG-01 差分法(阻塞→批准→放行→撤销→再阻塞);NEG-04/11 等待 head 检查真绿;NEG-06/07 以目标 job 日志证据为 PASS 条件 |
| NEG-10 静态审计 vs 真实绑定 | **确认** | T1/T2(静态,今日本地可执行)与 T3(#37 绑定链的真实 lab 验证,PENDING,禁模拟)显式分离 |
| PASS/FAIL/BLOCKED + 禁模拟冒充 | **R1 已有基础,R2 补齐**:expect_accepted(正向控制)、MEASURED(平台测量)加入裁决体系;模拟模式仅打印计划 | lib.sh + 12 脚本重写,模拟模式全过 |

## R2-C 工程包一致性

| Finding | 处置 | 修复 |
|---|---|---|
| 20 vs 42 vs 63 测试数冲突 | **确认** | 沿革记录于 VERIFICATION-LOG(R1 初版 20 → R1 整改 42 → R2 63);RUNBOOK/OWNER-ACTIONS 更新为 63/63 |
| 补丁链与 SHA 校验缺失 | **确认** | README"补丁链与应用顺序":方式 A(S0→S1→S1R→S1R2)/方式 B(S1-FINAL 单补丁,禁叠加);commit SHA 清单 + `git apply --check` + 63/63 终验;新增 S1R2-REMEDIATION.patch 与 S1-FINAL.patch |
| 迁移顺序保护空窗 | **确认** | 无空窗纪律写入 W2/S2-3/D6/§6:激活→验证→才删 legacy;回滚严格反向;§4.1 统一紧急绕过纪律(≤24h+日志+恢复+绕过期禁合并) |
| 残留 Publication approval 建议 | **确认**(RULESET-MIGRATION-PLAN 两处、MATRIX 核对清单一处) | 全部清除;保留"Publication integrity 属 Owner 独立决策"的边界表述 |
| CODEOWNERS 平台语义 | **确认** | MATRIX §4 新增行:CODEOWNERS 本身不阻断;仅在勾选 require_code_owner_review 后生效;唯一 Owner 自审死锁;AI review 非批准;启用顺序 S3-2→S3-3 不可换 |
| 未经验证的危险回滚 | **确认** | "临时降参数/临时 bypass/admin bypass"统一收编至 §4.1 纪律;生产"回滚=重部署旧 SHA"限定于 RUNBOOK S7-3 受控流程 |

## R2-D #37/#39 兼容(最新 HEAD)

| Finding | 处置 | 证据 |
|---|---|---|
| 必须基于最新 HEAD(非过期快照) | **确认并执行** | `a799746`/`a7ca006` 即当前 PR 头(与 R1 相同,已重新 fetch 核实);compat 双跑 PASS |
| 保留 #37 六项加固 | **确认** | compat `after` 断言:Commit identity / Deployment gate / DEPLOY_CONTEXT_REJECTED / ARTIFACT_DIGEST / run_attempt 五项标记在 S0 差量后全部在场 |
| #39 Legacy 完整性策略不被旧阻断覆盖 | **确认** | compat 断言:publication-integrity 在场、非阻断完整性步骤保留、旧阻断步骤未被差量复活 |
| 禁止旧工作流整文件覆盖 | **确认** | RUNBOOK"S0-on-#37 最小差量"为唯一落地方式;compat 脚本即其机器可读形式 |

## 无法复现、提供反证的项

- 未发现本轮 Finding 中有"确认不存在"的项;R1 遗留的 2 项误报(顶层纯 read 声明、GOOD_CI env 硬编码 fixture)已在 R1 内自行修正并有记录。
- 需要说明的边界:重复键按 YAML 语义 last-wins,本扫描器的结论一致性在修复前即成立 —— "结论被颠覆"的强定性不成立,但作为 fail-closed 卫生措施仍加标记(部分确认)。
