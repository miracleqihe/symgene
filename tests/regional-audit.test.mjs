import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRegionalCoverage } from '../src/content/regionalAudit.js';

const drugs = [{ id: 'example', name: '虚构测试药物' }];
function profile() {
  return { sources: [{ id: 'example-cn', kind: 'label', region: '中国大陆', language: 'zh-CN', updated: '2026-03-01', checkedAt: '2026-10-11',
    product: { genericName: '虚构药物', dosageForm: '片剂', marketingAuthorisationHolder: '虚构持有人', strengths: ['虚构规格'], approvalNumbers: ['example-authorisation'] } }],
    fields: { indication: { refs: ['example-cn'] } }, regionalReview: { audience: 'CN-mainland', checkedAt: '2026-10-11',
      status: 'cn_product_verified', productSourceIds: ['example-cn'], comparisonSourceIds: [], limitations: [] } };
}

test('a translated or overseas label cannot stand in for a Chinese product', () => {
  const value = profile();
  value.sources[0].region = '美国';
  const result = auditRegionalCoverage(drugs, { example: value });
  assert.equal(result.chineseProductVerified, 0);
  assert.ok(result.entries[0].problems.includes('invalid_chinese_product_source'));
  assert.equal(auditRegionalCoverage(drugs, {}).metadataComplete, 0);
});

test('unverified approval is recorded without being counted as Chinese verification', () => {
  const value = profile();
  value.regionalReview.status = 'cn_status_unverified';
  value.regionalReview.productSourceIds = [];
  value.regionalReview.limitations = ['这是虚构测试限制：未取得中国产品原件。'];
  const result = auditRegionalCoverage(drugs, { example: value });
  assert.equal(result.metadataComplete, 1);
  assert.equal(result.chineseProductVerified, 0);
  value.regionalReview.limitations = [];
  assert.equal(auditRegionalCoverage(drugs, { example: value }).metadataComplete, 0);
});

test('a product record needs its identity, source use and two distinct dates', () => {
  const value = profile();
  assert.equal(auditRegionalCoverage(drugs, { example: value }).chineseProductVerified, 1);
  delete value.sources[0].updated;
  value.sources[0].product.approvalNumbers = [];
  value.fields.indication.refs = [];
  const result = auditRegionalCoverage(drugs, { example: value });
  assert.equal(result.chineseProductVerified, 0);
  for (const problem of ['missing_product_dates', 'incomplete_product_identity', 'unused_chinese_product_source']) assert.ok(result.entries[0].problems.includes(problem));
});
