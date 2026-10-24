# RULESET-MIGRATION-PLAN — GitHub 原生保护迁移方案

- 编制日期:2026-10-24。只读编制;本轮未改动两仓任何保护设置。
- 身份与权限事实(2026-10-24 实测):
  - 网站仓 `miracleqihe/symgene`(public):当前操作身份 `y4ho0` 仅 write —— **网站仓的一切保护变更都是 Owner(`miracleqihe`,唯一 admin)操作**。
  - 配套数据仓(私有):管理员身份下 branch protection 与 rulesets 仍 **API 实证 403** —— 当前套餐对私有仓不提供这两项能力(具体仓名不在公开文档披露)。
- 诚实性原则:网站仓 main/dev 的传统保护详情(`GET /branches/*/protection`)对非 admin 返回 404 → 标 **UNVERIFIED**;404/403 不构成"规则不存在"的证据。

## 0. 目标状态总览

| 分支 | 目标 |
|------|------|
| 网站 dev | PR-only + `Verify`(后加 `Governance`)+ 关闭强推/删除;审核要求最低 1 |
| 网站 main | PR-only + `Branch policy` + `Verify` + `Promotion PR policy`(后加 `Governance`、`Publication approval`)+ 1 项批准 + CODEOWNERS(`/.github/`)+ 最新推送独立批准 + 审核过期失效 + 会话全解决 + 关闭强推/删除;严格模式后置 |
| 数据仓 dev/main | 受套餐阻塞;就绪后与网站 dev 同构,外加收紧 `ci.yml` 的 pull_request 触发范围 |

实现载体:网站仓直接用 **rulesets**(public 仓全功能、可 API 管理、可绑定 integration_id);传统 branch protection 仅作为 Stage 0 备份对象。数据仓在解除套餐限制后用同一套 ruleset JSON。

## 1. 逐项可行性(任务要求的每一项)

图例:✅=GitHub 支持;P=网站仓(public);D=数据仓(private);Free=当前套餐;W=阶段化启用建议。

| # | 要求 | GitHub 支持 | 网站仓 | 数据仓 | 依赖 check 是否真实存在 | 启用阶段 | 死锁风险 | 恢复方式 |
|---|------|-------------|--------|--------|--------------------------|----------|----------|----------|
| 1 | dev 最低保护(关闭直接 push、关闭强推/删除、必需 `Verify`) | ✅ rulesets:pull_request + required_status_checks + non_fast_forward + deletion | 可;需 Owner | ❌ 套餐阻塞(403 实证) | `Verify` 在 dev 已运行(dev 头证据) | W1 | 低:dev 上 write 协作者都能互相审批 | ruleset enforcement 改 `disabled` 或直接停用规则集 |
| 2 | main 最低保护(同上 + `Branch policy` + `Promotion PR policy`) | ✅ 同上 | 可;需 Owner | ❌ 同上 | 三 check 已在 main 时代运行(22eb347 证据) | W2 | 低 | 同上 |
| 3 | 完整强制审核规则(批准数≥1、dismissible 配置) | ✅ rulesets `pull_request.required_approving_review_count` | 可;需 Owner | ❌ | 不依赖 check | W3 | 中:见 §4 死锁 D1(自批准) | 临时把 count 降为 0 或将 Owner 加入 bypass(需记录原因) |
| 4 | Code Owner 规则(`/.github/` 必须 Owner 审) | ✅ `require_code_owner_review` + CODEOWNERS(已存在) | 可;需 Owner | CODEOWNERS 文件本身可用,但"必需审核"属保护功能 → ❌ | 不依赖 check | W4 | **高:见 §4 D2(唯一 Owner 自审)** | 把 `*` 规则临时从 `@miracleqihe` 改为 `@miracleqihe @y4ho0` 的 PR;或该次 PR 用 admin bypass(审计日志留痕) |
| 5 | 最新推送独立批准(require_last_push_approval) | ✅ rulesets `pull_request.require_last_push_approval` | 可;需 Owner | ❌ | 不依赖 check | W4 | 中:见 §4 D3 | 重新 push 一次(非本人)或临时关闭该参数 |
| 6 | 审核过期失效(dismiss stale on push) | ✅ `dismiss_stale_reviews_on_push` | 可;需 Owner | ❌ | 不依赖 check | W3 | 低:表现为重新排队审批,不会永久卡死 | — |
| 7 | Review Thread 解决(必需) | ✅ `required_review_thread_resolution` | 可;需 Owner | ❌ | 不依赖 check | W3 | 低(与 D1/D2 叠加时放大) | 解决/关闭线程 |
| 8 | 禁止强推与删除 | ✅ rulesets `non_fast_forward` + `deletion`(设为 active) | 可;需 Owner | ❌ | 不依赖 check | W1 | 无(纯收紧) | 临时 enforcement=disabled |
| 9 | 严格检查模式(分支须最新) | ✅ rulesets `required_status_checks.strict_required_status_checks_policy` | 可;需 Owner | ❌ | 全部必需 check 须真实存在 | W5(后置) | 中:见 §4 D4 | 关闭 strict 或暂停 ruleset |
| 10 | Bypass / 管理员策略 | ✅ rulesets:未列入 bypass 的所有人(含 admin)均受约束;legacy 的"enforce admins"等价 | 可;需 Owner | ❌ | 不依赖 check | W1–W5 同步 | 低(策略明确) | bypass 名单是显式配置,可随时收紧 |

