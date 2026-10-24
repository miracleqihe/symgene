# NEG-05 — skipped / neutral 不得满足必需检查

- 威胁:把必需检查的 job 改成 `if: false`(skipped)、用 workflow 过滤让检查"消失",或以 neutral 结论"完成",让门禁看起来满足。
- 三种形态的语义(R1 修订):

| 形态 | 平台行为 | 预期 |
|------|----------|------|
| Job 条件跳过 | **产生** conclusion=`skipped` 的 check-run(修正旧文档"不产生 check-run"的错误) | skipped 是否放行合并 → **PENDING 实测**;若放行 = FAIL,必须改用严格 Engineering gate |
| Workflow 过滤跳过 | 该 ref 无 run、无 check-run | 必需名缺席 → 合并 BLOCKED(高置信) |
| neutral 结论 | check-run 存在但非 success | 合并 BLOCKED(高置信) |

- 执行:`scripts/neg-05-skipped-neutral-checks.sh`(case A 记录 head 上的 check-run 结论作为证据,再断言合并被保护拒绝)
- 裁决规则:PASS 仅当合并被保护拒绝;skipped 满足门禁 → FAIL;API/权限问题 → BLOCKED。
- 状态:**PENDING**。
