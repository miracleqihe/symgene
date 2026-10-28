import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import profiles from '../src/content/caseProfiles.json' with { type: 'json' };
import { seedData } from '../src/data.js';
import { caseFor, attributedCaseBody, caseLinks } from '../src/content/cases.js';
import { medicalPoints } from '../src/content/medicalText.js';
import { teachingPrompt } from '../src/content/reading.js';

test('case supplements attribute every point and keep fictional events distinct from clinical sources', () => {
  for (const [id, profile] of Object.entries(profiles)) {
    assert.ok(seedData.cases.some(item => item.id === id));
    const sources = new Map(profile.sources.map(source => [source.id, source]));
    assert.match(profile.fields.summary.text, /虚构/);
    assert.ok(profile.fields.summary.refs.some(ref => sources.get(ref)?.kind === 'fiction'));
    for (const [field, value] of Object.entries(profile.fields)) {
      const points = medicalPoints(value.text);
      assert.equal(value.evidence.length, points.length, `${id}.${field}`);
      for (const ref of value.refs) assert.ok(sources.has(ref) && (value.locations?.[ref] || sources.get(ref).locator));
      points.forEach((_, index) => {
        const matches = value.evidence.filter(evidence => evidence.pointIndex === index);
        assert.equal(matches.length, 1, `${id}.${field}[${index}]`);
        assert.ok(matches[0].refs.length);
        for (const ref of matches[0].refs) assert.ok(sources.has(ref) && (matches[0].locations?.[ref] || sources.get(ref).locator));
      });
    }
  }
});

test('the depression teaching case carries Chinese assessment evidence and the same portable body', async () => {
  const item = seedData.cases.find(item => item.id === 'case-depression-01');
  const display = caseFor(item);
  assert.equal(display.title, item.title);
  assert.equal(display.disorderId, item.disorderId);
  assert.ok(display.fieldSources.assessmentFocus.some(source => source.id === 'nhc-disorders-2020' && source.region === '中国大陆'));
  assert.match(display.conversation, /陪伴者可以这样开口/);
  assert.match(display.conversation, /当事人向专业人员开口时/);
  const prompt = teachingPrompt('cases', item, seedData);
  const material = await readFile(new URL('../public/teaching/cases/case-depression-01.md', import.meta.url), 'utf8');
  for (const section of attributedCaseBody(item)) for (const point of medicalPoints(section.text)) {
    assert.ok(prompt.includes(`- ${point}`));
    assert.ok(material.includes(point));
  }
  assert.ok(caseLinks(item)[0].region.startsWith('中国大陆'));
  assert.ok(caseLinks(item).every(link => new URL(link.url).protocol === 'https:'));
  const edited = { ...item, presentation: ['用户自行修改的虚构示例'] };
  assert.deepEqual(caseFor(edited).presentation, edited.presentation);
  assert.equal(caseFor(edited).fieldSources.presentation, undefined);
});
