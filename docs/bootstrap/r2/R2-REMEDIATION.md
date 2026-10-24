# R2-REMEDIATION — 精确修复清单

补丁:`docs/bootstrap/S1R2-REMEDIATION.patch`(= `git diff 989fb7b..3588967 -- .github`,557 行);文档/框架部分见 commit `6e61994`。审计器:`.github/tests/lib/audit-governance.mjs`;测试:`.github/tests/governance-library.test.mjs`。

## audit-governance.mjs

| 修复 | 位置(行号,6e61994) | 说明 |
|---|---|---|
| 模板全等常量 V1_TEMPLATE/V2_TEMPLATE + normalizeText | L40–L52 | 规范模板 = main@22eb347 与 #37@a799746 的真实门禁脚本(空白归一化) |
| `findDuplicateKeys` | L54–L76 | 顶层与 jobs 作用域重复键 → YAML_DUPLICATE_KEY |
| `auditSwallowedFailures` | L83–L102 | continue-on-error:true / `\|\| true` / `set +e` → FAILURE_SWALLOWED;作用域 = ci.yml{branch-policy,governance} + deploy-pages.yml 全部 job |
| 顶层重复键/flow jobs 接线 | auditWorkflow 内(≈L290–L296) | YAML_DUPLICATE_KEY;jobs 为 flow 映射 → UNSUPPORTED_YAML_CONSTRUCT |
| job 循环:flow 条目 + 动态名 | auditWorkflow 内(≈L325–L341) | job flow 映射 → UNSUPPORTED_YAML_CONSTRUCT;`name:` 含 `${{` → JOB_NAME_DYNAMIC |
| `auditUntrustedInterpolation` + `PR_TRUSTED_FIELDS` | L363–L382 | 仅 `pull_request.number`/`pull_request.base.*` 可插值;head.sha/ref → PR_TARGET_HEAD_REFERENCE;其余 → PR_TARGET_UNTRUSTED_INPUT |
| `auditPullRequestTargetJob` 重写 | L384–L436 | run:/script: 块与 with: 块状态机;name 标签豁免;with: 内键不豁免 |
| deploy 权限白名单 | auditDeployWorkflow 内(≈L466–L478) | DEPLOY_PERMISSIONS_UNEXPECTED(write⊂{pages,id-token},read⊂{contents,actions}) |
| deploy needs + 失败终判 | auditDeployWorkflow 内(≈L484–L501) | DEPLOY_NEEDS_MISSING / DEPLOY_NEEDS_UNKNOWN / DEPLOY_FAILURE_FINALITY |
| `extractRunScript` | L555–L576 | 只对 run 块脚本做模板全等(job 元数据不参与) |
| Branch policy 模板全等 + jobIf 规则 + step 条件 | auditBranchPolicy 内(≈L610–L660) | sigV1/sigV2 = script === 模板;jobIfOk 规则;BRANCH_POLICY_STEP_CONDITION |

## governance-library.test.mjs

新增 21 个测试(19 攻击 + 2 对照):`R2-A1`×3、`R2-A2`×5、`R2-A3`×5、`R2-A4`×4、`R2-A5`×4;GOOD_CI fixture 修正为 main 真实 v1 脚本(补 echo 行)并带 governance job。

## 平台测试框架(scripts/)

- `lib.sh`:identity_var/assert_identity/authed_url/git_as/expect_accepted;require_identity 双变量校验;GH_A 旧单变量仅作 TOKEN 兼容。
- `neg-01`(差分归因)、`neg-02`(作者身份断言)、`neg-03`(最后推送者 API 证据+正向对照)、`neg-04`(等待真绿)、`neg-05`(MEASURED 语义)、`neg-06/07`(目标 job 日志证据)、`neg-08`(认证 URL+非 admin)、`neg-09`(参数修复+失败源日志证明+零 Deployment)、`neg-10`(T1/T2 静态 vs T3 动态 PENDING)、`neg-11`(真绿+显式 dismiss+剩余批准断言)。

## 兼容测试

`docs/bootstrap/compat/check-37-compat.mjs`:支持双 PR(#37+`a799746`,#39+`a7ca006`);Phase A/B per PR;#37 五项保留属性断言;#39 三项策略保留断言。

## 文档

REQUIRED-CHECKS-MATRIX §1.4(官方语义+原文引用)与 §4(CODEOWNERS 行);RULESET-MIGRATION-PLAN(§4.1 纪律、无空窗顺序、D6/§6 回滚反向、W5/M3 残留清除);RUNBOOK(63/63);OWNER-ACTIONS(63/63、#37/#35 前置项);README(补丁链);VERIFICATION-LOG(§R2)。
