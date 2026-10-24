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
| 7 | S0+S1 叠加状态下运行全部测试 | 20 pass / 0 fail(R1 时点值;现行计数见文末 R1/R2 记录) |
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


---

# R2 独立 Review 整改记录(2026-10-24,commit 3588967 起)

## 复现结论(21 项对抗断言)

- **19 项确认为真实缺陷**(先红后绿):内联 permissions、flow 映射权限、死字符串绕过 Branch policy 签名、多余语句绕过、job 级 if 跳过门禁、continue-on-error 吞失败(门禁与发布链)、`|| true` 吞失败、重复键无警觉、flow jobs 静默跳过 job 级检查、动态 job 名逃逸同名检测、PR title/body 插值注入、`with:` 携带 title、deploy job 权限白名单缺失、needs 缺失、needs 幽灵引用、`if: always()` 绕过 verify 失败。
- **2 项为对照确认**(预期即绿):可信输入(number/base.*)不被误拒;pr-governance 的合法 continue-on-error 不受新规则影响。
- 无"未能复现、提供反证"的 Finding;R1 遗留的 2 项误报性表述(顶层纯 read 声明、GOOD_CI env 硬编码 fixture)已在 R1 内修正。

## 关键修复

1. Branch policy:模板**全等**(提取 run 块脚本,空白规范化后 == v1/v2 规范模板)取代包含匹配 —— 死字符串/多余语句/非执行分支不再能伪装;job 级 if 仅允许 v1 的 main 门控形态;step 级条件拒绝。
2. 发布链:deploy job 权限白名单(write 仅 pages/id-token;read 仅 contents/actions)、needs 必含 verify 且不得引用未知 job、deploy job 禁止 job 级 if(always()/!cancelled() 绕过 verify 失败)。
3. pull_request_target:仅 `pull_request.number` 与 `pull_request.base.*` 可插值;title/body/labels/head.* 进入 run/script/with 即 PR_TARGET_UNTRUSTED_INPUT。
4. 吞失败:FAILURE_SWALLOWED 拒绝门禁与发布链内的 continue-on-error:true / `|| true` / `set +e`(pr-governance 的合法用途不受影响)。
5. YAML 边界:重复键 YAML_DUPLICATE_KEY(扫描器 last-wins 与 YAML 语义一致,标记属 fail-closed 卫生措施)、flow jobs 拒绝、动态 job 名 JOB_NAME_DYNAMIC。

## 解析器与可信签名评估(任务书要求)

结论:维持"受限子集 + fail-closed + 模板全等",不引入第三方 YAML 解析器。理由:(a) 治理测试在 `npm ci` 之前运行,零依赖是其抗篡改属性;(b) 内置解析器会把审计面扩大到解析器自身与依赖链;(c) 子集外的任何语法一律显式失败(UNSUPPORTED_*/UNPARSEABLE/UNRECOGNIZED),不存在静默漏报通道;(d) Branch policy 的模板全等即轻量"可信工作流签名":新门禁变体必须经审查显式扩充模板表。若未来工作流语法复杂度超出子集,Owner 可评估引入 actionlint 或 vendored 解析器 —— 属独立决策,当前不必要。

## 官方语义查证(NEG-05)

docs.github.com "Status checks":*"A job that is skipped will report its status as 'Success'. It will not prevent a pull request from merging, even if it is a required check."*;"About protected branches":必需检查以 successful/skipped/neutral 即满足。**R1 文档"skipped 阻塞合并"的推测错误,已更正**;项目安全要求改为:门禁不可跳过(审计器强制)+ 必需集只含无条件 job。NEG-05 改为平台行为测量(MEASURED),不再以"阻塞"为 PASS 条件。

## 平台测试框架(R2-B)

- 身份绑定:GH_<N>_TOKEN + GH_<N>_USER 双变量,`assert_identity` 校验 token 确以该用户认证;git 操作经 `authed_url`(禁用本地默认凭据);NEG-03 增加最后推送者 API 证据(last commit author.login == GH_A_USER)与正向对照(B 批准 → 合并成功)。
- 逐场景归因:NEG-01 差分法(基线阻塞 → 批准 → 放行 → 撤销批准 → 再阻塞);NEG-04/11 等待 head 检查真绿后再尝试(排除 pending 检查干扰);NEG-06/07 以 Governance/Branch policy 的 job 日志证据为 PASS 条件(非仅合并阻塞);NEG-09 修复 dispatch 参数(移除畸形 client_payload)并要求失败 job 日志含 environment 拒绝文本 + 该 SHA 零 Deployment;NEG-08 全部 push 走 GH_A 认证 URL 且先验证非 admin。
- 判定:PASS/FAIL/BLOCKED 不变;新增 expect_accepted(正向控制)与 MEASURED(平台测量);模拟模式只打印计划,永不冒充平台证据。

## 全量复测(R2 收口时点)