补注:

- rulesets 对 **admin 一律生效**(除非显式 bypass)——这是相对 legacy 的第二个安全优势(第一个是 required check 可绑定 `integration_id`,杜绝同名 check 冒充,NEG-06)。
- 网站 `github-pages` environment 的 `can_admins_bypass=true` 为平台默认,environments API 无关闭项(UNVERIFIED@UI);补偿控制 = 部署审计日志 + S0 的 dispatch-only 入口。
- 数据仓 `allowed_actions=all`、`sha_pinning_required=false` 建议在解除套餐限制后一并收紧;本轮只记录不动作。

## 2. 阶段化启用(W1–W5,对应 RUNBOOK 步骤)

- **W1(一次 PR,无行为变化):** S0+S1 经 PR 进入 main(Owner 审核)。此阶段不开任何新保护,验证 Governance 检查绿。
- **W2(main 最低):** 建 ruleset `main-minimum`:target `~DEFAULT_BRANCH`;开 deletion、non_fast_forward;required_status_checks = [Branch policy, Verify, Promotion PR policy](strict off)。
- **W3(审核强度):** 同一 ruleset 追加 pull_request:approve≥1、dismiss_stale、thread resolution。
- **W4(完整审核):** 追加 `require_last_push_approval`、`require_code_owner_review`;CODEOWNERS 增加 `/.github/` 第二 Owner(`@y4ho0`)以解 D2 —— 该 CODEOWNERS 修改本身走 PR。
- **W5(严格模式):** 观察两周后开启 strict;随后把 `Publication approval` 加入必需(M3)。
- **dev 侧(D1–D2):** ruleset `dev-minimum`(target `dev`):deletion、non_fast_forward、pull_request approve≥1、required_status_checks=[Verify];S1 进 dev 后加 `Governance`。
- 每一步的预期响应、验证与回滚命令见 `MAIN-BOOTSTRAP-RUNBOOK.md`;Owner 专属步骤另列 `OWNER-ACTIONS.md`。

## 3. ruleset JSON 模板(Owner 用 `gh api` 或 UI 均可)

> 字段名以创建时 API schema 校验为准;`PLATFORM-NEGATIVE-TESTS/scripts/ruleset-apply.sh` 默认仅允许作用于 `*sec-lab` 命名的测试仓,对生产仓会拒绝执行。

`main-full`(分阶段就是逐段追加):

