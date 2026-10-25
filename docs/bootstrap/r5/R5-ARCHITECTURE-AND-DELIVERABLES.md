# R5 Governance 架构收口 — 交付索引与结论

- HEAD:`cd6ad4a598a1643f28b926bec019cee0836ca09f`(分支 `review/t03-main-bootstrap-s0-s1`,普通 push)
- 完整整改记录:`../verification/VERIFICATION-LOG.md` §R5;兼容证据:`../compat/`(check-37-compat.mjs 双 PR 实测);补丁:`../S1R5-REMEDIATION.patch`(31de7a3..R5,.github)与 `../S1-FINAL.patch`(全链单补丁,已重导出并验证逐字节复现)。

## R5-ARCHITECTURE

**旧方案根因**:审计器以"行级正则 + 全空白归一化"逼近 YAML/Shell 语义 —— 归一化破坏引号内字符与换行的命令语义(R5-1/R5-2),作用域按"防护名单"枚举而非结构推导(Verify/Governance 步骤逃逸,R5-3/4/5/6),平台实验共享累积状态(7)。

**新设计**:
1. `mini-yaml.mjs` 结构化解析器(声明子集):块 map/序列、引号标量、flow 集合、块标量(chomping/缩进指示符);锚点/别名/多文档/Tab/重复键抛 `YamlParseError` → `PARSE_ERROR`(fail closed)。审计器的 Job/Step/Permissions/Needs 视图全部来自解析树。
2. 执行契约(基于解析树,与"防护名单"解耦):branch-policy(模板全等:quote-aware + 换行保留;步骤级 env 绑定;禁条件)、governance(存在、无条件、规范命令唯一步骤)、verify(ci+deploy:存在、无条件、规范 `npm run verify` + `npm ci` 先序)、deploy(权限白名单/needs/失败终判/触发器)。
3. 供应链决策:不引入第三方 YAML 依赖(审计器零依赖、在 npm ci 前运行是其抗篡改属性);actionlint 评估结论:只能补语法/配置层,不能替代 SymGene 执行契约校验,列为 Owner 可选增强。

**残余风险**:解析子集外的合法 YAML 会被拒(误报方向,需人工扩审计器);`script:`(JS)内容不做深度语义分析(仅不可信插值扫描);trusted 校验的 App 依赖(case C)未具备。

## R5-FINDINGS

7 项全部**独立复现确认**(红)并修复(绿),无反驳项:

| # | Finding | 复现 | 修复 |
|---|---|---|---|
| 1 | `exit\n1` 分行绕过模板等价 | 红 | 换行保留归一化(引号内逐字保留) |
| 2 | `'ma in'` job 条件绕过 | 红 | job-if 全等改 quote-aware |
| 3 | Verify job `if: false` | 红 | `VERIFY_JOB_CONDITIONAL` |
| 4 | Verify 步骤 continue-on-error | 红 | verify 纳入 FAILURE_SWALLOWED 范围 |
| 5 | Governance 步骤 if:false / echo PASSED | 红×2 | `GOVERNANCE_STEP_CONDITIONAL` / `GOVERNANCE_STEP_CONTRACT`(规范命令唯一步骤) |
| 6 | Deploy verify 步骤替换 | 红 | `VERIFY_STEP_CONTRACT` + `VERIFY_STEP_ORDER` |
| 7 | NEG-05 累积工作树 | 代码审读确认 | 三实验隔离重写(见 R5-C) |

## R5-ADVERSARIAL-TESTS

7 项复现断言(R5-1..R5-6,含 5-5 两变体)+ 合法对照(folded gate 改为显式 fail-closed 断言;`|| exit 1`、folded 折叠语义、`[[ ]]` 内测试 OR 均有对照)。矩阵四组:

- **A 安全拒绝**:87 项测试中的负向集(R1-R5 累计,含本轮 7 项)全部绿。
- **B 合法兼容**:原始工作流、#37 发布链(五项加固断言)、#39 Legacy 策略、JS `||`/`[[ ]]` OR 对照 —— 全绿。
- **C 可信边界**:候选即数据设计 + 预声明残留 + 绑定输出(见 R5-TRUST-BOUNDARY)。
- **D 工程完整性**:补丁链逐字节复现、`npm run verify` 全绿、文档与 HEAD 一致。

## R5-TRUST-BOUNDARY

- **Candidate validation**(已生效):PR 上的 Governance/Verify 检查 —— 候选可自改,属自检;GitHub CI 已在跑(本轮 pass)。
- **Trusted validation**(已实现,**尚未在 GitHub 生效**):`governance-trusted.yml` + `trusted-audit.mjs` — pull_request_target 仅运行 base.sha 校验逻辑,候选 workflows 以数据经 contents API 读取;绑定 repo/PR 号/base SHA/head SHA(由 PR 号经 API 解析,无 head 插值)/校验器 sha256;裁决含预声明残留,发布为 PR 评论。**生效前提:本 PR 的 `.github` 进入 main**(pull_request_target 取 base 副本)——在此之前任何"可信校验已生效"的说法都不成立。
- **Platform enforcement**(Owner):将 `Governance`、`Governance (trusted)` 设为必需检查;Rulesets 启用;人工审核。

## R5-COMPATIBILITY

#37 `a799746` + #39 `a7ca006` 最新头双实测 **PASS**(exit 0):Phase A 拦截原样晋级;Phase B 零 S0/S1 不变量违规;#37 五项加固与 #39 策略保留断言全过。预声明残留:`GOVERNANCE_JOB_MISSING`(S1 的 governance job 是本包新增,#37/#39 集成时合并)。

## R5-VALIDATION

- `node --test .github/tests/*.test.mjs`:**87/87**(80→87:+7 复现断言;零删除/放宽)。
- `selftest.sh`:10/10;compat:exit 0;`git diff --check` clean;`npm ci && npm run verify` 全绿;12 平台脚本模拟通过。
- CI(PR @ cd6ad4a):[40172523621](https://github.com/miracleqihe/symgene/actions/runs/40172523621) — Governance/Verify **pass**、Branch policy fail(设计内);[40172522681](https://github.com/miracleqihe/symgene/actions/runs/40172522681) — Promotion PR policy fail(设计内)。
