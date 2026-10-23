import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProfileAmendments } from '../src/content/profileAmendments.js';
import { overlayProfile, attributedSections } from '../src/content/profileOverlay.js';
import { attributedSourceLinks } from '../src/content/sourceLinks.js';
import { auditDrugProfiles } from '../src/content/profileAudit.js';

const base = { id: 'example', name: '虚构示例', action: '• 保留的原稿。\n    • 需要修订的虚构点。\n    • 撤回的虚构点。' };
function example() {
  const refs = ['example-source'];
  return { sources: [{ id: refs[0], title: '虚构测试资料', locator: '第1节', url: 'https://example.org/reference', region: '示例地区' }],
    fields: {}, amendments: [{ field: 'action', originalText: '需要修订的虚构点。', reason: '合成测试修订',
      replacement: { text: '修订后的虚构点。\n补充的虚构点。', refs,
        evidence: [0, 1].map(pointIndex => ({ pointIndex, refs, scope: 'explanation' })) } },
    { field: 'action', originalText: '    • 撤回的虚构点。', reason: '合成测试撤回', replacement: { text: '', refs, evidence: [] } }] };
}

test('exact amendments preserve unaffected manuscript, support deletion and never mutate input', () => {
  const profile = example();
  const before = JSON.stringify({ base, profile });
  const display = overlayProfile({ ...base }, base, profile);
  assert.equal(display.action, '• 保留的原稿。\n    • 修订后的虚构点。\n补充的虚构点。\n');
  assert.equal(JSON.stringify({ base, profile }), before);
  assert.equal(display.fieldSources.action, undefined);
  const section = attributedSections(display, [['action', '作用']])[0];
  assert.equal(section.partial, true);
  assert.equal(section.text, '修订后的虚构点。\n补充的虚构点。');
  assert.ok(!section.text.includes('保留的原稿'));
  assert.deepEqual(section.evidence.map(point => point.pointIndex), [1, 2]);
  assert.equal(attributedSourceLinks(profile, display)[0].url, 'https://example.org/reference');
});

test('changed and explicitly cleared local fields keep their authorship and receive no amendment references', () => {
  for (const action of ['', '本地人工编辑。']) {
    const display = overlayProfile({ ...base, action }, base, example());
    assert.equal(display.action, action);
    assert.equal(display.fieldAmendments, undefined);
    assert.deepEqual(attributedSections(display, [['action', '作用']]), []);
    assert.deepEqual(attributedSourceLinks(example(), display), []);
  }
});

test('missing, repeated, overlapping targets and simultaneous full replacements fail closed', () => {
  const missing = example(); missing.amendments[0].originalText = '原稿中不存在。';
  assert.throws(() => resolveProfileAmendments(base, missing), /target/);
  assert.throws(() => resolveProfileAmendments({ ...base, action: base.action + '\n需要修订的虚构点。' }, example()), /target/);
  const overlap = example(); overlap.amendments.push({ ...overlap.amendments[0] });
  assert.throws(() => resolveProfileAmendments(base, overlap), /target/);
  const conflict = example(); conflict.fields.action = { text: '整栏替换。' };
  assert.throws(() => resolveProfileAmendments(base, conflict), /replaced and amended/);
  assert.throws(() => resolveProfileAmendments(base, { ...example(), amendments: '' }), /list/);
});

test('replacement dollars are literal text, not string replacement operators', () => {
  const profile = example();
  profile.amendments = [profile.amendments[0]];
  profile.amendments[0].replacement.text = '$& 是虚构测试文本。';
  profile.amendments[0].replacement.evidence = [profile.amendments[0].replacement.evidence[0]];
  assert.ok(resolveProfileAmendments(base, profile).action.text.includes('$& 是虚构测试文本。'));
});

test('overlap is checked against original positions even when a replacement retains the old wording', () => {
  const profile = example();
  profile.amendments = [profile.amendments[0]];
  profile.amendments[0].replacement.text = '需要修订的虚构点。';
  profile.amendments[0].replacement.evidence = [profile.amendments[0].replacement.evidence[0]];
  profile.amendments.push({ ...profile.amendments[0], originalText: '虚构点。' });
  const uniqueBase = { ...base, action: '需要修订的虚构点。' };
  assert.throws(() => resolveProfileAmendments(uniqueBase, profile), /Overlapping/);
  profile.amendments.pop();
  profile.retainedEvidence = [{ field: 'action', originalText: '需要修订的虚构点。', refs: ['example-source'], scope: 'explanation' }];
  assert.throws(() => resolveProfileAmendments(uniqueBase, profile), /Retained evidence overlaps/);
});

test('point-level references are included in actual attribution and reading links', () => {
  const profile = example();
  profile.sources.push({ id: 'point-source', title: '逐点测试来源', locator: '第2节', url: 'https://example.org/point' });
  profile.amendments[0].replacement.evidence[0].refs = ['point-source'];
  const display = overlayProfile({ ...base }, base, profile);
  assert.ok(attributedSourceLinks(profile, display).some(link => link.url === 'https://example.org/point'));
});

test('source gaps, incomplete point evidence and unsupported metadata fields are rejected', () => {
  const missing = example(); missing.sources = [];
  assert.throws(() => resolveProfileAmendments(base, missing), /source/);
  const gap = example(); gap.amendments[0].replacement.evidence.pop();
  assert.throws(() => resolveProfileAmendments(base, gap), /evidence incomplete/);
  const malformedDeletion = example(); malformedDeletion.amendments[1].replacement.evidence = false;
  assert.throws(() => resolveProfileAmendments(base, malformedDeletion), /Invalid amendment point evidence/);
  const metadata = example(); metadata.amendments[0].field = 'name';
  assert.throws(() => resolveProfileAmendments(base, metadata), /field/);
});

test('retained manual points need their own evidence; a sourced phrase does not certify its entire point', () => {
  const profile = example();
  profile.retainedEvidence = [{ field: 'action', originalText: '保留的原稿。', refs: ['example-source'], scope: 'explanation' }];
  const resolved = resolveProfileAmendments(base, profile).action;
  assert.deepEqual(resolved.mappedEvidence.map(point => point.pointIndex).sort(), [0, 1, 2]);
  const originalReport = auditDrugProfiles([base], { example: example() });
  assert.ok(originalReport.entries[0].problems.some(problem => problem.field === 'action' && problem.pointIndex === 0));
  const reviewedReport = auditDrugProfiles([base], { example: profile });
  assert.ok(!reviewedReport.entries[0].problems.some(problem => problem.field === 'action'));
  assert.equal(reviewedReport.allStructurallyComplete, false); // Other seven fields are absent.
  const phraseBase = { ...base, action: '原稿中的一段虚构文字。' };
  const phrase = example(); phrase.amendments = [{ ...phrase.amendments[0], originalText: '一段',
    replacement: { text: '已修订的', refs: ['example-source'], evidence: [{ pointIndex: 0, refs: ['example-source'], scope: 'explanation' }] } }];
  assert.deepEqual(resolveProfileAmendments(phraseBase, phrase).action.mappedEvidence, []);
});
