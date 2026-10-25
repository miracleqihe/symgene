# NEG-06 — 同名 check 冒充

- 威胁:协作者添加一个名为 "Branch policy" 但永远成功的 job,冒充必需检查。
- 三层防御:
  - L1 ruleset:`required_status_checks` 可绑定 `integration_id`;注意 Actions 的所有 check-run 共享同一个 App id,绑定无法区分仓内工作流 —— 这是已知平台限制,须如实记录。
  - L2 仓内强制(已实现,S1):Governance 审计 `CHECK_NAME_COLLISION` 直接把重名 job 打红。
  - L3 审核层:`/.github/` 变更需 code owner 批准,冒充工作流进不了 main。
- 执行:`scripts/neg-06-impersonated-check-name.sh`(case 2 为 fork 来源对照)
- 预期平台响应:fork PR 的 check-run 不满足必需检查(平台规则);同仓冒充由 L2 拦截。
- 状态:**PENDING / IN-REPO-ENFORCED**。
