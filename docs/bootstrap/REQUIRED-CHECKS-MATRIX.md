# REQUIRED-CHECKS-MATRIX — 必需检查矩阵(网站仓 + 数据仓)

- 编制日期:2026-10-24
- 基准:网站 main `22eb347`、dev `6a3eea2`;数据仓 main `8b1a7d3`、dev `c8e9c57`
- 证据方式:各 check 名称均取自真实 check-run 记录(见"存在性证据"列),非推断。
- 关键前提:**必需检查的名称与 check-run 名称逐字符匹配(大小写敏感)**。`Verify`(CI 的 job name)与 `verify`(deploy-pages 与数据仓的 job id)是两个不同的 check,不可混用。

## 1. 网站仓 miracleqihe/symgene

### 1.1 现存 check 全表(基准时点)

| Check 名称(精确) | 来源 | 触发条件 | 存在性证据 | 可否设为必需 |
|---|---|---|---|---|
| `Branch policy` | ci.yml → job branch-policy(name 字段) | 仅 PR → main | dev 头 6a3eea2 与 PR #31 时代的 check-run 记录 | main PR:是 |
| `Verify` | ci.yml → job verify(name 字段) | PR→dev/main;push dev;dispatch | 同上 | dev 与 main PR:是 |
| `Promotion PR policy` | pr-governance.yml → job promotion-pr-policy(name 字段) | 仅 `pull_request_target` → main | 同上 | main PR:是 |
| `Governance` | **S1 新增** ci.yml → job governance | PR→dev/main;push dev;dispatch | 本地已验证逻辑;**线上尚不存在,合入 S1 后才可设为必需** | S1 落地后:dev 与 main PR:是 |
| `Publication approval` | dev 的 ci.yml → job publication-approval(dev 独有) | 仅 PR → main | dev 头 6a3eea2 check-run 记录 | 同上。**#39 已将其更名为 `Publication integrity`**,并按 Owner 决定移除了额外内容审读发布阻断(见 §1.2 M3 修订) |
| `verify` | deploy-pages.yml → job verify(id 名,无 name 字段) | push main / dispatch(工作流当前 `disabled_manually`,不产生 run) | main 头 22eb347 的 check-run 记录 | **否**(工作流已禁用;若设为必需且工作流停用,合并永久阻塞) |
| `deploy` | deploy-pages.yml → job deploy | 同上 | 同上 | 否(此 check 成功=已发布,不能作为合并前置) |
| `check` | check-external-links.yml → job check(cron) | 每周一 cron | main 头 22eb347 | 否 |
| `Content integration` / `t02-engineering` | t02-verification.yml(dev 独有) | PR→dev/main(push 特定 codex 分支) | dev 头 6a3eea2 | dev/main PR:可选(T02 相关路径专用,门禁价值有限) |

### 1.2 推荐必需检查集合

**main(晋级门):**

| 阶段 | 必需检查 | 前置条件 |
|---|---|---|
| M1(立即可做) | `Branch policy`、`Verify`、`Promotion PR policy` | 三者在 main 上已真实存在(22eb347 证据) |
| M2(S1 合入后) | + `Governance` | S1 的 ci.yml 已在 main |
| ~~M3~~(**已撤销,2026-10-24**) | ~~+ `Publication approval`~~ | 不恢复旧的内容审读发布门禁:Owner 已在 #39 中决定撤销该阻断。`Publication integrity`(更名后)属于 dev 的发布链,本包不将其作为强加的必需检查;**legacy 工程发布资格与 T02 正式采用授权保持分离**,后者由 T02 验证工作流与合同管理,不并入 main 晋级必需集 |

**dev(内容门):**

| 阶段 | 必需检查 | 前置条件 |
|---|---|---|
| D1(立即可做) | `Verify` | dev 上已真实运行 |
| D2(S1 合入 dev 后) | + `Governance` | — |

**禁止设为必需:`verify`、`deploy`、`check`、`Content integration`、`t02-engineering`。**
理由:前两者属于已禁用的发布工作流(`verify` 缺席会让 main 永久阻塞;`deploy` 成功即发布,语义倒置);后三者非普适门禁(cron 或特定分支),缺席即卡死。

### 1.3 严格检查模式(Require branches up to date)与 check 的交互

