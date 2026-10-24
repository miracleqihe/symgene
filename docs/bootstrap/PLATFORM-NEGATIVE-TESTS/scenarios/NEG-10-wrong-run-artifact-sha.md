# NEG-10 — 错误 run / artifact / SHA 进入发布链

- 威胁:deploy job 从其他 run(不同 SHA)拉 artifact 发布;或发布链消费未经 verify 的产物。
- 防御层:
  - 仓内强制(已实现,S1):`CROSS_RUN_ARTIFACT` —— deploy job 出现 `run-id:` 即打红;
  - 结构不变量:`DEPLOY_PERMISSIONS_MISSING`/`DEPLOY_ENV_NOT_PAGES`/`DEPLOY_CONCURRENCY_GROUP_CHANGED` 钉死发布链形态;
  - 并发组 `pages-production` 单飞,消除同仓并发 run 交错窗口。
- 执行:`scripts/neg-10-wrong-run-artifact-sha.sh`(在实验室克隆中植入 run-id 变体,断言审计拒绝,然后自动还原)
- 预期:`node --test` 输出含 CROSS_RUN_ARTIFACT,退出非零;还原后审计恢复绿。
- 状态:**PENDING / IN-REPO-ENFORCED(T2 静态断言已本地验证)**。
