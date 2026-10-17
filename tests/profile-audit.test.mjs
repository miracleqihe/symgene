import test from 'node:test';
import assert from 'node:assert/strict';
import { auditDrugProfiles } from '../src/content/profileAudit.js';

const fieldNames = ['indication', 'action', 'kinetics', 'interactions', 'sideEffects', 'contraindications', 'specialPopulations', 'monitoring'];
function exampleProfile() {
  return { sources: [{ id: 'example-source', locator: '示例资料第1节' }],
    fields: Object.fromEntries(fieldNames.map(field => [field, { text: '虚构测试点。\n第二个虚构测试点。', refs: ['example-source'],
      evidence: [0, 1].map(pointIndex => ({ pointIndex, refs: ['example-source'], scope: 'explanation' })) }])) };
}

test('eight nonempty fields cannot conceal missing per-point attribution', () => {
  const profile = exampleProfile();
  delete profile.fields.kinetics.evidence;
  const result = auditDrugProfiles([{ id: 'example', name: '虚构示例' }], { example: profile });
  assert.equal(result.allStructurallyComplete, false);
  assert.equal(result.entries[0].problems.filter(item => item.field === 'kinetics').length, 2);
});

test('an absent entry and an out-of-body reference cannot be counted as complete', () => {
  const profile = exampleProfile();
  profile.fields.action.evidence[1].pointIndex = 3;
  profile.fields.monitoring.evidence[0].refs = ['missing-source'];
  const result = auditDrugProfiles([{ id: 'example', name: '虚构示例' }, { id: 'another', name: '另一虚构示例' }], { example: profile, unknown: profile });
  assert.equal(result.structurallyComplete, 0);
  assert.equal(result.entries[1].hasSupplement, false);
  assert.ok(result.entries[0].problems.some(item => item.problem === 'evidence_outside_body'));
  assert.ok(result.entries[0].problems.some(item => item.problem === 'unresolvable_point_source'));
  assert.deepEqual(result.unknownProfileIds, ['unknown']);
});

test('a fully mapped example passes structural checks without a clinical certification', () => {
  const result = auditDrugProfiles([{ id: 'example', name: '虚构示例' }], { example: exampleProfile() });
  assert.equal(result.structurallyComplete, 1);
  assert.equal(result.allStructurallyComplete, true);
  assert.match(result.note, /does not certify clinical correctness/);
});
