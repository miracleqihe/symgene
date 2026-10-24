# S0 / S1 补丁本地验证记录

- 日期:2026-10-24
- 基准 SHA:`22eb347edf3056955d6437c7eb951b63c28f76e0`(网站 main,已与远端核对一致)
- 工具:git apply(format-patch 输出)、node v22.23.4(与 CI node-version: 22 一致)
- 所有操作均在本地 worktree(`.worktrees/bootstrap-verify`,detached at 22eb347)完成,未触碰任何远端仓库。

## 补丁独立性验证(apply / rollback 往返)

| # | 步骤 | 结果 |
|---|------|------|
| 1 | `git apply --check S0-FREEZE.patch`(raw base) | PASS |
| 2 | apply S0 → `git apply -R` S0 → `git diff --exit-code 22eb347 -- .` | CLEAN |
| 3 | `git apply --check S1-TRUSTED-BOOTSTRAP.patch`(raw base,不依赖 S0) | PASS |
| 4 | apply S1(raw base) | PASS |
| 5 | S1 单独状态下运行治理测试 | 19 pass / 1 fail(预期:仓库状态审计报 `DEPLOY_TRIGGER_PUSH`,提示 S0 未应用) |
| 6 | 在 S1 之上叠加 apply S0 | PASS |
| 7 | S0+S1 叠加状态下运行全部测试 | 20 pass / 0 fail |
| 8 | `git apply -R --check S1`(叠加状态) | PASS |
| 9 | `git apply -R --check S0`(叠加状态) | PASS |

结论:

- 两补丁对同一 base SHA `22eb347` 独立可应用、独立可回滚(改动文件不相交:S0 只动 `deploy-pages.yml`,S1 只新增 `.github/tests/*` 并在 `ci.yml` 追加 job)。
- S1 的仓库状态测试是 S0 的强制层:只上 S1 不上 S0 时 CI 的 Governance 检查会红,并给出"apply S0-FREEZE.patch"的修复提示。

## 测试明细

- `governance-library.test.mjs`:17 个用例(10 个负向 fixture:push 触发、schedule 触发、脱离 github-pages 环境、缺 id-token、非 deploy job 提权、并发组变更、顶层权限过宽/缺失、跨 run artifact、同名 check 冒充、CODEOWNERS 失守;7 个正向)。含修复记录:任务级缩进解析(4 空格)、auditRepository 误扫非工作流文件 —— 均由 fixture 捕获后修复。
- `governance.test.mjs`:1 个仓库状态审计(在 S0+S1 状态下通过;在缺 S0 或 dev 分支状态下按预期失败)。

## 对 dev 分支的前瞻性验证

将 `origin/dev`(`6a3eea2`)的 `.github/workflows/` 与 `.github/CODEOWNERS` 抽出至临时目录,用同一审计库运行:

```
governance audit: 2 violation(s)
  deploy-pages.yml
    [DEPLOY_TRIGGER_PUSH] deploy-pages.yml still auto-publishes on push to main; ...
    [DEPLOY_TRIGGER_NOT_DISPATCH_ONLY] deploy-pages.yml triggers are [push,workflow_dispatch], ...
```

含义:dev 当前仍携带 push 自动发布触发器。若未来 dev→main 晋级原样带入该差异,Governance 必需检查会将其拦截。晋级前应在 dev 上先行吸收 S0 的触发器变更(见 RUNBOOK 第 5 步)。

## 本轮未验证(明确标注)

- 真实 GitHub 平台对必需检查/规则集的拒绝行为:全部标记 PENDING,见 `PLATFORM-NEGATIVE-TESTS/`。
- 补丁在 GitHub PR 上的实际检查名称与合并门行为:需 Owner 在应用后观察(见 RUNBOOK 验收节)。

## 附:PLATFORM-NEGATIVE-TESTS 脚本守卫验证

- 12 个脚本(LIVE 未设置)逐一以模拟模式运行通过:仅打印计划,零网络写请求。
- `lib.sh require_test_repo` 拒绝路径实测:LIVE 无 TEST_REPO(64)、生产仓 `miracleqihe/symgene`(64)、非 sec-lab 仓(64)、生产仓尾斜杠变体(64)、大小写变体(64)、不存在的 sec-lab 仓(66,可访问性检查)。
- 兼容性修复记录:macOS 自带 bash 3.2 不支持 `${var,,}` 小写展开与部分正则,lib.sh 已改为 `tr` + `case` 实现,实测通过。
- 最终形态补丁在 fresh worktree(22eb347)上 `git apply --check` 双通过(收尾复验)。
