import test from 'node:test';
import assert from 'node:assert/strict';
import { auditReadingProfiles } from '../src/content/readingProfileAudit.js';
import { disorderFields } from '../src/content/disorders.js';
import { caseFields } from '../src/content/cases.js';

const item = { id: 'example-topic', name: '虚构测试主题' };
function fixture(type) {
  const book = { id: 'example-book', title: '虚构测试书目', locator: 'example.xhtml /p[1]',
    sourceRevision: 'a'.repeat(64), ...(type === 'disorders' ? { format: 'epub' } : { kind: 'casebook' }) };
  const china = { id: 'example-china', title: '虚构中国参考资料', region: '中国大陆', locator: '第1节',
    kind: 'clinical_standard', url: 'https://example.org/china' };
  const fiction = { id: 'example-fiction', title: '原创虚构测试情景', kind: 'fiction', locator: item.id };
  const fields = Object.fromEntries((type === 'disorders' ? disorderFields : caseFields).map(([field]) => [field, {
    text: field === 'summary' ? '明确标为虚构的测试说明。' : '仅用于自动测试的示例。',
    refs: [book.id, china.id, fiction.id], evidence: [{ pointIndex: 0, scope: 'explanation', refs: [book.id, china.id, fiction.id] }],
  }]));
  return { [item.id]: { sources: [book, china, fiction], fields } };
}
const problems = (profiles, type) => auditReadingProfiles([item], profiles, type).entries[0].problems.map(problem => problem.problem);

test('each library requires the designated book in actual point evidence, not just a source list', () => {
  for (const type of ['disorders', 'cases']) {
    const profiles = fixture(type);
    assert.equal(auditReadingProfiles([item], profiles, type).allStructurallyComplete, true);
    for (const field of Object.values(profiles[item.id].fields)) field.evidence[0].refs = ['example-china', 'example-fiction'];
    assert.ok(problems(profiles, type).includes(type === 'disorders' ? 'missing_used_epub_source' : 'missing_used_casebook_source'));
  }
});

test('missing fields, missing points and unresolvable locations cannot be counted as covered', () => {
  const profiles = fixture('disorders');
  delete profiles[item.id].fields.details;
  profiles[item.id].fields.symptoms.text += '\n第二个虚构测试点。';
  profiles[item.id].sources[0].locator = '';
  profiles[item.id].fields.assessment.evidence = false;
  const failures = problems(profiles, 'disorders');
  for (const expected of ['missing_supplement_field', 'missing_or_duplicate_point_evidence', 'unresolvable_source', 'invalid_point_evidence']) {
    assert.ok(failures.includes(expected), expected);
  }
  assert.equal(auditReadingProfiles([item], profiles, 'disorders').structurallyComplete, 0);
});

test('source hashes, Chinese use and fictional identity are checked independently', () => {
  const profiles = fixture('cases');
  profiles[item.id].sources[0].sourceRevision = 'not-a-source-hash';
  profiles[item.id].sources[1].region = '示例地区';
  profiles[item.id].fields.summary.evidence[0].refs = ['example-book', 'example-china'];
  const failures = problems(profiles, 'cases');
  for (const expected of ['missing_used_casebook_source', 'missing_used_chinese_reference', 'missing_fictional_case_identity']) assert.ok(failures.includes(expected));
});

test('a fictional character in China cannot stand in for a Chinese clinical reference', () => {
  const profiles = fixture('cases');
  profiles[item.id].sources[1].region = '示例地区';
  profiles[item.id].sources[2].region = '中国大陆';
  profiles[item.id].sources[2].url = 'https://example.org/fiction';
  assert.ok(problems(profiles, 'cases').includes('missing_used_chinese_reference'));
});

test('duplicate and out-of-body evidence, identity overrides and unknown entries fail the internal audit', () => {
  const profiles = fixture('disorders');
  profiles[item.id].fields.summary.evidence.push({ pointIndex: 0, scope: 'explanation', refs: ['example-book'] },
    { pointIndex: 9, scope: 'explanation', refs: ['example-book'] });
  profiles[item.id].fields.name = { text: '不允许覆盖身份' };
  profiles['unknown-example'] = profiles[item.id];
  const report = auditReadingProfiles([item], profiles, 'disorders');
  assert.deepEqual(report.unknownProfileIds, ['unknown-example']);
  assert.equal(report.allStructurallyComplete, false);
  for (const expected of ['missing_or_duplicate_point_evidence', 'evidence_outside_body', 'unknown_profile_field']) {
    assert.ok(report.entries[0].problems.some(problem => problem.problem === expected));
  }
});
