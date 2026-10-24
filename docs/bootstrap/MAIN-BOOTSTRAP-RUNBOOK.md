# MAIN-BOOTSTRAP-RUNBOOK — symgene main 安全 bootstrap 实施手册

- 版本:2026-10-24(R1 整改修订),基于基准:网站 main `22eb347`、dev `6a3eea2`;配套数据仓为私有仓(坐标不在公开文档披露)。R1 内容:适配 #37/#38/#39 的真实工作流差异;撤销过期的 Publication approval 建议;明确 legacy 发布资格与 T02 授权分离。
- 角色定义:
  - **Owner** = `miracleqihe`(网站仓唯一 admin;配套数据仓(私有)的管理员为本包执行者)。以下所有"Owner 步骤"都需要 admin 权限,普通维护者(y4ho0 等 9 个 write 账号)无法执行。
  - **维护者** = write 权限账号,可执行阶段 0/5 的只读与代码 PR 步骤。
- 执行纪律:
  1. 每一步先核对"操作前状态",不匹配就停;
  2. 所有 Owner 的 API 写操作必须记录到变更日志(时间 + 命令 + 响应码);
  3. 全程**不需要也禁止**直接 dispatch deploy-pages 或重启用该工作流 —— 唯一例外是 R-07 的受控发布演练,且需 Owner 显式决策;
  4. 若任何一步失败,先走该步的"失败恢复",不要跳步。

---

## 阶段 0 — 前置状态核对(维护者可执行,只读)

**S0-1 核对基准 SHA**
- 位置/命令:`git -C <symgene克隆> fetch origin --prune && git rev-parse origin/main origin/dev`
- 所需权限:仓库读。
- 操作前状态:基准 main=`22eb347e...`,dev=`6a3eea2f...`。
- 正常预期:输出与基准一致;不一致 → 有人在窗口期推进了 main,暂停并重新评估(补丁仍应能 apply --check 通过才继续)。
- 操作后验证:`git log -1 --format=%H origin/main`。
- 失败恢复:网络问题重试;若 main 已变更,跑 `git apply --check` 双补丁,任一失败则回到补丁重制流程。
- 独立 Review:否。触发部署:否。

**S0-2 确认生产仍处冻结**
- 位置/命令:`gh api repos/miracleqihe/symgene/actions/workflows --jq '.workflows[] | select(.path==".github/workflows/deploy-pages.yml") | .state'`(维护者可读)
- 操作前状态:`disabled_manually`(2026-10-24 实测)。
- 正常预期:输出 `disabled_manually`;若为 `active_manually`/`active` → 有人重启了工作流,立即按"应急冻结"(§R-00)处理。
- 操作后验证:同上。
- 失败恢复:见 §R-00。
- 独立 Review:否。触发部署:否。

**S0-3 读取当前部署基线**
- 命令:`gh api 'repos/miracleqihe/symgene/deployments?environment=github-pages&per_page=1'`
- 操作前状态:最近一次部署 = `22eb347edf30`(2026-09-15)。
- 正常预期:一致。操作后验证:同上。失败恢复:无(只读)。独立 Review:否。触发部署:否。

---


## 与 #37/#38/#39 的集成适配(2026-10-24 复核;执行阶段 1 前必读)

开放的平行工作(全部指向 dev,截至复核时未合并):

| PR | 内容 | 与本包的关系 | 处置规则 |
|----|------|--------------|----------|
| #35 | dev→main 晋级(开放中) | 若先合并,main 前移,S0/S1 需基于新 main 重制 | 新建分支重新 `git apply --check`;不 force push |
| #37 | T03 安全治理:重写 deploy-pages(保留 push 触发 + authorization 上下文校验)、重排 ci.yml(新增 identity/gate 等 job)、新增 publication-policy.yml | **与 S0 是两条冻结路线;禁止把旧 S0/S1 文件直接覆盖到 #37 的版本上** | 见下方「S0-on-#37 最小差量」;合并策略由 Owner 裁决 |
| #38 | T02 Vite 优化器隔离 + t02-verification 并发修正 | 与 S0/S1 改动文件不相交 | 无需动作,常规 rebase 纪律 |
| #39 | `Publication approval` 更名 `Publication integrity`;按 Owner 决定撤销额外内容审读发布阻断 | 必需检查名称假设变化 | 本包不再建议恢复旧门禁(REQUIRED-CHECKS-MATRIX §1.2 M3 修订) |

