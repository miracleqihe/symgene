# NEG-01 — 未审核合并必须被拒绝

- 威胁:write 协作者绕过审核直接合并 PR。
- 前置:测试仓已应用 main-full ruleset( approve>=1 )。
- 执行:`scripts/neg-01-unapproved-merge.sh`(LIVE=1 TEST_REPO=... LAB_DIR=...)
- 步骤:A 推分支并开 PR(base main)→ 不做任何审核 → 直接 `gh pr merge --merge`。
- 预期平台响应:合并被拒(mergePullRequest 返回 "Pull request is not mergeable"/MERGE_STATE_STATUS=BLOCKED;UI 显示 Merging is blocked,原因 required approving review)。
- 判定:REJECTED-AS-EXPECTED = 通过;UNEXPECTED-SUCCESS = 保护缺失,立即停用并回查规则。
- 状态:**PENDING**(等待测试仓)。
