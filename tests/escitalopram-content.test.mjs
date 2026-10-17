import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { professionalFor } from '../src/content/professional.js';
const knowledge = JSON.parse(await readFile(new URL('../src/content/knowledge.json', import.meta.url), 'utf8'));
const profile = JSON.parse(await readFile(new URL('../src/content/drugProfiles.json', import.meta.url), 'utf8')).escitalopram;
const base = knowledge.drugs.find(d => d.id === 'escitalopram');

test('escitalopram has its own verified Chinese product and pharmacokinetic data', () => {
  const source = profile.sources.find(s => s.id === 'escitalopram-cn-lexapro');
  assert.equal(source.updated, '2025-07-01');
  assert.deepEqual(source.product.approvalNumbers, ['国药准字HJ20150161', '国药准字HJ20150163']);
  assert.equal(profile.regionalReview.status, 'cn_product_verified');
  assert.match(profile.fields.indication.text, /在中国.*抑郁症.*惊恐障碍/);
  assert.match(profile.fields.kinetics.text, /服药后4小时/);
  assert.match(profile.fields.kinetics.text, /半衰期约30小时/);
  assert.match(profile.fields.kinetics.text, /西酞普兰研究/);
  assert.doesNotMatch(profile.fields.interactions.text, /^同西酞普兰[。.]?$/m);
  assert.doesNotMatch(profile.fields.sideEffects.text, /^同西酞普兰[。.]?$/m);
});

test('escitalopram switching and interaction warnings preserve drug-specific distinctions', () => {
  const text = profile.fields.interactions.text;
  assert.match(text, /停这类MAOI至少14天/);
  assert.match(text, /停本药至少7天/);
  assert.match(text, /可逆性、选择性单胺氧化酶A抑制剂至少1天/);
  assert.match(text, /司来吉兰.*谨慎/);
  assert.match(text, /利奈唑胺.*密切临床监测/);
  assert.match(text, /圣约翰草.*不应/);
  assert.doesNotMatch(text, /司来吉兰.{0,30}>\s*10mg|所有.*QT.*不能.*合用/);
  assert.match(text, /CYP2C19抑制剂/);
});

test('escitalopram public safety and pregnancy copy retains scope and help-seeking', () => {
  const effects = profile.fields.sideEffects.text;
  assert.match(effects, /心动过速偶见.*心动过缓罕见/);
  assert.match(effects, /不必等所有表现凑齐/);
  assert.match(profile.fields.specialPopulations.text, /临床资料有限/);
  assert.match(profile.fields.specialPopulations.text, /产前一个月/);
  assert.match(profile.fields.specialPopulations.text, /用药期间停止哺乳/);
  assert.doesNotMatch(effects + profile.fields.contraindications.text, /400\s*mg.*800\s*mg/);
});

test('local escitalopram edits and explicit clearing remain authoritative', () => {
  const edited = professionalFor({ ...base, interactions: '本地人工填写的虚构测试说明。', sideEffects: '' });
  assert.equal(edited.interactions, '本地人工填写的虚构测试说明。');
  assert.equal(edited.sideEffects, '');
  assert.equal(edited.fieldSources.interactions, undefined);
  assert.equal(edited.fieldSources.sideEffects, undefined);
});
