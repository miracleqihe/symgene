# NEG-05 — skipped / neutral 与必需检查(R2:官方语义已查证)

- **官方语义(docs.github.com "Status checks")**:job 被跳过会报告为 "Success",**即使它是必需检查也不会阻止合并**;"About protected branches":必需检查以 `successful`/`skipped`/`neutral` 即满足。R1 文档"skipped 会阻塞合并"的推测作废。
- 因此本场景的性质是**平台行为测量**,不再是 PASS/FAIL 保护测试:
  - case A(job 级 `if: false`):预期 check-run=skipped 且合并放行 —— 与官方文档一致记 MEASURED;若实测阻塞则记 MEASURED-DIFFERENT 并上报平台偏差。
  - case B(workflow 过滤跳过):必需名缺席,官方无放行语义(社区记录长期 pending)→ 记 MEASURED。
  - case C(API 造 neutral 结论):官方视为 success → 记 MEASURED。
- **本项目的安全要求(与平台行为区分)**:门禁不可跳过 —— 由 S1R2 审计器强制(门禁 step 禁条件/禁 continue-on-error、Branch policy 模板全等、Governance job 无条件),必需集只含无条件 job。REQUIRED-CHECKS-MATRIX §1.4。
- 执行:`scripts/neg-05-skipped-neutral-checks.sh`(测量,不裁决)
- 状态:**PENDING(lab 测量)**;语义结论已由官方文档给出,不再依赖实测成立。
