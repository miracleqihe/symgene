# MAIN-BOOTSTRAP-PACKAGE — symgene main 安全 bootstrap 工程包

- 生成:2026-10-24(执行身份 `y4ho0`)
- 基准:网站 main `22eb347edf3056955d6437c7eb951b63c28f76e0`、dev `6a3eea2f679fa8979c66edcba2724675ee74aa93`;配套数据仓为私有仓,其基准坐标不在公开文档披露。
- 承诺:本包生成过程**零写操作**作用于两仓 —— 未改保护设置、未动 main/dev、未动 Pages 状态与部署记录、未建测试仓、未读任何 secret 值。所有管理面写操作均以待办形式交给 Owner。

## 交付物索引

| 文件 | 内容 |
|------|------|
| [PAGES-ENTRYPOINT-INVENTORY.md](PAGES-ENTRYPOINT-INVENTORY.md) | 工作包 A:生产入口完整盘点(唯一发布通道、触发器矩阵、权限 job、环境、部署历史、协作者面、UNVERIFIED 项清单) |
| [S0-FREEZE.patch](S0-FREEZE.patch) | 工作包 B:生产冻结补丁(base 22eb347,仅 deploy-pages.yml 移除 push 触发) |
| [S1-TRUSTED-BOOTSTRAP.patch](S1-TRUSTED-BOOTSTRAP.patch) | 工作包 B:可信治理 bootstrap(base 22eb347,审计库 + 测试 + CI Governance 检查)——**原始形态,R1 整改前** |
| [S1R-REMEDIATION.patch](S1R-REMEDIATION.patch) | R1 审查整改(commit 989fb7b):审计器缺陷修复 + 新增负向测试(现状即 原始补丁 + 本补丁) |
| [S1R2-REMEDIATION.patch](S1R2-REMEDIATION.patch) | R2 审查整改(commit 3588967):审计器二轮加固 + #39 兼容(现状 = 原始补丁 + R1 + R2) |
| [S1R3-REMEDIATION.patch](S1R3-REMEDIATION.patch) | R3 审查整改(commit fc17a9d):条件绕过/表达式 coe/head_ref 与括号索引封堵 |
| [S1R4-REMEDIATION.patch](S1R4-REMEDIATION.patch) | R4 审查整改(commit 31de7a3):引号语义/步骤绑定/块标量/`||` 规则/枚举修正 |
| [S1R5-REMEDIATION.patch](S1R5-REMEDIATION.patch) | R5 架构收口:结构化解析器 + 执行契约 + 可信校验边界 |
| [S1-FINAL.patch](S1-FINAL.patch) | **合并替代**:自基准 22eb347 一步复现最终 .github 状态(= S0+S1+S1R+S1R2+S1R3 的并集,随每轮整改重新导出;与逐段补丁二选一,不得叠加使用) |
| [verification/VERIFICATION-LOG.md](verification/VERIFICATION-LOG.md) | 补丁 apply/rollback 往返矩阵、测试明细、dev 分支前瞻性审计证据 |
| [RULESET-MIGRATION-PLAN.md](RULESET-MIGRATION-PLAN.md) | 工作包 C:逐项可行性矩阵(支持/套餐/权限/check 存在/阶段/死锁/恢复)、ruleset JSON、死锁目录 D1–D6 |
| [REQUIRED-CHECKS-MATRIX.md](REQUIRED-CHECKS-MATRIX.md) | 工作包 C:必需检查矩阵(真实 check 名与证据、可否必需、严格模式交互) |
| [PLATFORM-NEGATIVE-TESTS/](PLATFORM-NEGATIVE-TESTS/README.md) | 工作包 D:11 个负向场景 + 12 个带守卫脚本(生产仓硬拒绝),真实平台裁决项全部标 PENDING |
| [MAIN-BOOTSTRAP-RUNBOOK.md](MAIN-BOOTSTRAP-RUNBOOK.md) | 工作包 E:阶段 0–7 操作手册(每步含权限/前态/预期/验证/恢复/独立 Review/部署风险) |
| [OWNER-ACTIONS.md](OWNER-ACTIONS.md) | Owner 专属步骤抽取与排序 |

## 补丁链与应用顺序(R2 定稿)

自基准 `22eb347edf3056955d6437c7eb951b63c28f76e0` 复现本分支 `.github/` 最终状态的两种方式(二选一):

**方式 A(逐段,可核对各轮整改)**:
1. `git apply S0-FREEZE.patch`(base 22eb347;对应分支 commit `d6fb5fd`)
2. `git apply S1-TRUSTED-BOOTSTRAP.patch`(对应 `7a58407`)
3. `git apply S1R-REMEDIATION.patch`(989fb7b;基于 S0+S1 之后的 .github 状态)
4. `git apply S1R2-REMEDIATION.patch`(3588967;R2 加固)
5. `git apply S1R3-REMEDIATION.patch`(fc17a9d..5d1d930;R3 加固)

**方式 B(单补丁)**:`git apply S1-FINAL.patch`(= 上述并集;**不得与方式 A 叠加**)。

SHA 校验:`git fetch origin review/t03-main-bootstrap-s0-s1 && git log --oneline 22eb347..FETCH_HEAD` 应依次为 d6fb5fd、7a58407、82b05e5、989fb7b、0ec15ed、d814f3c、3588967、6e61994、34f74b0、08f4534、fc17a9d、c5d0e20、5d1d930、0cf720d、(R4 提交,见 verification/VERIFICATION-LOG.md §R4);每步 `git apply --check` 必须先通过;最终 `node --test .github/tests/*.test.mjs` 应为 87/87。测试计数沿革:20(R1 初版)→ 42(R1)→ 63(R2)→ 72(R3)→ 80(R4)→ 87(R5),历史记录见 verification/VERIFICATION-LOG.md。

## 当前状态一句话

生产(https://miracleqihe.github.io/symgene/)停在 `22eb347`(2026-09-15 发布);发布工作流被 Owner 手动禁用,但其文件仍带 push 自动触发 —— S0 固化该冻结,S1 让冻结变成 CI 可强制的不变量;两仓的保护规则按迁移方案分阶段收紧。

## 三个最重要的结论

1. **生产入口唯一且当前双冻结**:build_type=workflow + 工作流 `disabled_manually` + github-pages 环境仅允许 ref main。风险在于"re-enable 一键复活自动发布",S0 以文件级变更消除该风险,且 S1 的 Governance 检查会在任何回潮时打红。
2. **配套数据仓(私有)保护被套餐硬阻塞(admin 实证 403)**:当前套餐下 branch protection 与 rulesets 均不可用。方案给出两条解除路径(转公开/升级套餐)与解除前的补偿控制,并显式声明残留风险。
3. **dev 是回潮通道**:dev 的 deploy-pages.yml 仍带 push 触发器,原样晋级会恢复自动发布 —— 已用 S1 审计库对 dev 实测确认会被拦截;Runbook 阶段 5 要求 dev 先行吸收 S0 形态。

## 诚实边界(UNVERIFIED / PENDING)

- 网站仓 legacy branch protection 详情、Deploy Keys、GitHub Apps、Actions 策略元数据:非 admin 读取受限,标 UNVERIFIED(Owner 在 Runbook S2-1 首次可读)。
- 全部平台拒绝行为(NEG-01..11):PENDING,待测试仓;本轮未建仓、未访问生产部署服务。
- ruleset JSON 模板字段名:以创建时 API schema 校验为准,422 即修正。
