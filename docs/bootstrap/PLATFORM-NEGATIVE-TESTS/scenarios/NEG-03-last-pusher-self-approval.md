# NEG-03 — 最新推送者自我批准必须无效

- 威胁:作者让"最后 push 的人"就是自己并自批,绕过独立批准要求。
- 前置:main-full ruleset,`require_last_push_approval=true`。
- 执行:`scripts/neg-03-last-pusher-self-approval.sh`
- 步骤:B 开 PR → A(非作者)push 一个提交(A=last pusher)→ A 批准 → 尝试合并。
- 预期平台响应:合并仍 BLOCKED —— last-pusher 的批准不满足"由非最后推送者批准"。
- 对照组:B(非 last pusher)批准 → 合并放行。
- 依赖:NEG-02 的自批准拒绝已生效(否则 A 作为作者直接被拒,无法隔离该规则)。
- 状态:**PENDING**。
