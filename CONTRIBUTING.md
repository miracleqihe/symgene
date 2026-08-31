# 贡献指南

感谢你为 Sym Gen（心鉴）贡献代码、知识内容、测试或文档。本指南用于让每一项变更都经过可追踪的讨论、自动验证和人工审核，并确保公开站点只从稳定的生产分支发布。

## 分支管理模型

本仓库采用“短生命周期功能分支 + `dev` 集成分支 + `main` 生产分支”的两级门禁：

```text
issue / discussion
       ↓
feat/*、fix/*、docs/*、refactor/*、test/*、chore/*
       ↓ Pull Request + CI + review
      dev
       ↓ 仅限 dev → main 的晋级 Pull Request + CI + @miracleqihe 审核
      main
       ↓
GitHub Pages
```

| 分支 | 定位 | 允许的变更入口 | 合并方式 |
| --- | --- | --- | --- |
| `main` | 随时可发布的生产分支，也是 GitHub Pages 的唯一来源 | 只接受仓库内 `dev → main` 的晋级 Pull Request | Merge commit |
| `dev` | 下一次发布的集成分支 | 接受功能、修复、数据、测试和文档 Pull Request | Squash and merge |
| 主题分支 | 一项独立变更的短生命周期分支 | 从最新 `dev` 创建，完成后向 `dev` 提交 Pull Request | 合并后删除 |

禁止直接向 `main` 或 `dev` 推送，禁止强制推送和改写共享历史。代码、数据和文档都先进入 `dev`；不要绕过 `dev` 向 `main` 提交普通 Pull Request。

### 为什么采用这个模型

- `dev` 提供持续集成区，使多个贡献可以一起验证，又不立即影响公开站点；
- `main` 只承载经过晋级审核的发布状态，便于回滚、审计和定位线上版本；
- 主题分支保持一项 PR 一个目的，降低评审和冲突成本；
- `dev → main` 使用 merge commit，以保留晋级边界和共同祖先；普通 PR 进入 `dev` 时使用 squash，使集成历史保持清晰。

`main` 合并晋级 PR 后，应立即把 `main` 同步回 `dev`，使两个分支在发布点重新对齐。除仓库所有者明确宣布的紧急修复外，不允许在 `main` 上产生 `dev` 不包含的独立提交。

## 开始贡献前

- 搜索现有 Issue 和 Pull Request，避免重复工作；
- 大型功能、架构变化、搜索规则变化或数据模型变化应先开 Issue 讨论；
- 医学结论、适应证、禁忌、风险级别或危机提示变化必须先说明依据和审核范围；
- 一项分支只解决一个明确问题，不混入无关重构、格式化或内容改写。

## 环境与安装

使用 Node.js 22 和仓库内的 `package-lock.json`：

```bash
npm ci
npm run dev
```

不要删除锁文件，也不要把顶层依赖改为 `latest` 或 `*`。

## 创建工作分支

Fork 仓库后，将官方仓库配置为 `upstream`：

```bash
git clone https://github.com/<your-name>/symgene.git
cd symgene
git remote add upstream https://github.com/miracleqihe/symgene.git
git fetch upstream
git switch dev
git pull --ff-only upstream dev
git switch -c feat/short-description
```

分支名称使用小写英文、数字和连字符：

- `feat/<name>`：新功能；
- `fix/<name>`：缺陷修复；
- `docs/<name>`：文档；
- `refactor/<name>`：不改变外部行为的重构；
- `test/<name>`：测试；
- `chore/<name>`：依赖、CI 或维护任务；
- `codex/<name>`：由 Codex 协助完成且范围明确的变更。

开始工作和提交 PR 前都应同步最新 `dev`。PR 已进入审核后，推荐合并 `upstream/dev` 来解决漂移，避免强制推送导致已完成的审核失效：

```bash
git fetch upstream
git merge upstream/dev
```

## 提交规范

提交应小而完整，标题使用清晰的祈使式描述。推荐 Conventional Commits 前缀：

