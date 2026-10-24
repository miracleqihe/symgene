# R2-COMPATIBILITY — 与 #37/#39 的实际兼容性(最新 HEAD 实测)

- 被测:#37 `a799746db034`(`codex/t03-website-security`,PR 头未变,重新 fetch 核实)、#39 `a7ca00641672`(`codex/restore-standard-release-20261023`,同)
- 审计器:R2 加固版(3588967);命令:`git worktree add --detach /tmp/tNNhead <sha> && node docs/bootstrap/compat/check-37-compat.mjs /tmp/t37head /tmp/t39head`
- 结果:**COMPAT RESULT: PASS**(exit 0)

## PR #37

- Phase A(未调和):报 `DEPLOY_TRIGGER_PUSH` + `DEPLOY_TRIGGER_NOT_DISPATCH_ONLY` —— #37 原样晋级会被 Governance 拦截(R2-A1 模板全等接受其 Branch policy v2)。
- Phase B(最小 S0 差量:on 移除 push;authorization 事件白名单收窄为 `['workflow_dispatch']`):**零 S0/S1 不变量违规**。R2 新规则对其全部通过:deploy job 权限白名单(contents/actions read + pages/id-token write)✓、needs 含 verify 且引用存在 ✓、无 job 级 if ✓、无吞失败 ✓、v2 模板全等 ✓。
- 保留属性断言(差量后逐项在场):Commit identity(CI)、Deployment gate、DEPLOY_CONTEXT_REJECTED(生产授权上下文校验)、ARTIFACT_DIGEST(digest 绑定)、github.run_attempt(run/attempt 绑定)。

## PR #39

- Phase A(未调和):同样报 DEPLOY_TRIGGER_*(dev 链仍带 push 触发)。
- Phase B(最小 S0 差量):**零 S0/S1 不变量违规**。
- 策略保留断言:`publication-integrity:` job 在场(#39 更名保留);`Verify legacy content integrity before building` 步骤保留(非阻断完整性验证,按 Owner 决定);旧阻断步骤 `Refuse unreviewed legacy pages` 未被差量复活。

## 边界与未覆盖

- 兼容验证覆盖 `.github/` 工作流与审计规则交互;#37 的 `scripts/security/*`、`src/production-runtime*` 等运行时资产属其自身测试体系(#37 自带 security-gates 测试),不在本审计器职责内。
- 真实发布绑定验证(NEG-10 T3:digest/SHA 篡改 → 部署失败)需 lab 仓运行 #37 的部署链,PENDING。
- #38(t02 并发/vite)与 S0/S1 文件不相交,无需兼容动作。