- `node --test .github/tests/*.test.mjs`(node v22.23.4):**63 tests / 63 pass / 0 fail**(R1 末 42 → R2 63,新增 21 项对抗/对照断言;零断言删除或放宽)。
- 兼容:PR #37(`a799746`)+ PR #39(`a7ca006`)双实测 PASS,含保留属性断言(身份/工程终判/生产授权/digest 绑定/run-attempt 绑定;#39 更名与 legacy 完整性策略不被旧阻断覆盖)。
- `git diff --check` clean;`npm ci && npm run verify` 全绿;12 个平台脚本模拟模式通过;`git apply --check` 补丁链(S0→S1→S1R→S1R2)与合并版 S1-FINAL 全通过。


---

# R3 独立 Review 整改记录(2026-10-24,commit fc17a9d 起)

## 复现结论(P1-10..P1-17、P2-06)

9 项新断言:**7 项确认为真实缺陷**(先红后绿),**2 项为对照确认**;逐项:

| Finding | 处置 | 证据 |
|---|---|---|
| P1-10 Branch policy job 条件绕过(`&& false`) | 确认:R2 规则以子串包含判断,`if: github.base_ref == 'main' && false` 恒假但通过 → skipped 满足必需检查 → 门禁整体旁路 | `P1-10: job if "…&& false"…` 红;对照 `if: false` 原已拒绝(绿) | 
| P1-11 Governance job 条件跳过 | 确认:R2 未覆盖 governance job 的 job 级 if | `P1-11` 两测红(if:false 与表达式形态) |
| P1-12 表达式 continue-on-error | 确认:R2 只匹配字面 true | `P1-12` 两测红(`${{ }}` 与数字 1) |
| P1-13 head_ref 与括号索引漏检 | 确认:`github.head_ref` 与 `github['event']['pull_request']['title']` 均逃逸 R2 扫描 | `P1-13` 两测红;对照:括号形态的 number 仍放行(绿) |
| P1-14 NEG-01 提前合并 | 确认:R2 正向控制在第 (2) 步真实合并,第 (3) 步不可达且污染 lab main | 脚本重写:差分改用 mergeStateStatus(MERGEABLE/BLOCKED 只读断言),全程零合并 |
| P1-15 NEG-03 正向对照 = 作者自批准 | 确认:R2 由 B(作者)批准 → 403 自批准,对照永远无法成立 | 脚本重写:引入第三身份 C(非作者非最后推送者)执行对照;A/B/C 三重 assert_identity |
| P1-16 NEG-09 默认凭据回退 | 确认:R2 脚本认证 push 失败时回退 `git push origin`(本地默认凭据) | 移除回退;认证 push 失败 = BLOCKED(70) |
| P1-17 NEG-05 三类实验未实现 | 确认:R2 仅 case A 有 live 实现 | 三类实验全部实现:case A(job if:false → skipped → 预期放行)、case B(path 过滤 → 无 run → 预期阻塞)、case C(API 造 neutral → 预期放行);逐项 MEASURED 记录 |
| P2-06 Runbook 仍应用过期 S1 补丁 | 确认:S1-1 命令只 apply S0+S1 原始补丁 | 改为全链 S0→S1→S1R→S1R2→S1R3(或 S1-FINAL 单补丁),计数 72/72 |

## R3 审计器变化

- Branch policy job 级 if:必须与 v1 门控条件**全等**(空白归一化后 == `github.event_name=='pull_request'&&github.base_ref=='main'`),子串包含规则废除。
- Governance job:存在 job 级 if 即 GOVERNANCE_JOB_CONDITIONAL(skipped 满足必需检查 → 必须无条件)。
- continue-on-error:仅字面 `false` 放行;表达式/数字/true 一律 FAILURE_SWALLOWED。
- 不可信输入:表达式归一化(括号索引 → 点路径)后匹配;`github.head_ref` 在 pull_request_target run/script/with 位置一律 PR_TARGET_UNTRUSTED_INPUT;可信集不变(number、base.*)。

## 全量复测(R3 收口时点)

- 补丁复现终验:`git apply` 链 S0→S1→S1R→S1R2→S1R3(自 22eb347)与单补丁 S1-FINAL 均能**逐字节复现**分支 `.github`(5 个关键文件 diff 全 MATCH);fc17a9d 引入的一处尾随空格已在 5d1d930 清理,补丁随之重新导出。

- `node --test .github/tests/*.test.mjs`:**72 tests / 72 pass / 0 fail**(63 → 72,+9:7 攻击 + 2 对照;零断言删除或放宽)。
- 兼容:#37 `a799746` + #39 `a7ca006` 双实测 **PASS**(R3 新规则不破坏其文件;保留属性断言全过)。
- 12 个平台脚本模拟模式通过;`git apply --check` 补丁链(S0→S1→S1R→S1R2→S1R3)与 S1-FINAL 全通过。
