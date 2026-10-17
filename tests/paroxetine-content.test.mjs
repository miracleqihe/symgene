import test from 'node:test';
import assert from 'node:assert/strict';
import knowledge from '../src/content/knowledge.json' with { type: 'json' };
import profiles from '../src/content/drugProfiles.json' with { type: 'json' };
import { professionalFor } from '../src/content/professional.js';
import { teachingPrompt, readingVersion } from '../src/content/reading.js';

const profile = profiles.paroxetine;
const base = knowledge.drugs.find(item => item.id === 'paroxetine');
const display = professionalFor(base);

test('paroxetine separates Chinese ordinary and controlled-release products and does not upgrade a hospital transcription to a verified label', () => {
  const source = profile.sources.find(s => s.id === 'paroxetine-cn-hospital-transcription');
  assert.equal(source.updated, '2023-05-12');
  assert.equal(source.kind, 'public_guide');
  assert.equal(source.sourceRevision, '7dfdeff5edc48308e195a42f23eebb83fd58e36db36d511ff01120e9d5bbb36e');
  assert.deepEqual(source.product.approvalNumbers, ['国药准字H20031106']);
  assert.equal(profile.regionalReview.status, 'cn_status_unverified');
  assert.deepEqual(profile.regionalReview.productSourceIds, []);
  assert.match(display.indication, /普通片.*乐友20 mg/);
  assert.match(display.indication, /肠溶缓释片.*用途是抑郁症/);
  assert.match(display.indication, /海外.*不等于.*中国产品已获批/);
});

test('paroxetine retains its own two-direction MAOI interval rather than another SSRI interval', () => {
  assert.match(display.interactions, /结束MAOI治疗后两周内不得开始帕罗西汀/);
  assert.match(display.interactions, /结束帕罗西汀治疗后两周内也不得开始MAOI/);
  assert.match(display.interactions, /利奈唑胺和亚甲蓝.*不能.*同时使用/);
  assert.match(display.interactions, /不是允许同时服用/);
  assert.doesNotMatch(display.interactions, /停.*MAOI.*1天后|密切监测下合用/);
});

test('paroxetine preserves opposite CYP2D6 effects and precise handbook references', () => {
  assert.match(display.interactions, /抑制.*代谢酶.*美托洛尔.*浓度升高/);
  assert.match(display.interactions, /他莫昔芬.*活性代谢物.*转化减少.*降低治疗获益/);
  const location = profile.fields.interactions.evidence[3].locations['paroxetine-handbook'];
  assert.match(location, /766贯叶连翘.*773曲坦/);
  assert.doesNotMatch(display.interactions, /羟色胺酸/);
});

test('paroxetine keeps product-specific child and lactation restrictions and distinct withdrawal assessment', () => {
  assert.match(display.specialPopulations, /不可用于18岁以下/);
  assert.match(display.specialPopulations, /只有母亲预期受益大于婴儿可能风险/);
  assert.doesNotMatch(display.specialPopulations, /哺乳期妇女禁用|婴儿血药浓度低.*可以放心用药/);
  assert.match(display.contraindications, /停药反应与复发/);
  assert.match(display.contraindications, /不能全归为停药反应/);
  assert.match(display.kinetics, /每日30 mg连续服用30天.*21小时/);
  assert.match(display.kinetics, /达到稳态不能.*治疗效果/);
});

test('paroxetine urgent actions do not require every listed symptom to appear', () => {
  const urinary = display.sideEffects.split('\n').find(line => line.includes('下腹剧痛'));
  assert.match(urinary, /尿不出或下腹剧痛.*立即就医/);
  assert.match(urinary, /不必同时出现/);
  assert.match(display.sideEffects, /不必等这些表现全部出现才求助/);
  assert.match(display.contraindications, /怀疑过量.*立即.*不要等待症状出现/);
  const urinaryEvidence = profile.fields.sideEffects.evidence[4];
  assert.match(urinaryEvidence.scopeDetails, /不证明本药造成个人症状/);
  const pphnEvidence = profile.fields.specialPopulations.evidence[3];
  assert.match(pphnEvidence.scopeDetails, /PPHN定义另归NHLBI/);
});

test('paroxetine portable pack includes displayed points, respects local edits, and omits private book inventories', () => {
  const pack = teachingPrompt('drugs', base, knowledge);
  for (const field of Object.values(profile.fields)) {
    for (const line of field.text.split('\n')) assert.ok(pack.includes(line));
  }
  assert.ok(pack.includes(readingVersion));
  assert.match(pack, /不要求我访问网站才能交流/);
  assert.doesNotMatch(pack, /精神药物手册|全文OCR|MD\d{3}|[A-Z]:\\/);
  const edited = professionalFor({ ...base, interactions: '本地另写的虚构测试', sideEffects: '' });
  assert.equal(edited.interactions, '本地另写的虚构测试');
  assert.equal(edited.sideEffects, '');
  assert.equal(edited.fieldSources.interactions, undefined);
  assert.equal(edited.fieldSources.sideEffects, undefined);
});
