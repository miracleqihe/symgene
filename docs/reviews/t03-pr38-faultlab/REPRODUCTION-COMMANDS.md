# T02 故障注入实验室 — 复现命令

全部实验只使用虚构内容与 127.0.0.1 回环地址。所有命令都在本机验证过(2026-10-24)。

## 环境前提

| 组件 | 版本 | 来源 |
| --- | --- | --- |
| Node | v22.23.4(`/opt/homebrew/opt/node@22/bin/node`,由 `brew install node@22` 提供;仓库 `.nvmrc` 锚定 22.23.3) | Homebrew |
| Vite | 8.1.6(锁文件未变) | worktree `node_modules` |
| Playwright | 1.62.1(锁文件未变),Chromium 1248 | worktree `node_modules` + `~/Library/Caches/ms-playwright` |
| React | 19.2.8 | worktree `node_modules` |

代码检出(不改工作树,只读运行):

```bash
cd <redacted-home>/Projects/symgene-workspace/symgene
git worktree add <redacted-home>/Projects/symgene-workspace/.worktrees/t03-t02-concurrency 9dfc403f89cfe539eb7584c87eddcbda6efe0a89 --detach   # 新版(PR #38 最终)
git worktree add <redacted-home>/Projects/symgene-workspace/.worktrees/t02-faultlab-old 6a3eea2f679fa8979c66edcba2724675ee74aa93 --detach    # 旧版(merge-base)
# 新版树内: npm ci(锁文件与 6a3eea2 完全一致;旧版树用 APFS 克隆 cp -Rc 复用,避免旧根缓存污染 PR 树)
```

producer(真实私有签名 fixture,仅用于 fixtureMode=producer 与签名浏览器演练):

```text
<redacted-home>/Projects/symgene-workspace/.t02-worktrees/<private-producer-checkout>   # 分支 codex/t02-post-merge-fixes,含 src/release-test-fixture.mjs
```

## 工作包 A — 系统性并发实验

```bash
cd <redacted-home>/Projects/symgene-workspace/t02-faultlab
N22=/opt/homebrew/opt/node@22/bin/node

# 全部 14 组(默认每组 3 轮;A11/A14 用 5 轮复测过)
$N22 harness/wpA-concurrency.mjs

# 单组复现(示例)
$N22 harness/wpA-concurrency.mjs A6-quad-separate-processes
T02_LAB_ROUNDS=5 $N22 harness/wpA-concurrency.mjs A11-close-during-traffic
```

R1 对账材料:`A11-RECONCILIATION.md` + `evidence/A11-ATTEMPTS.json`(全部 11 次尝试)、`TEMP-DIR-CLEANUP-PROOF.md` + `evidence/TEMP-DIR-LEDGER.json`(20 个临时目录)。

实验覆盖:冷/热缓存、1/2/4 消费者、同型/混合并发、连续/同时启动、启动中途 SIGTERM、
初始化失败后重启、流量中关闭、HTTP 服务先于 React 挂载、导航中断、leader 死亡后孤儿回收。

## 工作包 B — 故障注入

```bash
cd <redacted-home>/Projects/symgene-workspace/t02-faultlab
$N22 harness/wpB-faults.mjs                       # 全部 10 类注入
$N22 harness/wpB-faults.mjs B8-shutdown-timeout   # 单项复现
```

注入清单:B1 延迟 writer;B2a close 后才释放的 writer;B2b 逃逸 drain 的契约外 writer(观测残留);
B3 504-后-挂载;B4 PASS 报告后 SIGTERM;B5 PASS 后非零退出/未捕获异常;B6 报告缺失/重复/身份错;
B7 清理函数 reject(gateway / fixture);B8 15s 关闭期限;B9 缓存删除失败(chmod 555;R1 更正:覆盖 drain 阻碍路径);
B10 运行中 SIGTERM。R1 补测(B9R1/B9R2a/B9R2b,需 macOS chflags):

```bash
$N22 harness/wpB-b9r1.mjs                                   # 三条删除失败路径:EACCES 立即失败 / 瞬时重试救回 / EPERM 重试耗尽
$N22 harness/wpB-b9r1.mjs B9R2a-transient-deletion-failure-recovered
```

## 工作包 C — 新旧差分

```bash
cd <redacted-home>/Projects/symgene-workspace/t02-faultlab
$N22 harness/wpC-differential.mjs            # 全部阶段(子进程隔离新旧两套模块)
$N22 harness/wpC-differential.mjs c1-old     # 仅旧版共享根缓存 504 复现尝试
$N22 harness/wpC-differential.mjs c3-new-shared
$N22 harness/wpC-differential.mjs c5a-old && $N22 harness/wpC-differential.mjs c5a-new
$N22 harness/wpC-differential.mjs c5b-drill  # 新版签名浏览器全量演练(撤稿/回滚/恢复)
```

## 最终回归(有界)

```bash
<redacted-home>/Projects/symgene-workspace/t02-faultlab/harness/final-regression.sh
# 依次执行并记录退出码:
#   node --test tests/content-concurrency.test.mjs
#   node --test tests/browser/content-concurrency.test.mjs
#   node scripts/t02/consumer-concurrency.mjs --producer-root <producer> --evidence-dir <evidence>/matrix-ci --profile ci
```

## 资源约束

- 同时 Chromium 实例上限 4(A6/A7 恰为 4;其余 ≤2;B/C 分时运行)。
- 每轮前后 OS 审计(`pgrep ms-playwright` + `$TMPDIR/symgene-t02-*` 目录 diff)写入 `evidence/*-r*.json` 的 `before`/`after` 字段。
- 所有实验室自建资源(显式缓存目录、临时 producer、synthetic worker)在记录证据后由 harness 删除;其余进程一律不触碰。
- 若实验轮 60s 未完成,强杀自己启动的进程组后判定 THREW。
