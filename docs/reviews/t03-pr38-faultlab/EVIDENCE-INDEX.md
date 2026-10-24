# EVIDENCE-INDEX — T03 PR #38 并发故障实验室

机器可读清单见 `EVIDENCE-INDEX.json`(逐文件:原始 SHA-256 与公开副本 SHA-256 分开记录;脱敏文件两者必然不同,不得互相冒充)。

## 完整性锚点

- `EVIDENCE-INDEX.json` SHA-256: `aa176507b44b7b3886186242cc0653d871f317d0d045e9896542316873872152`
- `ENVIRONMENT.json` SHA-256: `c9741d9414fcfd5cf7696897d96c6bf990e514d97edc5f35ad1ea08fb5a59b9b`
- `EVIDENCE-INDEX.md`(本文件)无法在包内自哈希;其完整性由审查分支的 git 提交 SHA 内容寻址锚定——任何对已发布文件的改动都会改变提交并使 `EVIDENCE-INTEGRITY-REPORT.md` 的核对失效。

## 覆盖

- 工作包 A 14 组 + 工作包 B 22 组 = 36 组(112 轮),另加工作包 C 差分演练 3 个变体(9 轮),逐轮证据共 121 份;汇总/日志/回归等支撑材料一并发布。
- 全部逐轮材料完整公开(脱敏仅限本地路径/用户名);没有任何轮次只保留 PASS。
- 保留在本机、未公开的材料:私有 producer 检出本身(代码/密钥/业务数据)、实验 harness 脚本(含本地绝对路径)、ENVIRONMENT.json 中标注 WITHHELD 的字段。这些在 JSON 中标 `PRIVATE_EVIDENCE_REQUIRED`。

## 重点证据对照(审查清单 A–H)

- **A. 旧版 504 复现(2 轮)与未复现轮**
  - `evidence/C-old-r2.json`
  - `evidence/C-old-r3.json`
  - `evidence/C-old-r1.json`
- **B. 新版 21 轮 0×504(条件:每个 live server 独立临时缓存;口径:probe 观测层 504/HTTP/requestfailed/pageerror/console 计数)**
  - `evidence/C-new-r1.json`
  - `evidence/C-new-r2.json`
  - `evidence/C-new-r3.json`
  - `evidence/A2-single-signed-cold-warm-r1.json`
  - `evidence/A3-pair-mixed-parallel-shared-process-r1.json`
  - `evidence/A6-quad-separate-processes-r1.json`
  - `evidence/A7-quad-shared-process-r1.json`
- **C. 504 后 React 仍挂载成功但最终 FAIL**
  - `evidence/B3-http504-then-mount-r1.json`
  - `evidence/B3-http504-then-mount-r2.json`
  - `evidence/B3-http504-then-mount-r3.json`
  - `evidence/regression-browser-504-regression.log`
- **D. PASS 报告后 SIGTERM / 非零退出 / 未捕获异常 / 重复报告**
  - `evidence/B4-pass-report-then-sigterm-r1.json`
  - `evidence/B5a-pass-then-nonzero-exit-r1.json`
  - `evidence/B5b-pass-then-uncaught-r1.json`
  - `evidence/B6b-report-duplicate-second-fails-r1.json`
- **E. 旧版 3 端口泄漏 vs 新版 0 泄漏(lsof LISTEN 差值 + loopback close 记录)**
  - `evidence/C5a-cleanup-old.json`
  - `evidence/C5a-cleanup-new.json`
- **F. A11 触及 15s 期限轮的可观测序列与最终失败状态(手动演练,无逐事件埋点;粒度=开始/结束时间戳、close 耗时 15008ms、错误码 T02_CONSUMER_SHUTDOWN_TIMEOUT、导航结果 loaded、失败/HTTP 计数、缓存保留、端口已关、无孤儿进程);R1 统计对账:11 次尝试 = 3 harness 缺陷 + 8 有效,期限触及 2/8(有效)/1/5(正式),全部高负载,已撤回概率表述**
  - `evidence/A11-ATTEMPTS.json (R1 对账表)`
  - `A11-RECONCILIATION.md`
  - `evidence/A11-close-during-traffic-r4.json (CLOSE-BOUNDED-FAIL)`
  - `evidence/A11-close-during-traffic-r1.json (对照:CLEAN 轮)`
  - `evidence/summary-A11-close-during-traffic.json (正式轮判定)`
- **G. 强杀后 20 个临时目录的归属/清理/契约边界(R1 对账:12 具名 + 8 匿名,匿名条目标 CLEANED-IDENTITY-UNVERIFIED;OS 快照能力边界已写明)**
  - `evidence/TEMP-DIR-LEDGER.json (R1 逐目录对账)`
  - `TEMP-DIR-CLEANUP-PROOF.md`
  - `evidence/A9-midstart-shutdown-r1.json 等(leakCheck.newTempCaches 逐轮记录)`
  - `RESOURCE-LIFECYCLE.md 第 7 节`
