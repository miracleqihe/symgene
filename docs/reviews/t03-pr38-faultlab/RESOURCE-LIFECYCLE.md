# T02 资源生命周期(RESOURCE-LIFECYCLE)

对象:PR #38 最终版(`9dfc403`)的每类运行时资源。每一行都有实验证据(`evidence/`),不只是代码阅读结论。

## 1. 资源清单与生命周期

| 资源 | 创建 | 生命周期终点 | 关闭失败时的行为 | 证据 |
| --- | --- | --- | --- | --- |
| Vite owned 优化缓存(`$TMPDIR/symgene-t02-vite-*`) | `createConsumerViteServer`,每个 live server 独占一个(即使同型两实例) | `app.close()`:停 HTTP → 关 watcher → drain optimizer(scan + 全部 discovered processing 批次,两轮)→ vite close → `rm` 重试 5 次 → 删除成功 | 15s 期限:`T02_CONSUMER_SHUTDOWN_TIMEOUT` + `cleanupIncomplete:true` + 缓存保留;创建期失败:立即删除(§B-工厂) | B1/B2a(先 join 后删)、B8(期限)、A4(四实例四目录) |
| 调用方显式缓存(cacheDir 参数) | 调用方 | 归调用方;close 不删除 | 不适用(文档:"Never share it across live servers") | A1/A2 warm 轮、C3 |
| Vite HTTP 监听端口(127.0.0.1,ephemeral/fixed) | server 启动(port 0 走公共 httpServer 原子占位) | close 第一步停新请求,关在 drain 之前 | 期限路径下仍确认端口关闭(B8:`endpointOpenAfterDeadline=false`) | A1–A14 全部 closedPorts;A10(冲突端口重启) |
| Chromium 实例(Playwright headless) | probe 内 `chromium.launch` | probe finally `browser.close()`;SIGTERM 触发 `interrupted` 异步关闭 | close 抛错计入 cleanupErrors → FAIL | B3/B10/A14 |
| Chromium 孤儿(worker leader 死亡) | — | leader SIGKILL → Playwright 管道 EOF → Chromium 400ms 内自退; supervisor 随后对整组 SIGKILL 兜底 | 组内存活者由 `killGroup('SIGKILL')` 回收(单测 orphan-pipe 覆盖继承 pipe/socket 的拒绝者) | A14(5/5)、tests/content-concurrency.test.mjs |
| supervisor worker 进程组(`fork --worker/--case-worker`,detached) | superviseWorker,executionId 绑定 | exitCode 0 + signal null + 单份有效报告;否则 `killGroup('SIGKILL')`,即使 leader 已退出 | 报告缺失/重复/身份错一律 FAIL;继承的 pipe 由父方绝对期限关闭 | B4/B5/B6、A9 |
| 签名 fixture 运行时目录(`$TMPDIR/symgene-t02-probe-*` / runtime-*) | probeConsumer(signed)或浏览器演练 | finally `fixture.close()` + `rmSync` | 失败计入 cleanupErrors → FAIL | B7b |
| 签名 gateway HTTP 服务 | probe/演练启动 | finally `gateway.close()` | reject → cleanupErrors → FAIL(B7a:主体已 PASS 仍判 FAIL) | B7a/B7b |
| checkpoint 服务(producer fixture 内) | fixture | `fixture.close()` 级联 | C5a:新版失败路径仍关闭(记录 listening:false);旧版泄漏 | C5a |
| 实验室自建资源(显式 warm 缓存、synthetic producer/worker、B2b 残留) | harness | 记录证据后由 harness 删除 | harness 自负 | 各 `*-r*.json` |

## 2. 关闭顺序(新版 `createConsumerViteServer` 的实证契约)

```
app.close()  ─┬─ 停止接受新 HTTP 请求(watcher 同步关闭)
              ├─ drain optimizer:等待 scanProcessing + 所有 discovered processing 批次(循环直到无新增)
              ├─ (已接受的请求可能再触发一批)再次 drain
              ├─ vite close
              ├─ removeOwnedCache(线性重试 5 次 × 10ms;耗尽即失败)
              └─ 重复/并发调用共享同一次关闭(promise 备忘)
超时(15s)  → 拒绝 T02_CONSUMER_SHUTDOWN_TIMEOUT,启动"不等待"的剩余 vite 关闭,
              保留未 join writer 的缓存并标 cleanupIncomplete —— 绝不把不完整清理说成干净。
```

