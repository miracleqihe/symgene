import test from 'node:test';
import assert from 'node:assert/strict';
import { attributedSections, overlayProfile } from '../src/content/profileOverlay.js';

const base = { id: 'example', presentation: ['原有示例'], summary: '原有示例摘要' };
const profile = { sources: [{ id: 'example-source', title: '虚构测试资料', locator: '第1节' }],
  fields: { presentation: { text: '第一点\n第二点', refs: ['example-source'], evidence: [{ pointIndex: 0, scope: 'communication', refs: ['example-source'], locations: { 'example-source': '第2节' } }] },
    summary: { text: '虚构补充摘要', refs: ['example-source'] } } };

test('cloned original arrays receive supplements while changed or cleared local arrays retain authorship', () => {
  const arrays = new Set(['presentation']);
  const display = overlayProfile(structuredClone(base), base, profile, arrays);
  assert.deepEqual(display.presentation, ['第一点', '第二点']);
  assert.equal(display.fieldEvidence.presentation[0].sources[0].locator, '第2节');
  for (const edited of [[], ['人工修改的示例']]) {
    const item = { ...structuredClone(base), presentation: edited };
    const result = overlayProfile(item, base, profile, arrays);
    assert.deepEqual(result.presentation, edited);
    assert.equal(result.fieldSources.presentation, undefined);
    assert.equal(result.fieldEvidence.presentation, undefined);
    assert.equal(result.summary, '虚构补充摘要');
    assert.deepEqual(item.presentation, edited);
  }
});

test('portable sections retain individual source positions and never borrow attribution for local changes', () => {
  const display = overlayProfile({ ...structuredClone(base), summary: '' }, base, profile, new Set(['presentation']));
  const sections = attributedSections(display, [['summary', '摘要'], ['presentation', '表现']]);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].text, '第一点\n第二点');
  assert.equal(sections[0].evidence[0].scope, 'communication');
  assert.equal(sections[0].evidence[0].sources[0].locator, '第2节');
});
