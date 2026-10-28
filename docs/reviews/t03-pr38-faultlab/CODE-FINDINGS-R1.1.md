# CODE-FINDINGS-R1.1 — `superviseWorker` 的 `answer.error ??=` 只读判定(R1.1-E)

对象:#38 HEAD `9dfc403` 的 `scripts/t02/consumer-concurrency.mjs`:

```js
const answer = { ...(result ?? {}), ...lifecycle, status: 'PASS' };
if (!isWorkerSuccess(answer)) {
  answer.status = 'FAIL';
  answer.error ??= { code: timedOut ? 'T02_PROBE_CHILD_TIMEOUT'
    : !reports ? 'T02_PROBE_CHILD_NO_REPORT'
    : !reportValid ? 'T02_PROBE_CHILD_REPORT_INVALID'
    : 'T02_PROBE_CHILD_EXIT_FAILED', ... };
}
```

**等级:LOW(可观测性/可维护性)。不需要 #38 改动。**

## 分析路径

`isWorkerSuccess(answer)` 检查 `exitCode===0 && signal===null && !timedOut && reportReceived && reportValid && status==='PASS'`,其中 `reportValid`(监管层计算)要求 `rows.every(... isProbeSuccess(row))`,而 `isProbeSuccess` 检查**子级探针行**的 `status==='PASS'` 与全部网络/清理断言。`answer.status` 来自 lifecycle 展开(固定 'PASS'),子级 `result.status` 被覆盖、不参与判定。

## 逐问回答(附实测)

最小复现:`harness/r11e-error-field-repro.mjs`(只调用公开 API;证据 `evidence/R11E-child_error_pass.json`、`evidence/R11E-child_fail_with_error.json`):

1. **是否可能误判为 PASS? — 否(CONFIRMED)。** 两个方向实测:子级发"全有效 PASS 行 + 附带 error 字段"→ 判 PASS(此时行本身满足全部契约,error 字段属噪声);子级发 `status:'FAIL'` + error → `isProbeSuccess` 失败 → `reportValid=false` → 判 FAIL。子级 error 字段在两个方向都不影响判定。
2. **是否影响报告完整性或身份绑定? — 否(CONFIRMED)。** executionId/pid/mode/reports===1 的校验在 `reportValid` 计算中独立进行;B6 系列证据(缺失/重复/身份错/模式错/不完整,各 3/3)不受该字段影响。
3. **是否仅影响错误码可观测性? — 是(CONFIRMED)。** 子级报告若带 `error`,监管诊断码被子级码取代。实测:场景 B 的 answer.error = `T02_PROBE_SNAPSHOT_INVALID`(子级码)而非 `T02_PROBE_CHILD_REPORT_INVALID`(监管码)。已发布证据同样呈现此行为:A10 的 failedProbe.error.code = `ERR_MODULE_NOT_FOUND`(子级码)。读日志者无法单凭错误码区分"监管层失败"与"探针失败"。
4. **是否存在可利用的故障分类混淆? — 低(CONFIRMED 为观察,非可利用缺陷)。** 分类混淆只发生在失败已确定之后(status 已 FAIL);不存在把失败洗成 PASS 的路径。另一个方向(有效 PASS 行 + error 字段)产生"带错误码的 PASS"——轻微误导性输出,同样不影响判定。
5. **是否需要 #38 改动? — 不需要(CONFIRMED 建议)。** 行为是"保留更具体的子级诊断",可辩护;代价是错误码本体(WHO 报告的)不可自辨。若未来整理,建议 `answer.error = { code: <监管码>, childError: result?.error }`(嵌套而非覆盖)——记录为低优先级维护建议,本整改不实施、不改 #38。

## 判定汇总

- 误判 PASS:REFUTED(不可能)
- 报告完整性/身份绑定影响:REFUTED(无)
- 仅错误码可观测性:CONFIRMED
- 可利用的故障分类混淆:REFUTED(失败判定不受影响;仅归因可读性)
- 需要 #38 改动:REFUTED(LOW 级维护建议,不实施)
