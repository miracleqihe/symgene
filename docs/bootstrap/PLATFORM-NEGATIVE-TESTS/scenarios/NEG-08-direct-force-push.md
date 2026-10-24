# NEG-08 — 直接 push / force push / 删除受保护分支必须被拒绝

- 威胁:绕过 PR 流程写 main/dev,或重写历史。
- 前置:main-full 与 dev-minimum ruleset 均启用 deletion + non_fast_forward + pull_request。
- 执行:`scripts/neg-08-direct-force-push.sh`(以 write-only 身份 GH_A 执行)
- 预期平台响应:
  - `git push origin HEAD:main` → remote rejected(protected branch);
  - `git push --force origin HEAD:main` → 被 non_fast_forward 拒绝;
  - `git push origin :main` → 被 deletion 拒绝;
  - dev 同样三条全部拒绝。
- 判定注意:以 admin 身份执行得到"成功"不构成失败(rulesets 需显式 bypass 名单,admin 默认受限)——但应在报告中注明执行身份。
- 状态:**PENDING**。