```json
{
  "name": "main-bootstrap-protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": true,
        "require_last_push_approval": true,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["merge"] } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [
          { "context": "Branch policy" },
          { "context": "Verify" },
          { "context": "Promotion PR policy" } ] } }
  ]
}
```

`dev-minimum` 同构:`include: ["dev"]`,checks 仅 `Verify`,pull_request 仅 approve≥1 + thread resolution。

创建:`gh api -X POST repos/miracleqihe/symgene/rulesets --input main-full.json`(仅 Owner admin token)。备份当前 legacy:`gh api repos/miracleqihe/symgene/branches/main/protection > backup-main-protection.json`(Owner 可读;对当前身份 404/UNVERIFIED)。

## 4. 审核死锁目录与恢复

| ID | 场景 | 触发组合 | 症状 | 恢复 |
|----|------|----------|------|------|
| D1 | 唯一 admin 自开 PR | approve≥1 + 无 bypass | 无任何人可批准 | 临时降 approve 数;或 Owner 以 bypass 身份合并(审计日志留痕;事后恢复) |
| D2 | Owner 是 `.github/` 变更作者 + require_code_owner_review | CODEOWNERS 仅 `@miracleqihe` | 治理类 PR 永久卡死 | **预防:W4 前把 CODEOWNERS 改为 `* @miracleqihe` + `/.github/ @miracleqihe @y4ho0`**;紧急:临时关闭 require_code_owner_review |
| D3 | 最新推送者=唯一可批准者 | require_last_push_approval + 单人仓 | 自推自批被拒,PR 卡死 | 其他人 push 一次空提交;或临时关闭该参数 |
| D4 | 严格模式 + 高频 main | strict + 必需 checks | 晋级 PR 反复过期,合并饥饿 | 关 strict(保留 checks);或降低 main 推进频率窗口 |
| D5 | 必需 check 名拼写错误/大小写不符 | `verify` vs `Verify` | 该 check 永不出现,合并永久阻塞 | 逐字符核对 REQUIRED-CHECKS-MATRIX §3;移除错误项 |
| D6 | 双重保护叠加 | legacy 旧规则未清理 + 新 ruleset | 两套"并集"条件互相拉扯 | Stage 0 先备份并**删除** legacy main/dev 保护,再启用 ruleset(单一事实源) |

## 5. 数据仓专项

1. 套餐路径二选一(Owner 决策):A. 转公开(内容是否可公开需另行确认);B. 升级付费套餐。解除后直接应用与网站 dev 同构的 ruleset 模板。
2. 解除前的补偿控制(当前套餐私有仓内可用,admin 现在就能做,列于 OWNER-ACTIONS):
   - `allowed_actions: all` → 收紧为选定 allowlist(目前仓内只用 actions/checkout、actions/setup-node);
   - 保持 workflow token=read(已满足);
   - `ci.yml` 的 `pull_request` 增加分支过滤(代码改动,走 PR);
   - 关键分支的 merge 仅经 PR 流程(靠协作约定,无服务端强制 —— 明示残留风险)。
3. 残留风险声明:在解除套餐限制前,数据仓**不存在服务端可强制的分支保护**;任何 write 协作者可直接 push main/dev。此风险在本方案中显式接受并记录,而非掩盖。

## 6. 验证与回滚

- 每个阶段完成后:`gh api repos/miracleqihe/symgene/rulesets` 应且仅应列出预期 ruleset;`GET /branches/main` 仍 protected=true(legacy 与 rulesets 并存时该字段为真,来源以 rulesets 列表为准)。
- 回滚:单个 ruleset `PATCH enforcement: disabled`,或 `DELETE`;legacy 恢复:用 Stage 0 的 backup JSON `PUT /branches/{branch}/protection`。
- 平台行为实测(拒绝合并、自批准 403 等)全部在测试仓执行,见 `PLATFORM-NEGATIVE-TESTS/`;生产仓只做正向验证。
