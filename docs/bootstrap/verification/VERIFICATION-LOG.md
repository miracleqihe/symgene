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


---

# R1 独立 Review 整改记录(2026-10-24,commit 989fb7b 起)

## 流程:失败测试先行 → 最小修复 → 全量复测

1. 先在 `governance-library.test.mjs` 追加 14 个新测试(内联 write-all / flow 映射 pages:write / 不可解析 inline / 非法枚举值 / #37 v2 Branch policy / v2 删除约束 / v2 削弱条件 / v2 env 硬编码 / 未识别实现 / flow 映射 head checkout / run 脚本消费 head.sha / 锚点别名 / 多文档 / Tab 缩进 / workflow_run 触发 / 缺 deploy-pages)→ **14 red**。
2. 最小修复 `audit-governance.mjs`;期间兼容测试又暴露顶层纯 read 声明误报 → 值感知修正 + 3 个新测试 + `__mode` 元键修复。
3. 全量复测:**42 tests / 42 pass / 0 fail**(39 库与状态 + 3 顶层权限);未删除或放宽任何既有断言;唯一 fixture 变更是把 GOOD_CI 的 env 从硬编码字面量改为真实上下文插值 —— 硬编码本身就是审计应拒绝的形态(有专门负向测试)。

## 审计器行为变化摘要(全部 fail-closed)

- 内联 permissions(read-all/write-all/flow)被解析;write-all、含 write 的 flow、不可解析值、非法枚举值分别以专用 code 拒绝 —— 修复了"内联形态静默漏报"的漏报缺陷。
- Branch policy 改为签名化:v1(22eb347 bash 否定式)与 v2(#37 正向门)双签名;env 必须插值真实上下文;其余形态 WEAKENED/UNRECOGNIZED 失败。
- pull_request_target 的 head 污染扫描覆盖 flow 映射 checkout 与 run 脚本/输入消费 head.sha|ref(PR_TARGET_HEAD_REFERENCE);YAML 锚点/别名/多文档/Tab/workflow_run 触发/删除 deploy-pages.yml 全部 fail-closed。
- 顶层权限值感知:任何 write 值拒绝;纯 read/none 合法(修正对只读声明的误报,发现于 #37 兼容测试)。

## 平台测试框架(F6/F7)

- `expect_rejection` 移除,`expect_protected_rejection` 上位:保护签名优先匹配 → PASS;杂项(401/403 无签名/404/网络/凭据)→ BLOCKED(70/71);意外成功 → FAIL(1)。五类分类已用受控命令实测(见上 T1–T5)。
- 多账号场景缺 GH_A/GH_B → BLOCKED(72),拒绝单身份代跑;NEG-08 校验执行身份非 admin。
- NEG-09 重写:dispatch 204 ≠ 通过;以 run conclusion=failure + 失败 job 可见 + 该 SHA 无 Deployment 三条为 PASS 条件。
- 12 个脚本模拟模式复跑通过;lib.sh 补回曾遗漏的 plan() 并修复 `--` 分隔符处理。

## #37 × S0 × S1 兼容测试(F10)

对 `a799746`(PR #37 分支头,未合并)真实运行,结果 PASS:
- Phase A:未调和的 #37 报 DEPLOY_TRIGGER_PUSH / DEPLOY_TRIGGER_NOT_DISPATCH_ONLY → 原样晋级会被 Governance 拦截;
- Phase B:最小 S0 差量(移除 push 触发 + 事件白名单收窄)后零 S0/S1 不变量违规 → #37 加固、S1 审计、手动发布策略共存。
完整原始输出见 `../compat/COMPAT-EVIDENCE.md`;脚本 `../compat/check-37-compat.mjs` 可重复执行。

## 未验证(仍 PENDING)

- 全部平台负向场景的真实裁决(NEG-01..11)仍需 `*-sec-lab` 测试仓;skipped/neutral 对必需检查的平台语义(NEG-05 case A)是其中最关键的一项。
- Governance 在真实 PR 上的红/绿以 GitHub CI 为准(见 PR #40 的 check 列表)。