- 开启后,合并前 PR head 必须基于最新 base;旧 SHA 的成功 check 不再被接受 —— 直接封堵 NEG-04(旧 SHA 审核)与"检查结果复用"。
- 与 merge-commit 策略兼容;与 `Promotion PR policy` 兼容(该检查在 base sha 上运行,与 head 无关)。
- 风险:main 活跃期间晋级 PR 需反复"update branch + 重跑",可能饥饿。建议:**main 先不开严格模式,dev 开;两周稳定后再对 main 开启**(见 RUNBOOK 步骤 7)。
- 注意:`Branch policy` 有 `if:` 条件(仅 PR→main 运行)。在 main 上以 rulesets 要求它时,PR→main 场景它总会运行,无 skipped 风险;但若未来有人把该 job 的 `if` 改宽/改窄,Governance 审计(BRANCH_POLICY_NOT_GATED)会报警。

### 1.4 CI skipped / neutral 语义(R2 修订:官方语义已查证,不再 PENDING)

**官方文档结论(docs.github.com "Status checks" 参考;R2 已核对原文):**

> "A job that is skipped will report its status as 'Success'. **It will not prevent a pull request from merging, even if it is a required check.**"
> "About protected branches":必需检查以 `successful`、`skipped` 或 `neutral` 状态即可满足。

即:**平台把 skipped 与 neutral 都视为满足必需检查** —— 本文件 R1 时点"skipped 会阻塞合并"的推测是错误的,在此更正。三种形态:

| 形态 | 平台行为 | 本项目的安全要求 |
|------|----------|------------------|
| **Job 条件跳过**(`if: false`/条件不满足) | 产生 conclusion=`skipped` 的 check-run,**且满足必需检查、放行合并** | **禁止**:门禁 job 不得有 step 条件/continue-on-error —— S1R2 审计器已强制(BRANCH_POLICY_STEP_CONDITION、FAILURE_SWALLOWED);必需集只允许无条件 job |
| **Workflow 过滤跳过**(branches/paths 过滤、workflow 级 `if`) | 该 ref 上不产生 run,必需名**缺席**(社区文档记录为长期 pending/阻塞,官方无放行语义) | 必需集只包含在目标事件上必然运行的工作流;不以带过滤器的 workflow 承载门禁 |
| **neutral 结论** | 官方:视同 success | 与上同:必需 job 必须以显式失败(exit 1)表达违规,不可能 neutral |

**严格 Engineering gate 原则(由此从建议升级为强制)**:门禁 job 必须"无条件运行、违规即 exit 1 失败";本仓 `Branch policy`(条件恒真于 PR→main)、`Governance`、`Verify` 均满足;S1R2 审计器保证该性质不被后续修改。NEG-05 相应改为平台行为测量(见 PLATFORM-NEGATIVE-TESTS)。

来源:docs.github.com/en/pull-requests/reference/status-checks;docs.github.com/repositories/.../about-protected-branches;orgs/community discussions #142210/#44490(过滤型跳过长期 pending 的已知限制)。
- neutral(conclusion=neutral)仅在 check suites 层面出现;对分支保护,未列入必需名单的 neutral check 不影响合并。同名 check 冒充风险见 NEG-06(必需检查绑定 integration_id 可限定来源,legacy 检查名绑定则不能 —— 这是以 rulesets 取代 legacy 的主要安全理由)。

## 2. 数据仓(私有)

### 2.1 现存 check

| Check 名称 | 来源 | 触发 | 证据 |
|---|---|---|---|
| `verify` | ci.yml → job verify(id 名) | 一切 PR(无分支过滤)、push `codex/**`、dispatch | dev 头 c8e9c57 check-run 记录 |

### 2.2 套餐硬约束(admin 实证)

- `GET /branches/main/protection` 与 `GET /rulesets` → 403(套餐能力限制,管理员身份实证)。
- 结论:当前套餐下私有仓的 **branch protection 与 rulesets 均不可配置**;因此"必需检查"当前**无法在服务端强制**。
- 未做的事:未创建测试环境/未发起任何写入来试探其他能力(本轮禁改)。environment 所需 reviewers 等能力状态标注 **UNVERIFIED**。

### 2.3 条件化必需检查方案(解除套餐限制后立即适用)

