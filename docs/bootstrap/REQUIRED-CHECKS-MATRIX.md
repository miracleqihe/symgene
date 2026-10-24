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
| `Publication approval` | dev 的 ci.yml → job publication-approval(dev 独有) | 仅 PR → main | dev 头 6a3eea2 check-run 记录 | **main 的 ci.yml 含此 job 之前不可设为必需**,否则 main PR 永久卡死 |
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
| M3(dev 晋级其 ci.yml 之后) | + `Publication approval` | 该 job 已在 main 的 ci.yml 中,且 main 的 package.json 具备 `check:publication` 脚本(dev 一并带来) |

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

### 1.4 CI skipped / neutral 语义(本地已核,GitHub 侧行为列入 PENDING 实测)

- GitHub Actions 的 skipped job **不产生**该名称的 check-run(而非产生 skipped check)→ 对必需检查而言等价于"未运行"→ 合并被拒。这是防"CI skipped 绕过"的正确默认。
- rulesets 的 required status checks 支持对 skipped 的显式处理;legacy 界面无此选项。两种模式都建议保持"未运行=不合格"。实测项见 PLATFORM-NEGATIVE-TESTS NEG-05。
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

1. 必需检查名**逐字符**录入:`Branch policy`、`Verify`、`Promotion PR policy`、`Governance`、`Publication approval`。
2. 每新增一个必需检查,先确认它在目标分支的 PR 上**至少真实运行过一次**(看 PR checks 页),再勾选必需。
3. merge 方式:晋级模板要求 **Create a merge commit**;rulesets 的 `allowed_merge_methods` 应包含 merge、禁用 rebase/squash(与模板一致,保证 main 历史可回滚定位)。
4. S1 合入后若 Governance 未出现在 PR checks:检查 ci.yml 的 `governance` job 是否被合并冲突丢弃,或 Actions 是否被禁用。