```text
feat: add frontier review filters
fix: preserve local backup after migration failure
docs: explain dev branch contribution flow
test: cover critical safety result suppression
chore: update CI verification workflow
```

- 不提交构建产物、调试日志、临时文件或编辑器配置；
- 不使用 `git add .` 代替范围确认；提交前检查 `git status` 和 `git diff --cached`；
- 不在已经开始评审的分支上强制推送；
- 合并后删除主题分支。

## 验证命令

提交前运行完整验证：

```bash
npm ci
npm run verify
git diff --check
```

需要定位失败时，可以分别运行：

```bash
npm run check:data
npm run check:links
npm run test:unit
npm run test:ui
npm test
npm run build
npm run check:build
```

`test:unit` 覆盖搜索、数据、链接和本地存储等纯逻辑；`test:ui` 覆盖安全提示、生产只读入口、dialog 键盘与焦点、移动详情焦点和 axe 基线。`check:links:remote` 只用于人工或定时检查外部可达性，不属于普通 Pull Request 的阻断门禁。视觉布局、实际滚动、动画观感和多浏览器行为仍需在真实浏览器中人工回归。

## 数据与医学内容边界

- 不在工程重构中顺便改写疾病、药物、案例、风险词或搜索权重；
- 医学结论、适应证、禁忌、风险级别和来源变化必须在 PR 中逐项说明并接受内容审核；
- 新增或修改数据后必须运行数据校验和搜索回归测试；
- 不删除知识条目来规避验证错误；
- 原始书籍、PDF、OCR 文本和提取中间文件不得提交；
- 搜索结果是科普线索，不得改写成诊断、处方或个体化医疗建议。

## 本地数据与隐私

- 存储格式变化必须提供迁移、迁移前备份和失败不覆盖测试；
- 导入内容必须通过正式验证器，不执行文件内容或自动访问其中链接；
- 测试只使用虚构资料和 `example` 路径或域名；
- 不提交真实姓名、邮箱、电话、地址、患者资料、凭据、Token、Cookie 或本地私人路径；
- 不要把 `localStorage` 描述为加密或安全存储。

## Pull Request 到 `dev`

普通贡献的 base branch 必须是 `dev`。建议尽早以 Draft PR 暴露方向，完成后再标记 Ready for review。

PR 必须包含：

- 变更目的、用户可见行为和不在本次范围内的事项；
- 关联 Issue，例如 `Closes #123` 或 `Relates to #123`；
- 测试命令及结果；
- UI 变化的截图或录屏，以及桌面端和移动端检查结果；
- 数据结构、医学内容、风险词、隐私或本地存储是否受到影响；
- 已知限制、兼容性风险和回滚方式。

进入 `dev` 前必须满足：

1. `Verify` 自动检查通过；
2. 分支已同步最新 `dev`；
3. 至少一名具有仓库写权限的评审者批准；
4. CODEOWNERS 审核要求满足；
5. 所有 review conversation 已解决；
6. 没有未解释的测试跳过、构建警告或范围外文件。

CI 通过只代表自动检查通过，不等于自动获得合并权限。评审者仍需检查功能行为、医学内容、安全边界、隐私和可维护性。

## 从 `dev` 晋级到 `main`

只有仓库维护者可以发起晋级 PR，并且必须同时满足：

- base 是 `main`；
- head 是同一仓库的 `dev`，不是 fork 中同名分支；
- PR 不再加入新的代码或临时修复；发现问题应回到主题分支修复并先合并进 `dev`；
- `Branch policy` 和 `Verify` 检查通过；
- `@miracleqihe` 完成人工审核并明确批准；
- 所有 review conversation 已解决；
- PR 使用 merge commit 合并，标题必须为 `release: promote dev to main (YYYY-MM-DD)`。

创建晋级 PR 时使用专用模板：

```text
https://github.com/miracleqihe/symgene/compare/main...dev?expand=1&template=promotion.md
```

