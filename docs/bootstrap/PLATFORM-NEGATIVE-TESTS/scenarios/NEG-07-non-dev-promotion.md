# NEG-07 — 非 dev 晋级必须被拒绝

- 威胁:绕过 dev 直接把 feature 分支(或 fork)合入 main。
- 前置:`Branch policy` 为必需检查。
- 执行:`scripts/neg-07-non-dev-promotion.sh`
- 步骤:A 推 `neg07-feature-*` → 开 PR(base main,head 非 dev)→ 观察 Branch policy 失败输出 → 尝试合并。
- 预期平台响应:Branch policy 检查失败("Pull requests to main must promote the dev branch from this repository."),合并 BLOCKED。
- 仓内强制:S1 审计保证 branch-policy job 本身不被削弱(BRANCH_POLICY_* 三码)。
- 状态:**PENDING / IN-REPO-ENFORCED**。