- B1:writer 被扣 300ms,close 在 +180ms 仍 pending,writer 完成后缓存才删 → "join 而非取消"。
- B2a:close 开始 150ms 后才释放 writer,迟到的写仍落在删除之前。
- B8:writer 永久阻塞 → 15.4s 拒绝、端口已关、缓存保留。
- B9:缓存目录只读 → drain 写不进 → 同一有界拒绝路径,缓存保留。
- A11:真实流量中关闭,7/8 轮 ~6.5s 完成;1/8 轮走满期限且行为符合上述契约(端口关、缓存留、错误可见)。

## 3. 探针级清理核验(probeConsumer finally)

每个 probeConsumer 结束时核验并写入结果:`serverClosed`、`browserClosed`、`ownedCacheRemoved`(owned 必须为 true,explicit 为 null)、`closedPorts`(每个自建端口必须拒绝连接)、`cleanupErrors`。任一不满足 → status FAIL(`isProbeSuccess` 同时要求六个 timeline 阶段齐全、零外部请求、零 504/HTTP/requestfailed/pageerror/console error)。**清理不完整永远不会被 PASS 报告覆盖**——B7a/B7b 在探针主体完全成功后注入清理失败,均判 FAIL。

## 4. 进程组监管(superviseWorker)

- 期限树:timeout(55s 默认)SIGTERM → +grace SIGKILL → 绝对期限(再 +1s)销毁管道/断开 IPC/unref 并以已观测的退出状态结算——leader 先死、后代继承 pipe/socket 时父方仍掌控(A9、单测 orphan-pipe)。
- 退出后审查:exitCode≠0 或有 signal 或 timedOut → 整组 SIGKILL;报告不是恰好一份/身份不符 → FAIL + SIGKILL。
- B4/B5/B6 的 21 轮负面注入全部 FAIL;"PASS 报告先行"不改变结局。

## 5. 差分:旧版 vs 新版

- **C5a(同一 Playwright 导入失败)**:旧版零清理、泄漏 3 个监听端口(gateway/checkpoint/vite);新版 0 泄漏,gateway/checkpoint 记录 `listening:false` 后关闭。这是 PR "close failed browser runs" 的直接证明。
- **C1/C2**:旧版共享根缓存在 3 轮中 2 轮复现原始 504(React deps 全套 + ERR_ABORTED + 挂载超时);新版隔离缓存 21 轮 0×504。旧版根缓存(旧树 `node_modules/.vite`)按旧设计持久存在;新版 owned 缓存即用即删。

## 6. 实验室的自我约束与审计方法

- 每轮前后 `osAudit`:`pgrep -f ms-playwright`(PID + comm)、loadavg、freemem、`$TMPDIR/symgene-t02-*` 目录快照;差值写入 `leakCheck`。33 组 / 103 轮 **零孤儿 Chromium**(`RELIABILITY-MATRIX.json` 的 `resourceLifecycle.orphanChromiumViolations` 为空)。
- Chromium 并发上限 4(A6/A7 恰为 4);B/C 分时执行。
- 每轮 60s 硬期限,超期杀自己启动的进程组并记 THREW;从未触碰非本任务的进程。一次实验室自身缺陷导致的 B8 挂起,其残留进程(2 个,均本实验所属)被点杀并记录。
- 实验室显式创建的临时资源(warm 缓存目录、synthetic producer、worker 目录、B2b 残留)在记录后由 harness 删除;`$TMPDIR` 中既有的 92 个历史 `symgene-t02-*` 目录属于更早会话,本实验不代删。

## 7. 已知残留类别:进程被杀时的临时目录(如实记录)

监督契约保证的是**无孤儿进程、无存活端口**(A9/A14/B10 证实);它不承诺进程死亡后的临时目录。
被 SIGTERM/SIGKILL 的 worker 无法执行自己的 finally,其已创建的 `symgene-t02-vite-*`(vite 缓存)与
`symgene-t02-probe-*`(signed runtime)目录会留下。本实验室测得:A9(中途击杀)+ A14(SIGKILL)+
B8 一次挂起强杀,共留下 20 个临时目录(3 个 probe-runtime、17 个 vite-cache,均已记录于对应轮次
osAudit 的 `newTempCaches`,并在实验结束后由实验室清理)。这不是 #38 的缺陷——任何进程内清理方案
都无法清理已死进程;若需更强保证,应由 supervisor 收集并上报子进程的临时路径(属于未来加固,未实施)。
