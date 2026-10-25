# #37 × S0 × S1 隔离兼容测试证据

- 日期:2026-10-24
- 被测对象:`origin/codex/t03-website-security` 分支头 `a799746db034`(PR #37,截至运行时未合并)的完整 `.github/workflows/`
- 审计器:本分支(989fb7b)的 `.github/tests/lib/audit-governance.mjs`(S1R 整改后)
- 命令:`git worktree add --detach /tmp/t37head a799746 && node docs/bootstrap/compat/check-37-compat.mjs /tmp/t37head`
- 退出码:0(PASS)

## 结论

1. **Phase A(未调和)**:#37 的 deploy-pages.yml 保留 push 触发 → 审计器报 `DEPLOY_TRIGGER_PUSH` + `DEPLOY_TRIGGER_NOT_DISPATCH_ONLY`。即:#37 原样晋级会被 Governance 检查拦截,S0 的意图在 #37 版本上同样可强制。
2. **Phase B(最小 S0 差量)**:对 #37 版本仅做两处改动(`on:` 移除 push;authorization 事件白名单收窄为 `['workflow_dispatch']`)后,零 S0/S1 不变量违规 —— #37 的加固 CI、S1 审计、手动发布策略三者共存。早前一轮运行暴露的 `TOP_PERMISSIONS_NOT_LEAST_PRIVILEGE`(publication-policy.yml 声明 4 个只读 scope)已按值感知语义修正:纯 read/none 声明合法,任何 write 值仍拒绝。
3. 未发现 #37 内部的 CHECK_NAME_COLLISION(t02-verification 已由 #37 改名,无同名冲突)。

## 原始输出

```
== Phase A: unreconciled #37 (push trigger retained) ==
governance audit: 2 violation(s)
  deploy-pages.yml
    [DEPLOY_TRIGGER_PUSH] deploy-pages.yml still auto-publishes on push to main; apply S0-FREEZE.patch (publishing must be workflow_dispatch only)
    [DEPLOY_TRIGGER_NOT_DISPATCH_ONLY] deploy-pages.yml triggers are [push,workflow_dispatch], expected exactly [workflow_dispatch]
OK: DEPLOY_TRIGGER_PUSH present — Governance would block an as-is promotion
OK: DEPLOY_TRIGGER_NOT_DISPATCH_ONLY present — Governance would block an as-is promotion

== Phase B: S0-reconciled #37 (dispatch-only publish) ==
OK: zero S0/S1-invariant violations — #37 CI, S1 audit and dispatch-only publishing coexist

COMPAT RESULT: PASS
```