- **I. B9 删除失败路径定向补测(R1):原 B9 实为 drain 阻碍→期限;新证据覆盖不可重试删除失败、瞬时重试救回、永久重试耗尽**
  - `evidence/B9R1-deletion-failure-isolated-r1.json (EACCES 立即拒绝,deps 已删除后失败)`
  - `evidence/B9R2a-transient-deletion-failure-recovered-r1.json (closeMs 115ms > 80ms 旗标清除,缓存完全删除)`
  - `evidence/B9R2b-permanent-deletion-failure-eperm-r1.json (EPERM 耗尽,缓存保留)`
  - `evidence/B9-cache-deletion-failure-r1.json (原 B9:drain 阻碍→期限)`
- **J. R1.1-B 删除重试直接证据:rm() 契约层秒级余量证明 + B9R2b 6.7s 完全归因(单元 rm(5,10) 6.69-6.74s 与产品路径吻合)+ 平台偏差如实记录 + PARTIAL 边界**
  - `evidence/B9-RETRY-TRACE.json (机器可读时序与分级判定)`
  - `B9-RETRY-TRACE.md`
  - `evidence/R11B-EXP1-rm-transient-recovery-r1.json (6.0s 成功 > 3.5s 清除)`
  - `evidence/R11B-EXP2-rm-permanent-exhaustion-r1.json (45s 未终止的平台观测)`
  - `evidence/R11B-EXP3-close-decomposition-control-r1.json (对照 close 3-4ms)`
  - `evidence/R11B-EXP3-close-decomposition-flagged-r1.json (加旗标 6.8s)`
  - `evidence/R11B-EXP4-rm-window-unit.json (单元 rm(5,10) 6.69-6.74s)`
- **K. R1.1-A 证据索引完整性:R1 遗留悬空引用已修复,逐文件双向存在性 + 全量哈希核对,机器可读校验可独立重放**
  - `EVIDENCE-INTEGRITY-REPORT.md`
  - `evidence/integrity-before-2af0d2e.json (整改前:1 悬空 + 3 未索引)`
  - `evidence/integrity-after.json (整改后:0 悬空 + 0 未索引 + 全量哈希一致)`
  - `repro/verify-evidence-integrity.mjs (可独立重放的校验器)`
- **L. R1.1-E 代码 Finding 只读判定:answer.error ??= 仅影响错误码可观测性,LOW 级维护建议,#38 无需改动**
  - `CODE-FINDINGS-R1.1.md`
  - `evidence/R11E-child_error_pass.json (有效 PASS + 子级 error 字段:仍 PASS)`
  - `evidence/R11E-child_fail_with_error.json (子级 FAIL:正确 FAIL,子级码取代监管码)`
- **M. R1.1-D 独立复现驱动:公开、脱敏、预检锁定 commit+模块 SHA,实测 ALL-DRILLS-PASS**
  - `repro/b9-delete-failure-drill.mjs`
  - `repro/verify-evidence-integrity.mjs`
- **H. 最终回归:单测 8/8、真实 Chromium 504 回归、CI profile 3 对 6 探针**
  - `evidence/regression-unit-content-concurrency.log`
  - `evidence/regression-browser-504-regression.log`
  - `evidence/regression-matrix-ci-profile.log`
  - `evidence/matrix-ci/matrix.json`
  - `evidence/final-regression.json`

## 逐组逐轮判定

