import test from 'node:test';
import assert from 'node:assert/strict';
import knowledge from '../src/content/knowledge.json' with { type: 'json' };
import profiles from '../src/content/disorderProfiles.json' with { type: 'json' };
import { disorderFor } from '../src/content/disorders.js';
import { medicalPoints } from '../src/content/medicalText.js';

const profile = profiles.depression;
const base = knowledge.disorders.find(item => item.id === 'depression');
const display = disorderFor(base);

test('depression uses the identified Chinese framework and precise assessment and bipolar locations', () => {
  const source = profile.sources.find(source => source.id === 'nhc-depression-2020');
  assert.equal(source.updated, '2020');
  assert.equal(source.sourceRevision, 'a789d0b61f34d6724d383ad5ac3ffa01064f8c83e88722ebb5031b426c62a8cc');
  assert.match(source.locator, /PDF146/);
  assert.match(profile.fields.details.evidence[1].locations[source.id], /PDF161/);
  assert.match(profile.fields.differentials.evidence[0].locations[source.id], /PDF146/);
  assert.equal(profile.sources.find(source => source.format === 'epub').sourceRevision,
    '99b1a73b67d3ed41733a250fcbb36079627d422f0289e6a4958bfd052713805f');
});

test('depression duration and reduced sleep need never become single-item diagnoses or waiting rules', () => {
  const course = display.courseClues.join('\n');
  const differential = display.differentials[0];
  assert.match(course, /至少两周/);
  assert.match(course, /不是低落满两周就能确诊/);
  assert.match(course, /不需要等满两周/);
  assert.match(differential, /睡眠需要减少/);
  assert.match(differential, /想睡却睡不着/);
  assert.match(differential, /不能单独确定双相/);
});

test('depression explains distinct stimulation treatments with their medical conditions and sources', () => {
  const point = display.treatmentOverview[3];
  assert.match(point, /改良电抽搐治疗/);
  assert.match(point, /重复经颅磁刺激/);
  assert.match(point, /全身麻醉/);
  assert.match(point, /肌肉松弛/);
  assert.match(point, /监测/);
  assert.match(point, /磁脉冲/);
  const evidence = profile.fields.treatmentOverview.evidence[3];
  assert.ok(evidence.refs.includes('nhc-depression-2020'));
  assert.ok(evidence.refs.includes('nimh-brain-stimulation-2024'));
});

test('depression urgent-help copy distinguishes timely evaluation from immediate danger', () => {
  const points = medicalPoints(profile.fields.emergencySignals.text);
  assert.match(points[0], /立即联系当地急救|立即.*当地急救/);
  assert.match(points[0], /就近急诊/);
  assert.match(points[0], /不需要先.*整理完整/);
  assert.match(points[1], /及时医疗评估/);
  assert.match(points[1], /生命危险或无法维持当下安全/);
  const evidence = profile.fields.emergencySignals.evidence[0];
  assert.ok(evidence.refs.includes('who-immediate-support-2026'));
  assert.ok(evidence.refs.includes('nhc-crisis-communication-2021'));
});

test('depression fictional comparison and cause discussion retain their limited meaning', () => {
  assert.match(display.courseClues[1], /虚构/);
  assert.match(display.courseClues[1], /不能.*诊断/);
  assert.ok(profile.fields.courseClues.evidence[1].refs.some(id => profile.sources.find(source => source.id === id)?.kind === 'fiction'));
  assert.match(display.details, /不能凭一项化验/);
  assert.match(display.details, /确定一个人的抑郁病因/);
});
