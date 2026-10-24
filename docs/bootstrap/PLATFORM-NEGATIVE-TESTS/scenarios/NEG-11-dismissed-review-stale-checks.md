# NEG-11 — 撤销审核后旧检查结果不得放行合并

- 威胁:审核被撤销/失效后,利用旧 head 的绿色 checks 误导合并判断。
- 前置:`dismiss_stale_reviews_on_push=true`;至少一个必需检查在 head1 已绿。
- 执行:`scripts/neg-11-dismissed-review-stale-checks.sh`
- 步骤:B 批准 head1 → 等 checks 绿 → A push head2 → 显式 dismiss 残留 review(PUT /pulls/{n}/reviews/{id}/dismissals,需 dismissal 权限)→ 尝试合并。
- 预期平台响应:合并 BLOCKED —— 必需检查按"当前 head"评估,head1 的绿 checks 在 head2 不计。
- 该语义是本包最关键的待实测假设之一:若实测发现 legacy/rulesets 任一模式下旧绿检查可放行,必须立即开启严格模式(strict)作为补偿。
- 状态:**PENDING**。