| 实验 | 实现 | 轮 → 判定(✓=符合期望) |
| --- | --- | --- |
| A1-single-dev-cold-warm | new | r1:PASS✓ r2:PASS✓ r3:PASS✓ |
| A10-restart-after-init-failure | new | r1:RESTART-PASS✓ r2:RESTART-PASS✓ r3:RESTART-PASS✓ |
| A11-close-during-traffic | new | r1:CLOSE-CLEAN✓ r2:CLOSE-CLEAN✓ r3:CLOSE-CLEAN✓ r4:CLOSE-BOUNDED-FAIL✗ r5:CLOSE-CLEAN✓ |
| A12-http-before-react-mount | new | r1:PASS✓ r2:PASS✓ r3:PASS✓ |
| A13-navigation-interruption | new | r1:FAIL-CLOSED✓ r2:FAIL-CLOSED✓ r3:FAIL-CLOSED✓ |
| A14-leader-death-orphan-reap | new | r1:ORPHANS-REAPED✓ r2:ORPHANS-REAPED✓ r3:ORPHANS-REAPED✓ r4:ORPHANS-REAPED✓ r5:ORPHANS-REAPED✓ |
| A2-single-signed-cold-warm | new | r1:PASS✓ r2:PASS✓ r3:PASS✓ |
| A3-pair-mixed-parallel-shared-process | new | r1:PASS✓ r2:PASS✓ r3:PASS✓ |
| A4-pair-dev-dev-parallel-shared-process | new | r1:PASS✓ r2:PASS✓ r3:PASS✓ |
| A5-pair-signed-signed-parallel-shared-process | new | r1:PASS✓ r2:PASS✓ r3:PASS✓ |
| A6-quad-separate-processes | new | r1:PASS✓ r2:PASS✓ r3:PASS✓ |
| A7-quad-shared-process | new | r1:PASS✓ r2:PASS✓ r3:PASS✓ |
| A8-pair-sequential-shared-process | new | r1:PASS✓ r2:PASS✓ r3:PASS✓ |
| A9-midstart-shutdown | new | r1:KILLED-CLEANLY✓ r2:KILLED-CLEANLY✓ r3:KILLED-CLEANLY✓ |
| B1-close-joins-delayed-writer | new | r1:JOINED✓ r2:JOINED✓ r3:JOINED✓ |
| B10-sigterm-midrun-browser-interrupt | new | r1:FAIL-CLOSED✓ r2:FAIL-CLOSED✓ r3:FAIL-CLOSED✓ |
| B2a-close-joins-writer-released-after-close-start | new | r1:JOINED✓ r2:JOINED✓ r3:JOINED✓ |
| B2b-detached-writer-escapes-drain | new | r1:RESIDUE-RECORDED✓ r2:RESIDUE-RECORDED✓ r3:RESIDUE-RECORDED✓ |
| B3-http504-then-mount | new | r1:FAIL-DETECTED✓ r2:FAIL-DETECTED✓ r3:FAIL-DETECTED✓ |
| B4-pass-report-then-sigterm | new | r1:FAIL-DETECTED✓ r2:FAIL-DETECTED✓ r3:FAIL-DETECTED✓ |
| B5a-pass-then-nonzero-exit | new | r1:FAIL-DETECTED✓ r2:FAIL-DETECTED✓ r3:FAIL-DETECTED✓ |
| B5b-pass-then-uncaught | new | r1:FAIL-DETECTED✓ r2:FAIL-DETECTED✓ r3:FAIL-DETECTED✓ |
| B6a-report-missing | new | r1:FAIL-DETECTED✓ r2:FAIL-DETECTED✓ r3:FAIL-DETECTED✓ |
| B6b-report-duplicate-second-fails | new | r1:FAIL-DETECTED✓ r2:FAIL-DETECTED✓ r3:FAIL-DETECTED✓ |
| B6c-report-wrong-kind | new | r1:FAIL-DETECTED✓ r2:FAIL-DETECTED✓ r3:FAIL-DETECTED✓ |
| B6d-report-wrong-execution | new | r1:FAIL-DETECTED✓ r2:FAIL-DETECTED✓ r3:FAIL-DETECTED✓ |
| B6e-report-wrong-pid | new | r1:FAIL-DETECTED✓ r2:FAIL-DETECTED✓ r3:FAIL-DETECTED✓ |
| B6f-report-mode-mismatch | new | r1:FAIL-DETECTED✓ r2:FAIL-DETECTED✓ r3:FAIL-DETECTED✓ |
| B6g-report-incomplete-result | new | r1:FAIL-DETECTED✓ r2:FAIL-DETECTED✓ r3:FAIL-DETECTED✓ |
| B7a-gateway-close-rejects | new | r1:FAIL-DETECTED✓ r2:FAIL-DETECTED✓ r3:FAIL-DETECTED✓ |
| B7b-fixture-close-rejects | new | r1:FAIL-DETECTED✓ r2:FAIL-DETECTED✓ r3:FAIL-DETECTED✓ |
| B8-shutdown-timeout | new | r1:DEADLINE-ENFORCED✓ r2:DEADLINE-ENFORCED✓ r3:DEADLINE-ENFORCED✓ |
| B9-cache-deletion-failure | new | r1:FAIL-DETECTED✓ r2:FAIL-DETECTED✓ r3:FAIL-DETECTED✓ |
| B9R1-deletion-failure-isolated | new | r1:DELETE-FAIL-DETECTED✓ r2:DELETE-FAIL-DETECTED✓ r3:DELETE-FAIL-DETECTED✓ |
| B9R2a-transient-deletion-failure-recovered | new | r1:RETRY-RECOVERED✓ r2:RETRY-RECOVERED✓ r3:RETRY-RECOVERED✓ |
| B9R2b-permanent-deletion-failure-eperm | new | r1:RETRY-EXHAUSTED-FAIL✓ r2:RETRY-EXHAUSTED-FAIL✓ r3:RETRY-EXHAUSTED-FAIL✓ |
| new | new | r1:NOT-REPRODUCED✗ r2:NOT-REPRODUCED✗ r3:NOT-REPRODUCED✗ |
| new-shared | new | r1:NOT-REPRODUCED✗ r2:NOT-REPRODUCED✗ r3:NOT-REPRODUCED✗ |
| old | old | r1:NOT-REPRODUCED✗ r2:REPRODUCED✗ r3:REPRODUCED✗ |
