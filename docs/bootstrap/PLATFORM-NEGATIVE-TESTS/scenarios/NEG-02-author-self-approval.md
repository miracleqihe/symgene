# NEG-02 — 作者自我批准必须被拒绝

- 威胁:PR 作者用自己账号批准自己。
- 前置:无(平台级规则,与 ruleset 无关;ruleset 的 approve 数在此基础上生效)。
- 执行:`scripts/neg-02-author-self-approval.sh`
- 步骤:A 开 PR → A 调 `POST /repos/{r}/pulls/{n}/reviews -f event=APPROVE`。
- 预期平台响应:HTTP 403,"Can not approve your own pull request"。
- 备注:B 帮 A 批准后 A 再 push 新提交,由 NEG-03/NEG-04 覆盖。
- 状态:**PENDING**。
