# T02 故障注入实验室 — 故障目录(FAILURE-CATALOG)

- 新版被测代码:PR #38 最终版 `9dfc403f89cfe539eb7584c87eddcbda6efe0a89`(worktree `.worktrees/t03-t02-concurrency`)
- 旧版基线:merge-base `6a3eea2`(worktree `.worktrees/t02-faultlab-old`)
- 全部判定标准:每个实验先声明期望(`expect`),轮次判定必须与期望一致才算 CONFIRMED;"失败被检测到"与"失败被掩盖"严格区分。
- 原始证据:`t02-faultlab/evidence/<实验ID>-r<N>.json`(每轮含时间线、PID、退出码/signal、缓存目录、端口、HTTP/page/console 错误、清理结果、前后 OS 审计)。

## 一、注入矩阵结论(工作包 B,19 组 / 3 轮各)

| ID | 注入 | 期望 | 结果 | 语义 |
| --- | --- | --- | --- | --- |
| B1 | 延迟 300ms 的 Vite optimizer writer | JOINED | 3/3 JOINED | `close()` 等待 writer 完成后才删缓存;close 在 writer 阻塞期间保持 pending(120ms 观测点证实) |
| B2a | writer 在 close 开始后才被释放 | JOINED | 3/3 JOINED | 迟到的写落在 drain 内、缓存删除之前;若删除先于写,目录会重建而被判 DIRTY |
| B2b | 契约外 writer:resolve 后用 detached setTimeout 落盘 | RESIDUE-RECORDED(观测) | 3/3 记录到残留 | 见「边界发现」F-3 |
| B3 | 真实 Chromium 先 504、React 随后挂载并 snapshot 成功 | FAIL-DETECTED | 3/3 FAIL-DETECTED | `http504Count=1`、react-mount+snapshot 事件俱在、status=FAIL、清理完整——**504 不被后续成功状态覆盖** |
| B4 | worker 发出 PASS 报告后被 SIGTERM | FAIL-DETECTED | 3/3 | exitCode null/signal SIGTERM → `isWorkerSuccess=false` |
| B5a | PASS 报告后 exitCode 7 | FAIL-DETECTED | 3/3 | 退出码非 0 → FAIL |
| B5b | PASS 报告后未捕获异常 | FAIL-DETECTED | 3/3 | 崩溃退出 → FAIL |
| B6a–g | 报告缺失 / 重复(第二份 FAIL)/ kind 错 / executionId 错 / pid 错 / mode 错 / result 不完整 | FAIL-DETECTED | 各 3/3 | 单一完整报告契约:任何重复都使 `reports===1` 失效,后发报告不能覆盖判定 |
| B7a | gateway.close() 在探针完全成功后 reject | FAIL-DETECTED | 3/3 | probe 主体 PASS 后仍在 finally 判 FAIL,cleanupErrors=['FAULTLAB_GATEWAY_CLOSE_REJECTED'],端口全关 |
| B7b | fixture.close() reject | FAIL-DETECTED | 3/3 | 同上,cleanupErrors=['FAULTLAB_FIXTURE_CLOSE_REJECTED'] |
| B8 | writer 永久阻塞,超过 15s 关闭期限 | DEADLINE-ENFORCED | 3/3 | `T02_CONSUMER_SHUTDOWN_TIMEOUT` + `cleanupIncomplete` + 端口已关 + 缓存保留(elapsed 15.4/15.8/15.4s) |
| B9 | 缓存目录 chmod 555 后 close | FAIL-DETECTED | 3/3 | 实际路径:只读目录使 optimizer drain 无法写 → 15s 期限 → 有界拒绝、缓存保留、cleanupIncomplete;无假"干净"。**R1 更正:该轮覆盖的是 drain 阻碍路径,不能证明删除重试机制——删除路径由 B9R1/B9R2a/B9R2b 定向补测覆盖(见下)。** |
| B10 | 运行中(react-mount 时)对 worker 进程组 SIGTERM | FAIL-CLOSED | 3/3 | probeConsumer 的中断处理器关闭浏览器 → 探针以 FAIL 结束、exitCode≠0、无孤儿 Chromium |
| B9R1 | 锁定子目录使 rm() 立即失败(EACCES,不在 Node rm 重试集合内;drain 不受影响) | DELETE-FAIL-DETECTED | 3/3 | close 以 EACCES 拒绝(10ms,非期限路径)、cleanupIncomplete=false、端点已关、缓存保留且 deps 已被删除(删除已推进后失败)——失败可见,无假"干净" |
| B9R2a | 瞬时删除失败(uchg 旗标在 +80ms 清除;EPERM 属可重试集合) | RETRY-RECOVERED | 3/3 | close 成功解析、缓存**完全**删除、端点已关;closeMs 115ms > 80ms 旗标清除时刻——逻辑上要求重试在旗标清除后仍在进行,**删除重试机制被直接证明有效** |
| B9R2b | 永久删除失败(uchg 全程保持) | RETRY-EXHAUSTED-FAIL | 3/3 | 重试耗尽后 close 以 EPERM 拒绝、cleanupIncomplete=false、缓存保留、端点已关——耗尽即失败,无假"干净" |

