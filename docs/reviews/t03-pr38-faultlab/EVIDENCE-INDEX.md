# EVIDENCE-INDEX — T03 PR #38 并发故障实验室

机器可读清单见 `EVIDENCE-INDEX.json`(逐文件:原始 SHA-256 与公开副本 SHA-256 分开记录;脱敏文件两者必然不同,不得互相冒充)。

## 覆盖

- 工作包 A 14 组 + 工作包 B 19 组 = 33 组(103 轮),另加工作包 C 差分演练 3 个变体(9 轮),逐轮证据共 112 份;汇总/日志/回归等支撑材料一并发布。
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
- **F. A11 触及 15s 期限轮的可观测序列与最终失败状态(手动演练,无逐事件埋点;粒度=开始/结束时间戳、close 耗时 15008ms、错误码 T02_CONSUMER_SHUTDOWN_TIMEOUT、导航结果 loaded、失败/HTTP 计数、缓存保留、端口已关、无孤儿进程)**
  - `evidence/A11-close-during-traffic-r4.json (CLOSE-BOUNDED-FAIL)`
  - `evidence/A11-close-during-traffic-r1.json (对照:CLEAN 轮)`
  - `evidence/summary-A11-close-during-traffic.json (全部轮次判定)`
- **G. 强杀后 20 个临时目录的归属/清理/契约边界**
  - `evidence/A9-midstart-shutdown-r1.json 等(leakCheck.newTempCaches 逐轮记录)`
  - `RESOURCE-LIFECYCLE.md 第 7 节`
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
| new | new | r1:NOT-REPRODUCED✗ r2:NOT-REPRODUCED✗ r3:NOT-REPRODUCED✗ |
| new-shared | new | r1:NOT-REPRODUCED✗ r2:NOT-REPRODUCED✗ r3:NOT-REPRODUCED✗ |
| old | old | r1:NOT-REPRODUCED✗ r2:REPRODUCED✗ r3:REPRODUCED✗ |