`Promotion PR policy` 会确定性检查来源分支、标题、必需章节、模板占位符和未确认复选框，并由 `github-actions[bot]` 在同一条评论中提醒 PR 创建者修正。GitHub Copilot code review 可以补充代码层建议，但它只提交非阻断的 review comment，不能替代状态检查或 `@miracleqihe` 的人工批准。

合并到 `main` 后，GitHub Pages 工作流会再次执行完整验证，只有验证成功才部署。部署完成后将 `main` 同步回 `dev`，并按需创建版本标签和发布说明。

### 紧急修复

紧急修复不构成贡献者绕过 `dev` 的权限。若公开站点必须立即修复，只有仓库所有者可以宣布例外、从 `main` 创建 `hotfix/*`、执行完整 CI 和审核，并在合并后立即把相同修复同步回 `dev`。例外原因和回同步结果必须记录在 PR 中。

## 仓库管理员门禁

文档不能替代 GitHub Rulesets。仓库管理员应分别保护 `dev` 和 `main`：

### 首次启用顺序

当前仓库从单 `main` 流程迁移时，按以下顺序启用，避免尚未产生的 CI check 把分支锁死：

1. 先从当前生产 `main` 创建 `dev`，确保两个长期分支拥有相同起点；
2. 从 `dev` 创建 `codex/branch-governance`，将本规范、CI、CODEOWNERS 和 PR 模板先通过 PR 合并到 `dev`；
3. 由 `@miracleqihe` 审核并完成第一次 `dev → main` 晋级；如果 GitHub 尚未识别新 workflow 的 check，第一次晋级以本地 `npm run verify` 结果作为迁移期证据；
4. 将第一次晋级后的 `main` 同步回 `dev`，在 `dev` 上手动运行一次 `CI`；
5. 创建测试 PR，确认 `Verify`、`Branch policy` 和 `Promotion PR policy` 已出现在 Ruleset 的 check 选择列表；
6. 先启用 `dev` Ruleset，再启用 `main` Ruleset；此后停止所有直接推送。

仓库默认分支保持 `main`，用于展示稳定版本；贡献者必须在创建 PR 时主动把 base 改为 `dev`。

### `dev`

- Require a pull request before merging；
- Require at least 1 approval；
- Dismiss stale approvals when new commits are pushed；
- Require review from Code Owners；
- Require status check：`Verify`；
- Require branches to be up to date before merging；
- Require conversation resolution before merging；
- Automatically request Copilot code review，并按维护需要启用 Review new pushes；
- Block force pushes and deletions；
- 不允许普通贡献者 bypass。

### `main`

- Require a pull request before merging；
- Require at least 1 approval；
- Require review from Code Owners，由 `@miracleqihe` 审核；
- Require status checks：`Branch policy`、`Verify`、`Promotion PR policy`；
- Require branches to be up to date before merging；
- Require conversation resolution before merging；
- Automatically request Copilot code review，并按维护需要启用 Review new pushes；
- Block force pushes and deletions；
- 不允许普通贡献者 bypass。

`CODEOWNERS` 会自动请求审核，但只有启用 “Require review from Code Owners” 后才会成为合并门禁。Copilot code review 只能留下 `Comment`，不会给出 `Approve` 或 `Request changes`，因此也不计入必需审批。

## 设计参考

- [GitHub Rulesets 可用规则](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)：PR、审批、状态检查、同步要求和禁止强推；
- [GitHub CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)：自动请求所有者审核并与分支保护结合；
- [GitHub Copilot 自动代码审核](https://docs.github.com/en/copilot/how-tos/copilot-on-github/set-up-copilot/configure-automatic-review)：通过个人设置或仓库 Ruleset 自动请求 Copilot review；
- [GitHub Pull request merge 策略](https://docs.github.com/en/pull-requests/reference/pull-request-merges)：squash、rebase 和 merge commit 的历史差异。

## 报告问题与功能建议

Bug 报告请包含复现步骤、预期行为、实际行为、浏览器与系统版本，以及必要的截图或错误信息。功能建议请说明使用场景、受益对象、替代方案和潜在的医学或隐私边界；重大变化应先讨论再实现。