工作包 A 的 14 组并发/生命周期实验(每组 3–5 轮)全部 CONFIRMED,其中:

- A1/A2 冷+热缓存、A3 混合并发、A4/A5 同型并发、A6 四消费者分进程、A7 四消费者同进程、A8 连续启动 → 全 PASS、缓存互不冲突、端口全关、零孤儿。
- A9 启动中途 SIGTERM → worker 以 exitCode 143 / signal 终止,ready 端口全关、零孤儿 Chromium。
- A10 初始化失败后重启 → 端口冲突识别(vite "Port … is already in use")、同端口重启成功、失败尝试无缓存残留;虚构 producer 的探针 FAIL 后,合法探针 PASS。
- A11 流量中关闭 → 5 轮中 4 次 CLOSE-CLEAN(6.5s),1 次 CLOSE-BOUNDED-FAIL(15.5s 期限,端口已关、缓存保留、错误可见)——见 F-1。
- A12 React 挂载前服务器可服务其他客户端(entry module 被扣压 900ms 期间,节点侧 fetch HTML/bootstrap 均 200)。
- A13 导航中断(module 请求 abort)→ 探针 FAIL-CLOSED,requestFailures 记录,资源全清。
- A14 leader 被 SIGKILL → Chromium 因管道 EOF 在 400ms 内自退,组清理后零存活(安全属性:无幸存者)。

## 二、工作包 C:新旧差分(同一批虚构输入)

| 问题 | 结论 | 证据 |
| --- | --- | --- |
| 原始 504 是否可复现 | **可复现(旧版)**:3 轮中 2 轮,React react.js / react-dom_client.js / react_jsx-dev-runtime.js 三个 deps 返回 504 "Outdated Optimize Dep" + ERR_ABORTED + 15s 挂载超时;每轮打击两个消费者之一(r2 dev、r3 signed),与 PR 文档描述一致。复现是竞态,不是每轮必现。 | `C-old-r2/r3.json` |
| 新版是否避免该问题 | **是**:隔离缓存下全部 21 轮(A2/A3/A5/A6/A7/A8/C2)0×504、全部挂载+fresh。根因(共享根 `node_modules/.vite` + 不同插件配置 hash 互相失效)被消除,不只是换判定。 | `C-new-r*.json`、A 组 |
| 是否只是改变了失败判定 | **不是**:(1) B3 证明新版对注入 504 判 FAIL(而非放宽);(2) C5a 证明同一故障下旧版泄漏 3 个监听端口、新版 0 泄漏;(3) C5c 静态差分:旧 31 项签名断言 0 删除,仅新增 `SIGNED_BROWSER_CLEANUP_FAILED`。 | B3、C5a、C5c |
| 是否存在新的资源泄漏 | **未发现**:40+ 轮实验的 leakCheck 全部 `no-orphan-chromium`;新实现自建临时缓存全部删除(A 组 ownedCacheRemoved=true);唯一残留来自 B2b 的契约外 writer(见 F-3,旧版无此问题因为它从不删除缓存——这是"从不清理"的代价而非新泄漏)。 | 各 `*-r*.json` leakCheck |
| 签名、撤稿、回滚、恢复是否退化 | **无退化**:C5b 新版签名浏览器全量演练 PASS(30 checks、8 演练:网络中断/缓存、checkpoint 失效×2、签名撤稿+依赖隐藏+回滚、checkpoint 回归、服务重启+持久恢复、签名事件到期+恢复、紧急关闭跨重启);断言集零删除。 | `C5b-signed-drill.json` |

**C3(诚实记录)**:新版下让两个消费者共享同一显式 cacheDir(调用方误用,契约外)3 轮未复现 504。不把未复现写成已修复——该模式下失效风险理论上存在,一旦发生,探针观测层会如 B3 般判 FAIL;PR 文档明确"Never share it across live servers"。

## 三、边界发现(不构成 #38 的缺陷,附判定依据)

