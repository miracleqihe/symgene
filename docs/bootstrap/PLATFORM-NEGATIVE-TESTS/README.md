# PLATFORM-NEGATIVE-TESTS — 真实平台负向测试包

## 目的

把"保护规则真的会被 GitHub 拒绝吗"变成可执行、可重复的证据,而不是文档断言。**本轮没有创建测试仓、没有对生产仓执行任何写操作**,因此所有需要真实平台裁决的用例状态为 `PENDING`;脚本与前置条件已就绪,未来在独立测试仓执行。

## 状态标记

| 标记 | 含义 |
|------|------|
| `PENDING` | 需要真实 GitHub 平台裁决,本轮未执行(禁止创建测试仓) |
| `LIVE-TEST-REPO` | 脚本已就绪,只能对 `*-sec-lab` 命名的专用测试仓执行(`LIVE=1`) |
| `SIMULATED-VERIFIED` | 脚本的参数/流程/守卫逻辑已在本地用模拟输入验证 |
| `IN-REPO-ENFORCED` | 同一威胁已有仓内强制层(S1 Governance 检查)拦截,平台测试是二道防线 |

## 裁决语义(2026-10-24 R1 修订)

| 裁决 | 判定条件 |
|------|----------|
| `PASS` | 命令失败**且**错误信息匹配该场景的保护签名(先于杂项分类检查 —— 因此以 HTTP 403 表面的平台规则(如自批准拒绝)仍正确计为 PASS) |
| `FAIL` | 命令成功,而保护本应拒绝 —— 保护缺失或配置错误,须立即处置 |
| `BLOCKED` | 不可定论,永不算通过:401 凭据、403 权限不足(无保护签名)、404、网络错误、非法输入、多账号场景缺指定身份(lib.sh 退出码 70/71/72) |

旧版 `expect_rejection`(只看退出码)已移除:它会把权限不足、网络错误、错误账号、错误输入都冒充成"保护通过"。多账号场景(NEG-02/03/04/11)缺少 GH_A/GH_B 时直接 BLOCKED,拒绝以单身份代跑;NEG-08 额外校验执行身份非 admin(admin 旁路会伪造结果)。NEG-09 的裁决目标改为实际 Workflow Run 结论 + 失败 Job + 该 SHA 的 Deployment 记录 —— dispatch 被接受(204)只代表排队,不构成通过。

## 安全守卫(硬编码,不可配置绕过)

`scripts/lib.sh` 的 `require_test_repo`:

1. `LIVE=1` 时必须设置 `TEST_REPO`,且其名必须匹配 `*-sec-lab`;
2. 名单内拒绝仓:`miracleqihe/symgene` 为硬编码;其他生产仓(如配套数据仓)经 `PROD_REPOS` 环境变量(空格分隔)登记后同样拒绝 —— 生产仓名不必写进本公开文件;
3. `LIVE` 未设置时只打印执行计划与预期平台响应(模拟模式),不发出任何写请求。

## 测试仓前置条件(未来建仓时满足)

1. 测试仓(如 `y4ho0/symgene-sec-lab`):public,内容为网站仓的精简副本(至少 `.github/workflows/ci.yml`、`deploy-pages.yml`、`pr-governance.yml` 与同名 check);
2. 应用与生产目标一致的 rulesets(用 `RULESET-MIGRATION-PLAN.md` §3 的 JSON 经 `scripts/ruleset-apply.sh` 注入);
3. 至少 3 个账号:A(author,write)、B(reviewer,write)、C(可选,dismiss/管理员语义用);A、B 各自的 `gh` 登录或 PAT 经环境变量 `GH_A` / `GH_B` 传入(`gh auth switch --user` 或 `GH_TOKEN`);
4. 测试数据全部使用占位内容,禁止携带 T02 或医学数据。

## 用例索引

| ID | 威胁 | 关键预期(平台侧行为) | 状态 |
|----|------|------------------------|------|
| NEG-01 | 未审核合并 | 合并请求被 GraphQL 拒绝,MERGE_STATE_STATUS=BLOCKED | PENDING / LIVE-TEST-REPO |
| NEG-02 | 作者自我批准 | `POST /pulls/{n}/reviews event=APPROVE` → 403 "Can not approve your own pull request" | PENDING / LIVE-TEST-REPO |
| NEG-03 | 最新推送者自我批准 | require_last_push_approval=on 时,last-pusher 的批准不满足要求,合并仍 BLOCKED | PENDING / LIVE-TEST-REPO |
| NEG-04 | 旧 SHA 审核残留 | dismiss_stale_reviews_on_push=on 时,push 后旧批准自动 dismissed;旧 SHA 的成功 check 不满足必需检查(合并 BLOCKED) | PENDING / LIVE-TEST-REPO |
| NEG-05 | CI skipped / neutral 绕过 | Job 条件跳过**会**产生 skipped check-run(平台对 skipped 是否满足必需检查 → 待实测);Workflow 过滤跳过无 check-run → 必需名缺席即 BLOCKED;neutral ≠ success | PENDING / LIVE-TEST-REPO |
| NEG-06 | 同名 check 冒充 | 同仓新增同名"Branch policy"假 job 可满足同名必需检查(规则集层面的已知限制)→ 以 ruleset integration_id 绑定 + S1 `CHECK_NAME_COLLISION` 审计拦截;fork 来源的同名 check 不被采纳(预期) | PENDING / **IN-REPO-ENFORCED** |
| NEG-07 | 非 dev 晋级 | feature→main 的 PR 上 `Branch policy` 失败,合并 BLOCKED | PENDING / LIVE-TEST-REPO + S1 BRANCH_POLICY_* 审计 |
| NEG-08 | 直接 push / force push | push main → remote rejected;force push → 被 non_fast_forward 规则拒绝 | PENDING / LIVE-TEST-REPO |
| NEG-09 | 错误 Pages environment | 以实际结果裁决:run 必须以 failure 结束 + 失败 job 可见 + 该 SHA 无 Deployment;dispatch 204(排队)不构成通过 | PENDING / LIVE-TEST-REPO(仅测试仓!生产仓被守卫拒绝) |
| NEG-10 | 错误 run / artifact / SHA | 跨 run 下载 artifact(run-id:)在发布链路被 S1 `CROSS_RUN_ARTIFACT` 审计拒绝;平台侧行为另测 | PENDING / **IN-REPO-ENFORCED** |
| NEG-11 | 撤销审核后旧检查残留 | 审核被 dismiss 后,即便旧 head 的 checks 全绿,合并仍 BLOCKED(latest-commit 语义) | PENDING / LIVE-TEST-REPO |

每个用例的精确步骤、命令与预期响应见 `scenarios/NEG-*.md`;可执行脚本为 `scripts/neg-XX-*.sh`。

## 本轮已完成的模拟验证

- 全部 12 个脚本在 `LIVE` 未设置下逐一运行通过(仅打印计划,零网络写请求);
- `require_test_repo` 守卫对生产仓名单、非 sec-lab 仓、缺 TEST_REPO 三种非法输入均正确拒绝(记录见 `../verification/VERIFICATION-LOG.md`);
- S1 审计对 NEG-06 / NEG-07 / NEG-10 的仓内拦截已在 fixture 级验证(CHECK_NAME_COLLISION、BRANCH_POLICY_*、CROSS_RUN_ARTIFACT)。