| 阶段 | 必需检查 | 条件 |
|---|---|---|
| P1 | `verify`(dev 与 main) | 仓转公开 或 升级套餐 |
| P2 | + CODEOWNERS 审核(`/.github/` 纳入)、dismiss stale、conversation resolution | 同上 |

同时修正 `ci.yml` 的 `pull_request` 无分支过滤问题(建议 `branches: [dev, main]`),避免 fork PR 消耗 Actions 配额并缩小同名 check 面的攻击面(NEG-06)。

## 3. 名称与接线核对清单(Owner 应用前过一遍)

1. 必需检查名**逐字符**录入:`Branch policy`、`Verify`、`Promotion PR policy`、`Governance`。(`Publication integrity` 是否设必需属 Owner 独立决策,本包不推荐;旧 `Publication approval` 门禁已随 #39 撤销,不得恢复。)
2. 每新增一个必需检查,先确认它在目标分支的 PR 上**至少真实运行过一次**(看 PR checks 页),再勾选必需。
3. merge 方式:晋级模板要求 **Create a merge commit**;rulesets 的 `allowed_merge_methods` 应包含 merge、禁用 rebase/squash(与模板一致,保证 main 历史可回滚定位)。
4. S1 合入后若 Governance 未出现在 PR checks:检查 ci.yml 的 `governance` job 是否被合并冲突丢弃,或 Actions 是否被禁用。

## 4. Governance 检查的信任边界与威胁模型(2026-10-24 新增)

**定位:Governance 是候选代码检查(candidate check),不是独立可信签发。** 它只在 PR 的 merge ref 上运行一次,绿灯只代表"该次计算未发现违规",不构成对 main 最终状态的签名;权威来自"必需检查 + Owner 人工审核 + 保护规则"的组合。

| 威胁 | 场景 | 现有防线 | 残余风险与对策 |
|------|------|----------|----------------|
| 工作流自身被篡改 | PR 修改 ci.yml 删除 `governance` job | Governance 为必需检查时,删除 job = check-run 永不出现 = 合并被拒(fail-closed);`Branch policy`/审计规则同样由审计器钉死(BRANCH_POLICY_*) | 若与必需集变更同 PR 提交,审查者必须把 workflow diff 当作安全代码逐行审 |
| 审计器/测试被修改 | PR 同时改弱 `audit-governance.mjs` 或把负向 fixture 改为合法 | `.github/` 全部内容受 CODEOWNERS 强制 Owner 审核 + dismiss stale + 禁自批准(启用后);`governance-library.test.mjs` 的负向 fixture 是审计器自检,削弱 fixture 会让审计器在别的形态下漏报 | **审查规程:凡 `.github/tests/` 的 diff,重点核对负向 fixture 是否被删除/放宽;审计器的每次放行都必须有对应 fixture 证明** |
| 同名 Check 冒充 | 新增与必需检查同名的假 job | `CHECK_NAME_COLLISION` 审计直接打红;fork 来源 check 不被采纳 | ruleset `integration_id` 无法区分 Actions 内部工作流(平台限制)→ 靠审计 + CODEOWNERS;NEG-06 |
| Governance 被当作授权 | 以 Governance 绿灯替代 Owner 审核直接合并 | 本文件明示其候选定位;晋级模板要求人工批准 | 流程纪律:任何"检查全绿"的 PR 仍需 Owner 批准 |
| 检查结果复用 | 旧 SHA 的绿色结果被当作新 head 的结果 | dismiss stale + (后置)strict 模式 | NEG-04/NEG-11 实测 |
| CODEOWNERS 语义误解 | 把 CODEOWNERS 当作自动强制 | **平台事实:CODEOWNERS 本身不阻断任何合并**;只有 branch protection/rulesets 勾选 "Require review from Code Owners" 后才生效;且唯一 Owner 无法自审自己的 PR(D2 死锁);Copilot/AI review 不构成批准 | 启用顺序:先以 PR 加入第二 Owner → 再开启 require_code_owner_review;OWNER-ACTIONS S3-2/S3-3 顺序不可换 |

落地提醒:在 rulesets 尚未启用、Governance 尚未设为必需之前,以上防线只有 CODEOWNERS 与人工审核 —— 这正是本包要求分阶段启用保护的原因。