**F-1 流量中关闭可走满 15s 期限(R1 更正:有效尝试 2/8,正式轮 1/5;无正常负载样本)。**
R1 对账(见 `A11-RECONCILIATION.md` 与 `evidence/A11-ATTEMPTS.json`):A11 全部尝试共 11 次——run1 的 3 轮为 harness 缺陷轮(实验未执行),有效尝试 8 次(run2 3 + run3 5),其中触及 15s 期限的为 run2-r1(当时按过渡语义记为 DIRTY,行为与 run3-r4 的 CLOSE-BOUNDED-FAIL 同签名)与 run3-r4,即 **2/8**;正式最终语义 5 轮中为 **1/5**。此前发布的「1/8」是口径错误(正式轮触及数套有效分母),现予更正;没有任何轮次被改判为 PASS。
负载披露:run2 期间 1 分钟 loadavg ≈14–15;run3 全部 A11 轮为 **80–105**(已核实与实验室自身活动无关,来自外部系统负载)。不存在正常负载样本,n 过小,不能作任何概率推断。定性结论不变:触及期限时 PR 契约成立(端口关、缓存保留、错误可见、无假 PASS)——这是设计行为,不是正确性缺陷。

**F-2 C3 共享显式缓存 3 轮未复现 504。**
判定:非缺陷。共享显式缓存属于文档禁止的调用方误用;未复现 ≠ 不存在;发生时检测层有效。

**F-3 契约外 writer(逃逸 drain 的 detached 定时器)在 close 后留下重建的缓存目录(B2b,3/3)。**
判定:非 #38 缺陷。PR 文档:"Arbitrary stuck plugin work cannot be forcibly terminated inside a shared Node process"。Vite/Rolldown 自身 writer 都在 processing promise 内等待;不被登记的异步工作在任何实现下都无法 join。该行为被观测、被记录(残留路径写入证据),harness 自行清理。任何"修复"都需要在 drain 后再等待任意宽限期,与有界关闭设计冲突。

## 四、工作包 D 决定:无需补丁

三份边界发现都不是 #38 引入的新缺陷:没有一处"真实故障被后续成功状态覆盖",没有资源泄漏回归,没有断言退化,原始 504 的根因被消除。按任务规则("仅在确有新缺陷时")不创建 PATCHES/。

若未来要加固(明确不属于本次修复):F-1 可在文档中建议调用方预期有界失败;F-3 可考虑 drain 后的可选宽限观察(代价是延长 close);C3 可考虑对"同 cacheDir 的存活服务器"做检测。均未实施。

## 四A、R1 整改记录(2026-10-24)

1. **A11 统计重建(R1-A)**:新增 `A11-RECONCILIATION.md` + `evidence/A11-ATTEMPTS.json`;更正 F-1 与本文件注入表;「1/8」撤回,更正为有效尝试 2/8、正式轮 1/5,并强制披露负载条件。
2. **临时目录对账(R1-B)**:新增 `TEMP-DIR-CLEANUP-PROOF.md` + `evidence/TEMP-DIR-LEDGER.json`;20 = 12 具名(正式轮可确认)+ 8 匿名(run2 同名覆盖 7 + B8 挂起强杀 1);匿名条目标 `CLEANED-IDENTITY-UNVERIFIED`;基线 92 复核仍成立。
3. **B9 路径澄清与定向补测(R1-C)**:B9 条目改述为 drain 阻碍路径;新增 B9R1(EACCES 立即失败)、B9R2a(瞬时 EPERM 被重试救回,证明重试机制有效)、B9R2b(永久 EPERM 重试耗尽)。四条失败路径(drain 阻碍 / 不可重试删除失败 / 瞬时可恢复 / 重试耗尽)全部 fail-closed,无假 PASS。#38 产品代码零修改。

## 五、机器与环境备注

- Node v25.8.0 是本机默认,但被测代码硬性要求 Node 22(`T02_PROBE_NODE22_REQUIRED`),所有实验用 `node@22 v22.23.4`(`brew install node@22`,仓库 `.nvmrc` 锚定 22.23.3,patch 版差异)。
- 实验期间机器有无关系统负载(ApplicationsStorageExtension ~117% CPU)。**R1.1 口径:不同指标与窗口不混用**——R0 会话早段的 uptime 读数为 15 分钟均值 ~33;正式 A11 五轮自身审计记录的 **1 分钟均值为 80–105**;run2 窗口的 1 分钟均值 ≈14–15。所有 A11 有效样本都处于高负载,时间敏感数字不作正常负载推断。
- 早期 harness 自身缺陷(B8 的 release Promise 误用、A14 的 close 事件竞态、playwright 导入路径)已修正并重跑;其造成的中间证据已作废并覆盖,不影响上述任何结论。
