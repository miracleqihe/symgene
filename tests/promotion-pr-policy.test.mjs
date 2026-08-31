import assert from 'node:assert/strict'
import test from 'node:test'

import {
  REPORT_MARKER,
  renderPromotionReport,
  validatePromotionPr,
} from '../.github/scripts/validate-promotion-pr.mjs'

function promotionPayload(overrides = {}) {
  return {
    pull_request: {
      title: 'release: promote dev to main (2026-08-31)',
      body: `## 晋级摘要

发布 dev 中已经完成审核的变更。

## 包含的变更

- #20

## 验证

- [x] Branch policy 通过
- [x] Verify 通过

## 风险与回滚

没有已知兼容性风险；必要时回滚本次 merge commit。

## 合并要求

- [x] miracleqihe 已批准
- [x] 使用 Create a merge commit
`,
      user: { login: 'contributor' },
      base: {
        ref: 'main',
        repo: { full_name: 'miracleqihe/symgene' },
      },
      head: {
        ref: 'dev',
        repo: { full_name: 'miracleqihe/symgene' },
      },
      ...overrides,
    },
  }
}

test('accepts a completed same-repository dev to main promotion', () => {
  const result = validatePromotionPr(promotionPayload())
  assert.equal(result.valid, true)
  assert.deepEqual(result.errors, [])
})

test('rejects a fork branch and a generic title', () => {
  const payload = promotionPayload({
    title: 'Dev',
    head: {
      ref: 'dev',
      repo: { full_name: 'someone/symgene' },
    },
  })
  const result = validatePromotionPr(payload)

  assert.equal(result.valid, false)
  assert.match(result.errors.join('\n'), /同仓库/)
  assert.match(result.errors.join('\n'), /标题必须使用/)
})

test('rejects an impossible promotion date', () => {
  const result = validatePromotionPr(
    promotionPayload({ title: 'release: promote dev to main (2026-02-30)' }),
  )

  assert.equal(result.valid, false)
  assert.match(result.errors.join('\n'), /有效日期/)
})

test('rejects template placeholders and unchecked boxes', () => {
  const payload = promotionPayload()
  payload.pull_request.body = payload.pull_request.body
    .replace('发布 dev 中已经完成审核的变更。', '<!-- 填写摘要 -->')
    .replace('- [x] Branch policy 通过', '- [ ] Branch policy 通过')

  const result = validatePromotionPr(payload)

  assert.equal(result.valid, false)
  assert.match(result.errors.join('\n'), /晋级摘要.*尚未填写/)
  assert.match(result.errors.join('\n'), /HTML 模板提示/)
  assert.match(result.errors.join('\n'), /未确认的复选框/)
})

test('renders one updateable comment addressed to the pull request author', () => {
  const report = renderPromotionReport(validatePromotionPr(promotionPayload()))

  assert.match(report, new RegExp(REPORT_MARKER))
  assert.match(report, /@contributor/)
  assert.match(report, /符合当前规范/)
})
