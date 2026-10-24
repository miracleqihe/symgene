# NEG-04 — 旧 SHA 审核在 push 后必须失效

- 威胁:审核通过后偷偷 push 新内容再合并(批准对应旧 SHA)。
- 前置:`dismiss_stale_reviews_on_push=true`。
- 执行:`scripts/neg-04-stale-approval-old-sha.sh`
- 步骤:A 开 PR → B 批准(head1)→ A push head2 → 查 reviews 状态 → 尝试合并。
- 预期平台响应:B 的 review state 自动变为 DISMISSED;合并 BLOCKED;head1 时期的绿色 check 不计(检查绑定其产生时的 commit)。
- 严格模式叠加:若 `strict_required_status_checks_policy=true`,head2 还必须重跑全部必需检查(另一道独立防线)。
- 状态:**PENDING**。
