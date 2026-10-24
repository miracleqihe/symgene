# R2-OWNER-ACTIONS — 仍待 Owner 执行的真实平台操作

以下均需网站仓 admin(`miracleqihe`)或测试仓创建权限;本包不代行、不绕过。

## 测试仓(R2-B 全部真实平台裁决的前置)

1. 创建 `y4ho0/symgene-sec-lab`(public,网站仓精简副本,含同名 check 与同构 github-pages 环境 branch policy)。
2. 配置双测试身份:`GH_A_TOKEN/GH_A_USER`、`GH_B_TOKEN/GH_B_USER`(A 需 write 且非 admin;B 需 write + review 权限;`assert_identity` 将校验绑定)。
3. 以 `scripts/ruleset-apply.sh` 注入 main-full/dev-minimum 规则集(仅对 `*-sec-lab` 生效,生产仓名硬拒绝)。
4. 执行 NEG-01..11(11 个场景的真实裁决;NEG-05 为平台行为测量)。

## 生产侧(顺序与 RUNBOOK/OWNER-ACTIONS 一致,R2 无变化)

1. 决策 S0 与 #37 的整合路线(RUNBOOK「S0-on-#37 最小差量」为唯一推荐方式);#35 若先合并,基于新 main 重制。
2. 备份 main/dev legacy 保护(首次可读)→ 无空窗切换 rulesets(激活→验证→才删 legacy)。
3. CODEOWNERS 第二 Owner PR(先于 require_code_owner_review;平台语义与死锁见 MATRIX §4)。
4. 紧急绕过若发生:遵守 RULESET-MIGRATION-PLAN §4.1(≤24h、变更日志、恢复复核、绕过期禁合并)。
5. 不恢复旧 Publication approval 门禁;`Publication integrity` 是否设必需属独立决策。

## 明确仍为 BLOCKED / 未授权

- Main Bootstrap 落地(合并 S0/S1 进 main/dev)维持 BLOCKED,直至独立 Reviewer 接受 R2 整改且 Owner 决策整合路线。
- 禁止:Approve/Merge PR #40、修改 rulesets、修改生产环境、启用 Pages、任何部署、修改 #37/#38/#39 原分支。
