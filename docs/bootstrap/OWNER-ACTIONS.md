# OWNER-ACTIONS — Owner 专属操作清单(非 Owner 不可执行)

Owner = `miracleqihe`(网站仓唯一 admin)。配套数据仓(私有)的管理员即本包执行者。
本清单是 `MAIN-BOOTSTRAP-RUNBOOK.md` 中需要 admin 权限的步骤的抽取与排序;每项的完整"预期响应/验证/恢复"见 Runbook 对应步骤。**执行顺序不可调换**(尤其 S3-2 必须先于 S3-3,否则触发 D2 死锁)。

## 前置确认(1 分钟)

- 注意:若 #37/#35 已合并,须先按 RUNBOOK「S0-on-#37 最小差量」重制补丁(禁止旧文件直接覆盖),并跑 `node docs/bootstrap/compat/check-37-compat.mjs <#37 checkout>`

- [ ] `gh api repos/miracleqihe/symgene/actions/workflows` 中 deploy-pages 状态仍为 `disabled_manually`
- [ ] 最近一次 Pages 部署仍为 `22eb347edf30`(2026-09-15)
- [ ] 本地已完成:补丁链 `git apply --check` 全通过,`node --test .github/tests/*.test.mjs` 63/63(补丁链与 SHA 校验见 verification/VERIFICATION-LOG.md §R2)

## 顺序操作

| # | 操作 | Runbook 步骤 | 需要独立 Review | 可能触发网站部署 |
|---|------|--------------|------------------|------------------|
| 1 | 备份 main/dev legacy 保护 JSON | S2-1 | 否 | 否 |
| 2 | 把 S0+S1 推进 **dev** 开 PR 并批准合并(避免 Branch policy 治理例外) | S1-1 选项 A | 是 | 否 |
| 3 | dev 绿后,dev→main 晋级 PR(按晋级模板),merge commit 方式合并 | S1-1 | 是 | **否**(工作流禁用 + S0 移除 push 触发) |
| 4 | 合并后确认:`Governance` 检查绿、deploy-pages 仍 disabled | S1-2 | 否 | 否 |
| 5 | 创建 `main-minimum` ruleset(deletion/non_fast_forward/3 个必需检查,strict=false) | S2-2 | 是(检查名逐字符核对) | 否 |
| 6 | 一周后按需清理 legacy 双重保护 | S2-3 | 是 | 否 |
| 7 | CODEOWNERS:`/.github/` 增加第二 Owner `@y4ho0` | S3-2 | 是 | 否 |
| 8 | ruleset 追加 approve≥1 + dismiss stale + thread resolution | S3-1 | 是 | 否 |
| 9 | ruleset 追加 `require_code_owner_review` + `require_last_push_approval` | S3-3 | 是 | 否 |
| 10 | 创建 `dev-minimum` ruleset | S4-1 | 是 | 否 |
| 11 | 在 dev 开 PR 吸收 S0 触发器形态(消除晋级回潮) | S5-1/5-2 | 是 | 否 |
| 12 | (≥2 周后)strict 模式;`Governance` 进必需集。**不恢复旧 Publication approval 内容审读门禁**(Owner 已在 #39 撤销;legacy 发布资格与 T02 授权分离;`Publication integrity` 是否设必需属新的独立决策) | S6-1..3 | 是 | 否 |
| 13 | (可选)建 `y4ho0/symgene-sec-lab` 测试仓并跑全部 NEG 用例 | S7-1 | 否 | 否(仅测试仓) |
| 14 | (未来某次晋级)受控发布:dispatch deploy-pages@main 并留痕 | S7-3 | 是 | **是** |

## 数据仓(私有,管理员操作,可与上面并行)

| # | 操作 | 说明 |
|---|------|------|
| D-1 | 决策:转公开或升级套餐 | 解除 branch protection / rulesets 的 403(已实证);无第三条服务端路径 |
| D-2 | 立即可做的补偿控制(不依赖套餐):Actions `allowed_actions: all` → 收紧 allowlist;保持 workflow token=read(已满足) | Settings → Actions → General |
| D-3 | 修正 ci.yml 的 `pull_request` 无分支过滤 → `branches: [dev, main]`(走 PR) | 缩小同名 check 与配额面 |
| D-4 | 套餐解除后:应用 dev-minimum 同构 ruleset + `verify` 必需 | 用 RULESET-MIGRATION-PLAN §3 JSON |

## 明确不做(本轮承诺)

- 不重启用 deploy-pages 工作流;不对生产 dispatch;不修改 main/dev 现有内容与 Pages 设置;不创建/删除任何生产分支;不读取任何 secret 值。
- 完成标准:Owner 依此清单逐项执行并验收后,main 的发布入口处于"必须显式、有审核、可审计"状态 —— 而非任何人拿到了生产发布权限。
