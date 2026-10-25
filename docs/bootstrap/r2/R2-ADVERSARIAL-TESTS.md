# R2-ADVERSARIAL-TESTS — 负向测试与对照结果

全部先写测试 → 旧实现运行(红)→ 最小修复 → 全量复测(绿)。命令:

```
node --test .github/tests/governance-library.test.mjs   # 修复前:19 fail / 修复后:0 fail
node --test .github/tests/*.test.mjs                    # 63 tests / 63 pass / 0 fail
```

## 攻击断言(19,修复前全部红)

| # | 测试名 | 攻击变体 | 修复后判定 |
|---|---|---|---|
| 1 | R2-A1: signature inside a dead string | 门禁签名藏在 echo 字符串里(包含匹配即通过) | BRANCH_POLICY_WEAKENED/UNRECOGNIZED(fail-closed) |
| 2 | R2-A1: extra statements around the v2 script | 门禁脚本前插入额外语句 | 同上(模板全等破坏) |
| 3 | R2-A1: a job-level if that can skip the gate | `if: github.event_name == 'push'` 使门禁在 PR→main 上跳过 | BRANCH_POLICY_NOT_GATED |
| 4 | R2-A2: continue-on-error on the branch-policy step | 吞掉门禁失败 | FAILURE_SWALLOWED |
| 5 | R2-A2: continue-on-error on the Governance job | 同上 | FAILURE_SWALLOWED |
| 6 | R2-A2: "|| true" on the publish-chain verify step | 吞掉 verify 失败 | FAILURE_SWALLOWED |
| 7 | R2-A2: continue-on-error on the deploy verify job | 同上 | FAILURE_SWALLOWED |
| 8 | R2-A3: duplicate top-level keys | `permissions:` 双写(解析器混淆面) | YAML_DUPLICATE_KEY |
| 9 | R2-A3: duplicate job ids | `deploy:` 双写 | YAML_DUPLICATE_KEY |
| 10 | R2-A3: flow-mapping jobs blocks | `jobs: {verify: {...}}` 整块 flow(逃逸 job 级审计) | UNSUPPORTED_YAML_CONSTRUCT |
| 11 | R2-A3: flow-mapping job entries | `verify: {runs-on: ...}` 条目 flow(逃逸提权审计) | UNSUPPORTED_YAML_CONSTRUCT |
| 12 | R2-A3: dynamic job display names | `name: ${{ matrix.policy-name }}`(逃逸同名检测) | JOB_NAME_DYNAMIC |
| 13 | R2-A4: run scripts interpolating pull_request.title | PR 标题注入特权脚本 | PR_TARGET_UNTRUSTED_INPUT |
| 14 | R2-A4: github-script interpolating pull_request.body | body 注入 github-script | PR_TARGET_UNTRUSTED_INPUT |
| 15 | R2-A4: with: inputs carrying pull_request.title | title 进 action 输入 | PR_TARGET_UNTRUSTED_INPUT |
| 16 | R2-A5: deploy job with contents: write | 发布 job 越权写仓库 | DEPLOY_PERMISSIONS_UNEXPECTED |
| 17 | R2-A5: deploy job without needs | 发布不依赖验证链 | DEPLOY_NEEDS_MISSING |
| 18 | R2-A5: deploy needs referencing an unknown job | needs 幽灵引用 | DEPLOY_NEEDS_UNKNOWN |
| 19 | R2-A5: deploy job running on failure (if: always()) | verify 失败仍发布 | DEPLOY_FAILURE_FINALITY |

## 对照断言(2,修复前即绿 —— 证明无误报)

| # | 测试名 | 语义 |
|---|---|---|
| 20 | R2-A2: benign continue-on-error outside gate/publish files | pr-governance 的合法 continue-on-error 不受影响 |
| 21 | R2-A4: pull_request.number and base.* stay allowed | 可信字段插值不被误拒 |

## 既有断言回归

R1 的 42 项测试零删除、零放宽;唯一 fixture 变更 = GOOD_CI 对齐 main 真实 v1 脚本(补 echo 行 —— 模板全等所必需,旧 fixture 本身就是被审计拒绝的形态)并加入 governance job(与 S1 的 ci.yml 形态一致)。

## 平台负测(PENDING,禁模拟冒充)

12 个脚本模拟模式通过;`lib.sh` 裁决分类(T1 distress→BLOCKED/70、T2 pattern→PASS、T3 unexpected-success→FAIL、T4 unknown→BLOCKED/71、T5 自批准 403→PASS)以受控命令实测。真实平台裁决仍 PENDING,见 R2-VALIDATION。
