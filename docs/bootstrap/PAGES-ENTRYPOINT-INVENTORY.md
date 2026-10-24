# PAGES-ENTRYPOINT-INVENTORY — miracleqihe/symgene 生产入口完整清单

- 盘点日期:2026-10-24
- 方法:全部为只读操作(git fetch / GitHub REST GET)。未修改任何仓库设置、分支、Pages 状态或部署记录;未读取任何 token / secret 值。
- 身份:执行盘点的是本 PR 作者账号,对 `miracleqihe/symgene` 的权限为 pull/push/triage(无 admin、无 maintain)。凡 admin 专属端点返回 403/404 的一律标注 **UNVERIFIED**,不据此断言"不存在"。
- 基准:main = `22eb347edf3056955d6437c7eb951b63c28f76e0`(2026-09-15),dev = `6a3eea2f679fa8979c66edcba2724675ee74aa93`(2026-10-23)。fetch 后与远端一致,期间无新推进(main 分支头未动;`pushed_at=2026-10-23T21:15:30Z` 来自其他分支活动)。

## 1. 唯一生产发布通道

GitHub Pages:`https://miracleqihe.github.io/symgene/`

| 项 | 值 | 来源 |
|----|----|------|
| build_type | `workflow`(仅 Actions 工作流可发布;不存在 legacy 分支发布通道) | `GET /repos/miracleqihe/symgene/pages` |
| source | branch `main`, path `/` | 同上 |
| cname / 自定义 404 | 无 / false | 同上 |
| HTTPS 强制 | true | 同上 |
| 仓可见性 | public | repo 元数据 |

**结论:生产发布的唯一入口是 `.github/workflows/deploy-pages.yml`,且该入口目前被平台层手动禁用。**

## 2. 工作流触发器矩阵(main 基准 22eb347)

| 工作流 | 触发器 | 是否可触达生产 |
|--------|--------|----------------|
| `deploy-pages.yml` | `push: branches:[main]` + `workflow_dispatch` | **是**(deploy job 持 pages:write / id-token:write) |
| `ci.yml` | `pull_request: [dev, main]` + `push: [dev]` + `workflow_dispatch` | 否(仅 contents:read) |
| `pr-governance.yml` | `pull_request_target: [main]` | 否(contents:read;job 级 issues/pull-requests:write 仅评论) |
| `check-external-links.yml` | `schedule: 25 3 * * 1` + `workflow_dispatch` | 否(仅 contents:read) |
| dev 独有:`t02-verification.yml` | `pull_request: [dev, main]` + push 特定 codex 分支 + dispatch | 否(仅 contents:read) |
| `dynamic/agents/copilot-pull-request-reviewer`(平台注册) | PR reviewer agent | 否 |

未发现 `workflow_run`、`repository_dispatch`、`release`、tag 触发器(main 与 dev 均无)。

**注意:`deploy-pages.yml` 当前 registry 状态为 `disabled_manually`**(GET /actions/workflows 可见)。即:平台层已手动停用;但工作流文件本身仍带 `push: [main]` 自动触发,任何人重新启用后,下一次 push 到 main 就会自动发布。这是 S0 补丁要固化的缺口。

## 3. 持有生产权限的 Job(全仓仅 1 个)

`deploy-pages.yml` → `deploy` job:

- `permissions: contents: read, pages: write, id-token: write`
- `environment: github-pages`(环境分支策略只允许 ref `main`,见 §5)
- `needs: verify`(verify job 先构建并上传 artifact `site-dist`,retention 1 天;deploy 从同一 run 下载 artifact 后经 configure-pages / upload-pages-artifact / deploy-pages@v4 发布)
- `concurrency: pages-production, cancel-in-progress: true`(单飞)

其余 job(包括所有 dev 分支工作流)均无 pages/id-token/deployments 写权限。

## 4. GitHub Environments(GET /environments,pull 权限可读)

| 环境 | 创建时间 | 保护规则 | 备注 |
|------|----------|----------|------|
| `github-pages` | 2026-07-29 | `branch_policy`(custom_branch_policies=true, protected_branches=false) | deploy 唯一使用的环境 |
| `copilot` | 2026-08-17 | 无任何保护规则 | Copilot agent 用;无生产权限 |

`can_admins_bypass=true` 为两环境的平台默认值(管理员可绕过环境保护;这是 GitHub 的固有行为,只能靠审计日志发现滥用)。

`github-pages` 环境的自定义分支策略明细(GET /environments/github-pages/deployment-branch-policies):**仅 1 条 —— name=`main`, type=`branch`**。即:即使工作流被其他 ref 触发,deploy-pages 的 deploy job 也会因环境策略拒绝非 main ref。

## 5. Pages 发布历史(GET /deployments?environment=github-pages)

最近 6 次部署全部 `task=deploy`、creator=`miracleqihe`、ref=`main`:

| 时间(UTC) | SHA | 对应运行 |
|-------------|-----|----------|
| 2026-09-15 13:21 | **22eb347edf30(= 当前 main 基准 = 当前线上版本)** | run 34974367422, push 事件, success |
| 2026-09-15 12:27 | 5fd325bbe7a5 | success |
| 2026-09-15 12:08 | 3f0b131a1587 | success |
| 2026-09-01 05:32 | cb3e90ca3a91 | success |
| 2026-08-31 09:59 | ae34a716627f | success |
| 2026-08-30 13:15 | 81e8dba56a3c | success |

