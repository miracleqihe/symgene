# R2-VALIDATION — 测试数量、命令、退出码与 CI 原始链接

## GitHub CI(PR #40 @ `34f74b0`,R2 文档提交后的最终 HEAD)

- CI run(pull_request):**https://github.com/miracleqihe/symgene/actions/runs/40125409347**
  - `Governance` **pass**(job/120965649924)、`Verify` **pass**(job/120965649977)
  - `Branch policy` fail(设计内:head 非 dev,job/120965649953)
- PR governance run:**https://github.com/miracleqihe/symgene/actions/runs/40125429459**(`Promotion PR policy` fail,设计内,job/120965709349)

## 本地验证(node v22.23.4,与 CI node 22 一致;隔离 worktree @ d814f3c 起步)

| # | 命令 | 时点 | 结果 | 退出码 |
|---|------|------|------|--------|
| 1 | `node --test .github/tests/governance-library.test.mjs` | 修复前(21 项新断言先行) | **19 fail**(攻击断言全红;2 对照即绿) | 1 |
| 2 | `node --test .github/tests/*.test.mjs` | 修复后 | **63 tests / 63 pass / 0 fail** | 0 |
| 3 | `node docs/bootstrap/compat/check-37-compat.mjs /tmp/t37head /tmp/t39head` | R2 审计器上 | **COMPAT RESULT: PASS**(#37+#39,保留属性断言全过) | 0 |
| 4 | `git diff --check 82b05e5..HEAD` | — | clean | 0 |
| 5 | `git apply --check` 补丁链 S0/S1/S1R/S1R2 + S1-FINAL | — | 全通过 | 0 |
| 6 | `npm ci && npm run verify` | — | 全绿(含"构建文件无私有/本地引用") | 0 |
| 7 | 12 个平台脚本模拟模式 | — | 全过(仅打印计划,零写请求) | 0/1 |
| 8 | lib.sh 裁决分类 T1–T5(受控命令) | — | BLOCKED(70)/PASS/PASS(正向)/FAIL/BLOCKED(71) 符合设计 | — |
| 9 | 敏感串 grep(协作者名/私有仓名/绝对路径/token) | — | CLEAN | 0 |

## GitHub CI(PR #40 @ `6e61994`)

- CI run(pull_request):**https://github.com/miracleqihe/symgene/actions/runs/40125129766**
  - `Governance` **pass**:https://github.com/miracleqihe/symgene/actions/runs/40125129766/job/120964811311
  - `Verify` **pass**:https://github.com/miracleqihe/symgene/actions/runs/40125129766/job/120964811506
  - `Branch policy` fail(设计内:head 非 dev):https://github.com/miracleqihe/symgene/actions/runs/40125129766/job/120964811485
- PR governance run(pull_request_target):**https://github.com/miracleqihe/symgene/actions/runs/40125126667**
  - `Promotion PR policy` fail(设计内:head/标题非晋级规范):https://github.com/miracleqihe/symgene/actions/runs/40125126667/job/120964802655
- 分支推送未触发任何工作流(ci 仅 push:[dev];deploy-pages 仅 push:[main] 且被 S0 冻结 + 平台 disabled_manually;link-checker 仅 cron)。

## 诚实边界

- 上述全部为本地逻辑验证 + CI 正向验证;11 个平台负向场景的真实拒绝证据仍 **PENDING**(需 sec-lab 测试仓),未以任何模拟冒充。
- "全部测试通过"不构成安全审查结论;接受与否由独立 Reviewer 判断(见 R2-FINDINGS-DISPOSITION 的逐项证据)。
