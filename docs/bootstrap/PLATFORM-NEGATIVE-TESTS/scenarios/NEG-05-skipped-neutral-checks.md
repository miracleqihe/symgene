# NEG-05 — CI skipped / neutral 不能充当必需检查通过

- 威胁:把必需检查的 job 改成 `if: false`(skipped)或以 neutral 结论"完成",让门禁看起来满足。
- 前置:必需检查已配置(如 `Branch policy`)。
- 执行:`scripts/neg-05-skipped-neutral-checks.sh`
- 步骤(实验室仓):加一个名为 "Branch policy" 但 `if: false` 的 job → 开 PR → 观察 checks → 尝试合并。case 2 用 API 造一个 conclusion=neutral 的同名 check-run。
- 预期平台响应:skipped job **不产生** check-run(必需名称缺席)→ 合并 BLOCKED;neutral ≠ success → 合并 BLOCKED。
- 平台语义待实测确认点:rulesets 对 skipped 的处理选项与 legacy 界面的差异。
- 状态:**PENDING**。