即:**线上生产 = main 基准 22eb347,此后 39 天无发布**。deploy-pages 工作流最近 5 次 run 全部由 push 到 main 触发、全部 success、全部 actor=miracleqihe。

(`GET /pages/builds` 需要 admin,本次返回空,历史以 deployments 为准。)

## 6. 权限元数据

### 直接协作者(GET /collaborators,共 10 人)

| 角色 | 数量 | 说明 |
|------|------|------|
| admin | 1 | 仓 Owner `miracleqihe`(用户名公开于 CODEOWNERS) |
| write | 9 | 具备 pull/push/triage;含本 PR 作者。其余用户名从略,避免在公开文档中罗列协作者名单 |

**风险面:9 个 write 协作者可 push 任意非保护分支、开启 PR、运行 PR 类工作流,且具备 Actions 的 workflow_dispatch 权限。main/dev 的实际保护强度决定这条面是否可达生产。**

### Deploy Keys / GitHub Apps / Actions 策略

- Deploy keys:`GET /keys` → 404(需 admin)→ **UNVERIFIED**。
- GitHub Apps 安装列表:`GET /installation` → 401(需 app token)→ **UNVERIFIED**(registry 中可见 Copilot reviewer 为平台内置 agent)。
- `GET /actions/permissions`(default workflow token、allowed_actions、SHA pinning)→ 403(需 admin 或细粒度权限)→ **UNVERIFIED**。
- 未读取、也不会读取任何 secret 值;secret 名称列表属 admin 端点,未获取。

## 7. 分支与工作流保护能力

- `GET /branches/main` 与 `/branches/dev` → **protected=true**(pull 权限即可见,已实证)。
- `GET /branches/{main,dev}/protection`(保护规则详情:必需检查、必需审核数、dismissal 等)→ 404(需 admin)→ **UNVERIFIED**。不得据 404 断言"无规则"。
- `GET /repos/miracleqihe/symgene/rulesets` → 返回**空数组**(该端点 pull 权限可读,已实证)→ **本仓当前没有任何 ruleset**,保护来自传统 branch protection。
- 仓库属个人账号 `miracleqihe`,不存在组织级 rulesets。
- 仓为 public:**套餐不构成保护功能限制**(rulesets / branch protection 全功能可用)。
- CODEOWNERS(main 基准):`* @miracleqihe`;`/.github/ @miracleqihe`;`/CONTRIBUTING.md @miracleqihe`。
- 实测存在于 main 推进/PR 上的 check 名称(commit 22eb347):`Branch policy`、`Verify`、`Promotion PR policy`、`verify`、`deploy`、`check`。dev 头(6a3eea2)另有:`Publication approval`、`Content integration`、`t02-engineering`。

## 8. 治理脚本(main 基准已存在)

- `.github/scripts/validate-promotion-pr.mjs`:校验晋级 PR 模板五节(晋级摘要/包含的变更/验证/风险与回滚/合并要求)与实质内容。
- `.github/PULL_REQUEST_TEMPLATE/promotion.md`:dev→main 晋级模板,内含"head 是同仓库 dev、@miracleqihe 批准、会话全解决、merge commit"要求。
- `pr-governance.yml` 从 **base sha**(受信基准)取校验器,不 checkout PR head —— 模式正确,已在 S1 审计中固化为不变量。

## 9. 配套数据仓(私有,对照)

- 配套的数据流水线仓为**私有仓**,其仓库名、协作者名单与具体配置不在本公开文档中披露。
- 与本工程包相关的事实只有一条,且经管理员身份 API 实证:该私有仓在当前套餐下,branch protection 与 rulesets 均不可用(403,套餐能力限制)。
- 其保护迁移与网站仓解耦,处理路径见 `RULESET-MIGRATION-PLAN.md` §5(已通用化表述)。

## 10. 生产入口风险摘要(按可达性排序)

1. **R1(当前状态)**:deploy-pages 工作流为文件级 `push:[main]` + 平台级 `disabled_manually`。任何具备 admin 的账号(仅 Owner)在 UI 一键 re-enable,push 即发布 —— 无审核介入。S0 补丁消除文件级触发器,re-enable 后也不会自动发布。
2. **R2**:9 名 write 协作者。若 main 的传统保护(详情 UNVERIFIED)弱于预期(如无必需检查/无必需审核),write 协作者经 PR 合并或直接 push 触达 main。S1 的 Governance 检查 + REQUIRED-CHECKS-MATRIX 的必需检查收紧封堵。
3. **R3**:workflow_dispatch 也是发布动作:需要 `actions:write`(write 协作者即有)。dispatch-only 后发布仍可能由 write 协作者发起 —— 必须配合 github-pages 环境的分支策略(已存在,仅 main)与 runbook 中的"dispatch 前置条件"约束;彻底收紧需在 environment 上加 required reviewers(Owner 操作)。
4. **R4**:配套数据仓(私有)无服务端可强制的分支保护(当前套餐能力缺失),CI 触发面偏宽。数据仓不直接触达网站生产,但作为内容上游需按迁移方案处理。