**S0-on-#37 最小差量(经 docs/bootstrap/compat/check-37-compat.mjs 对 #37 真实分支头验证)**:若 #37 先落 main,S0 的意图(禁止自动发布)必须以差量方式施加在 #37 版本之上:

1. 从 `on:` 移除 `push: branches: [main]`;
2. 把 authorization job 事件白名单 `['push', 'workflow_dispatch']` 收窄为 `['workflow_dispatch']`;
3. 其余一切(authorization 上下文校验、artifact digest 绑定、cancel-in-progress: false 等 #37 加固)全部保留。

验证:`node docs/bootstrap/compat/check-37-compat.mjs <#37 checkout>` → Phase A 应报 DEPLOY_TRIGGER_*(原样晋级被 Governance 拦截),Phase B 应零 S0/S1 违规(三者共存)。#37 的 Branch policy v2 已被 S1R 签名化审计接受。

**资格分离原则**:#37 的 `LEGACY_ENGINEERING_ELIGIBLE` 设计把 legacy 工程发布资格与 T02 正式采用授权分离。本包的一切门禁建议不得把 T02 审读重新叠加进 legacy 发布链;T02 采用授权走 T02 验证工作流与正式合同;两者只共享必需检查集,不互为前置。

## 阶段 1 — S0/S1 进入 main(需要 Owner 审核;不触发部署)

**S1-1 Owner 创建冻结+治理 PR**
- 位置/命令(Owner,本地):
  ```
  git checkout -b bootstrap/main-sec-22eb347 22eb347edf3056955d6437c7eb951b63c28f76e0
  git apply S0-FREEZE.patch && git commit -m "S0: freeze Pages auto-publish entry (base 22eb347)"
  git apply S1-TRUSTED-BOOTSTRAP.patch && git commit -m "S1: trusted governance bootstrap (base 22eb347)"
  node --test .github/tests/*.test.mjs   # 必须 63 pass / 0 fail(R2 后;补丁链与各时点计数见 verification/VERIFICATION-LOG.md)
  git push origin bootstrap/main-sec-22eb347
  gh pr create --repo miracleqihe/symgene --base main --head bootstrap/main-sec-22eb347 \
    --title "main security bootstrap: S0 freeze + S1 governance" \
    --body-file .github/PULL_REQUEST_TEMPLATE/promotion.md  # 按晋级模板填写五节
  ```
  (两个补丁文件内容见包内 `S0-FREEZE.patch` / `S1-TRUSTED-BOOTSTRAP.patch`,逐文件清单见 §清单。)
- 所需权限:push(建分支开 PR)+ Owner 审核。
- 操作前状态:main 无 `Governance` 检查;deploy-pages 带 push 触发器(文件级)。
- 正常预期:PR 出现 checks:`Branch policy`(通过,head 是同仓分支?**注意:该 PR head 不是 dev,Branch policy 会失败 —— 这是设计内的!** 处理方式见下)。
- **Branch policy 失败的预期处理**:S0/S1 属于治理紧急变更,不适用 dev→main 晋级。两个合规选项:
  - 选项 A(推荐):先走 S5-2 把 S0/S1 推进 **dev**(dev 的 PR 无 Branch policy 门槛),dev 绿后以晋级 PR 进 main —— 全程无例外。
  - 选项 B:直接对 main 开 PR 并由 Owner 在 PR 描述中记录"治理例外"理由 + 失败的 Branch policy 截图,合并后 48h 内在 dev 上同步同样的提交保持两分支一致。**仅在 dev 流程不可用时使用并留痕。**
- 操作后验证:PR checks 里出现 `Governance` 且为绿;`Verify` 绿;合并方式 = Create a merge commit。
- 失败恢复:任一 check 红 → 看 Governance 的具体 violation 码(它就是修复指南);`git apply` 冲突 → 确认 base 是否仍是 22eb347。
- 独立 Review:**是**(Owner 审核或第二 code owner)。触发部署:**否** —— 工作流 disabled_manually 且 S0 已移除 push 触发,合并后即使有人 re-enable 也不会自动发布。

**S1-2 合并后验证**
- 命令:`gh api repos/miracleqihe/symgene/commits/main --jq '.commit.message'`(顶部为 S0/S1 merge commit);`gh api repos/miracleqihe/symgene/actions/workflows --jq '.workflows[] | {path, state}'` —— deploy-pages 仍应 `disabled_manually`。
- 正常预期:一致。触发部署:否。

---

## 阶段 2 — main 最低保护 ruleset(Owner 专属,API/UI)

**S2-1 备份现状**
- 命令:`gh api repos/miracleqihe/symgene/branches/main/protection > backup-main-protection.json`(Owner admin token);dev 同理。
- 操作前状态:main/dev protected=true(legacy,详情此前 UNVERIFIED,Owner 现在可读)。
- 正常预期:HTTP 200 + JSON。若 404 "Branch not protected" → 说明此前根本无保护(记录为发现,不是错误)。
- 操作后验证:文件可解析、含 expected 字段。
- 失败恢复:无写入,可重试。
- 独立 Review:否。触发部署:否。

**S2-2 建 main-minimum ruleset**
- 位置:GitHub UI → Settings → Rules → Rulesets → New branch ruleset;或 `gh api -X POST repos/miracleqihe/symgene/rulesets --input main-minimum.json`(JSON 见 RULESET-MIGRATION-PLAN §3,先只含 deletion/non_fast_forward/required_status_checks=[Branch policy, Verify, Promotion PR policy],strict=false)。
- 所需权限:网站仓 admin(Owner)。
- 操作前状态:rulesets 列表为空(2026-10-24 实测)。
- 正常预期:201 Created;`gh api repos/miracleqihe/symgene/rulesets` 列出 1 条,enforcement=active。
- 操作后验证:开一个无害 PR(改 README 一个字,head 非 dev)→ 应被 Branch policy 红掉 → 关闭。这是规则的**正向**验证,不开任何例外。
- 失败恢复:`PATCH enforcement: disabled` → 排查 → 重新启用。422 字段错误 → 对照 API schema 修正 JSON(模板字段名可能随版本微调)。
- 独立 Review:**是**(第二人确认 check 名逐字符正确,防 D5 死锁)。触发部署:否。

**S2-3 评估并清理 legacy 双重保护(防 D6)**
- 操作:读取 backup-main-protection.json;若 legacy 已有等效必需检查 → 在 ruleset 稳定一周后删除 legacy 保护(`DELETE /branches/main/protection`),保持单一事实源。
- 失败恢复:用 backup JSON `PUT /branches/main/protection` 还原。
- 独立 Review:是。触发部署:否。

---

## 阶段 3 — 完整审核强度(Owner,继 S2 之后)

**S3-1** 同一 ruleset 追加 pull_request 参数:approve≥1、`dismiss_stale_reviews_on_push=true`、`required_review_thread_resolution=true`。(UI 逐项勾选;API 用 PATCH。)
- 操作后验证:用 NEG-01/04 的流程在测试仓先行验证再上生产;生产上观察下一个真实 PR 的合并门文案。
- 失败恢复:PATCH 降参数或临时 disabled。
- 独立 Review:是。触发部署:否。

**S3-2 解除死锁 D2 前置:CODEOWNERS 第二 Owner**
- 位置:PR 修改 `.github/CODEOWNERS`,把 `/.github/` 行改为 `/.github/ @miracleqihe @y4ho0`(`*` 行保持 `@miracleqihe`)。
- 顺序:**先**合此 PR(经 dev 或经 main 治理例外),**再**启用 `require_code_owner_review`。
- 失败恢复:临时关闭 require_code_owner_review。
- 独立 Review:是。触发部署:否。

**S3-3** 追加 `require_code_owner_review=true`、`require_last_push_approval=true`。
- 操作后验证:下一个真实 PR 需要出现两个批准位(Owner + code owner);last-push 语义用测试仓 NEG-03。
- 失败恢复:见 §4 D1/D2/D3。独立 Review:是。触发部署:否。

---

## 阶段 4 — dev 最低保护(Owner)

- S4-1 建 `dev-minimum` ruleset:deletion + non_fast_forward + pull_request(approve≥1 + thread resolution)+ required_status_checks=[`Verify`]。strict=false。
- 操作前状态:dev protected=true(legacy),`Verify` 在 dev 真实运行。
- 操作后验证:在 dev 开一个测试 PR 验证 `Verify` 为门禁;直接 push dev 的尝试被拒(以维护者身份试一次并记录)。
- 失败恢复:enforcement: disabled。
- 独立 Review:是。触发部署:否。

---

## 阶段 5 — dev 吸收 S0 触发器变更(维护者可做,Owner 审核)

**S5-1** 对比 dev 与 main 的 deploy-pages.yml;注意 dev 的版本可能是 #37 重写版或含 #39 步骤更名 —— **以 dev 当时的实际文件为基线**。
**S5-2** 在 dev 开 PR:按「S0-on-#37 最小差量」施加到 dev 当前的 deploy-pages.yml 上(只移除自动发布,不回退 #37/#39 的任何加固),Governance 检查必须绿;若 dev 带有 `['push', 'workflow_dispatch']` 事件白名单,同步收窄为 `['workflow_dispatch']`。
- 目的:消除未来 dev→main 晋级重新引入 push 触发器的可能(VERIFICATION-LOG 的 dev 审计证据)。
- 失败恢复:关闭 PR,不影响 main 冻结(main 侧 S0 已生效)。独立 Review:是(Owner)。触发部署:否。

---

## 阶段 6 — 后置强化(观察期 ≥2 周后,Owner)

- S6-1 strict 模式:`strict_required_status_checks_policy=true`(先 dev 后 main)。
- S6-2(**R1 修订**):不恢复旧 `Publication approval` 内容审读门禁 —— Owner 已在 #39 决定撤销该阻断,legacy 发布资格与 T02 授权分离。若 Owner 另行决定以 `Publication integrity` 为必需检查,属独立新决策,须先确认该 check 在 main 上真实运行(见 REQUIRED-CHECKS-MATRIX §3),与本包无关。
- S6-3 `Governance` 加入 dev 与 main 必需检查(若阶段 1 用选项 B,此时 main/dev 已一致)。
- 失败恢复:逐项 PATCH 回退。独立 Review:是。触发部署:否。

---

## 阶段 7 — 受控发布演练(可选,Owner 显式决策后)

- S7-1 在测试仓完成 PLATFORM-NEGATIVE-TESTS 全部 PENDING 用例(建 lab 仓,`ruleset-apply.sh` 注入规则,按 README 前置准备双账号)。
- S7-2 生产正向验收(不发布):Owner 在 Actions 页对 deploy-pages 做一次 **dry 评估** —— 仅核对 workflow_dispatch 存在、environment=github-pages、分支策略=main,不点击 Run。
- S7-3 真实发布解冻(未来某次内容晋级时):Owner 按序(a)确认所有必需检查绿;(b)Owner dispatch deploy-pages(ref=main);(c)部署后 `GET deployments` 核对新 SHA;(d)在变更日志记录发布理由。回滚 = 重新部署上一个已知好 SHA(22eb347 或其后继)。
- 触发部署:仅本阶段会。

---

## §R-00 应急冻结(任何时点可用)

1. 平台层:`gh api -X POST repos/miracleqihe/symgene/actions/workflows/deploy-pages.yml/disable`(Owner)→ 状态应变 `disabled_manually`。
2. 环境层:Settings → Environments → github-pages → 确认 branch policy 仅 main(不要删除该策略!)。
3. 回滚线:最后一次已知好部署 SHA = `22eb347`(见盘点 §5);需要回退内容时重新部署该 SHA。
4. 留痕:在变更日志记录触发应急的原因与恢复条件。

## §清单 — 补丁逐文件变更

**S0-FREEZE.patch(base 22eb347)**
- `.github/workflows/deploy-pages.yml`:+5/−2(移除 `push: branches:[main]`,保留 workflow_dispatch,附冻结注释)。不触碰其他任何文件。

**S1-TRUSTED-BOOTSTRAP.patch(base 22eb347,与 S0 文件不相交)**
- `.github/tests/lib/audit-governance.mjs`:+286(治理审计库,stdlib)
- `.github/tests/governance-library.test.mjs`:+241(17 个正/负 fixture 用例)
- `.github/tests/governance.test.mjs`:+49(仓库状态强制层)
- `.github/workflows/ci.yml`:+10(新增 `governance` job,check 名 `Governance`)
- 不引入任何 dev 医学数据、不触碰 T02 合同文件、不解除任何部署限制。
