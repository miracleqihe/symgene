import test from 'node:test';
import assert from 'node:assert/strict';
import knowledge from '../src/content/knowledge.json' with { type: 'json' };
import profiles from '../src/content/drugProfiles.json' with { type: 'json' };
import { professionalFor } from '../src/content/professional.js';
import { teachingPrompt, readingVersion } from '../src/content/reading.js';

const profile = profiles.bupropion;
const base = knowledge.drugs.find(item => item.id === 'bupropion');
const display = professionalFor(base);

test('bupropion scopes the Chinese holder label to the once-daily II product and keeps smoking support distinct', () => {
  const source = profile.sources.find(s => s.id === 'bupropion-cn-anbison-ii');
  assert.equal(source.kind, 'label');
  assert.equal(source.updated, '2023-10-10');
  assert.equal(source.sourceRevision, '69387da9cf4be1765bf9cc3648c25542425eb37734fa00ead3d35158d24f67f9');
  assert.equal(source.product.marketingAuthorisationHolder, '上海安必生制药技术有限公司');
  assert.equal(source.product.manufacturer, '石药集团欧意药业有限公司');
  assert.deepEqual(source.product.approvalNumbers, ['国药准字H20233150', '国药准字H20233151']);
  assert.equal(profile.regionalReview.status, 'cn_product_verified');
  assert.match(display.indication, /舒安菲.*（Ⅱ）.*治疗抑郁症/);
  assert.match(display.indication, /悦亭.*辅助戒烟/);
  assert.match(display.indication, /不意味着舒安菲Ⅱ型也获批用于戒烟|不等于舒安菲Ⅱ型.*获批.*戒烟/);
});

test('bupropion keeps the two MAOI directions and makes emergency exception a medical decision', () => {
  assert.match(display.interactions, /这类抗抑郁药转为本品.*至少间隔14天/);
  assert.match(display.interactions, /本品转为这类抗抑郁药.*至少间隔14天/);
  const emergency = display.interactions.split('\n').find(s => s.includes('静脉亚甲蓝'));
  assert.match(emergency, /高血压/);
  assert.match(emergency, /无可接受替代.*获益超过.*风险/);
  assert.match(emergency, /医生/);
  assert.doesNotMatch(emergency, /24小时后.*自行|低剂量.*安全/);
});

test('bupropion separates CYP2B6 and CYP2D6 effects, active conversion and antiviral induction', () => {
  assert.match(display.kinetics, /CYP2B6.*羟基安非他酮/);
  assert.match(display.interactions, /抑制CYP2D6.*清除减慢/);
  assert.match(display.interactions, /他莫昔芬.*减少.*转化.*降低疗效/);
  assert.match(display.interactions, /利托那韦.*依法韦仑.*降低.*暴露量/);
  assert.match(display.interactions, /安非他明快速筛查.*更特异.*确认/);
  assert.doesNotMatch(display.interactions, /CYP3A2/);
});

test('bupropion retains its own child, lactation and renal requirements rather than another drug template', () => {
  assert.match(display.specialPopulations, /18岁以下.*安全性、有效性尚未确立/);
  assert.match(display.specialPopulations, /服用期间不要母乳喂养/);
  assert.match(display.specialPopulations, /低于90 mL\/min.*考虑减少/);
  assert.doesNotMatch(display.specialPopulations, /18岁以下.*绝对禁用|FDA.*C级/);
  assert.match(display.specialPopulations, /不能把相关性直接说成一定致畸/);
  assert.match(display.specialPopulations, /不能用某一项未见增加的研究保证安全/);
  assert.match(display.kinetics, /不溶性外壳.*不能.*没有吸收.*不能.*补服/);
});

test('bupropion distinguishes contraindications from risk factors and avoids dose-threshold or overdose reassurance', () => {
  assert.match(display.contraindications, /既往.*贪食症或神经性厌食症/);
  assert.match(display.contraindications, /低血糖.*低钠/);
  assert.match(display.contraindications, /可能增加发作风险.*需要专业评估/);
  assert.match(display.contraindications, /糖尿病.*自行停药/);
  assert.match(display.sideEffects, /癫痫发作后停用.*不重新开始/);
  assert.match(display.contraindications, /漏服不要加倍补服或缩短间隔/);
  assert.match(display.contraindications, /怀疑误服过量.*立即.*不等/);
  assert.doesNotMatch(display.contraindications, /小于450.*安全|观察18小时.*安全|在家.*给予活性炭/);
});

test('bupropion portable pack includes the displayed article, fictional consultation, and local edit precedence', () => {
  const pack = teachingPrompt('drugs', base, knowledge);
  for (const field of Object.values(profile.fields)) {
    for (const point of field.text.split('\n')) assert.ok(pack.includes(point));
  }
  assert.ok(pack.includes(readingVersion));
  assert.match(pack, /不要求我访问网站才能交流/);
  assert.match(display.monitoring, /虚构.*小宁/);
  assert.doesNotMatch(pack, /精神药物手册|MD\d{3}|候选证据|待核问题|[A-Z]:\\/);
  const local = professionalFor({ ...base, interactions: '本地虚构测试内容', sideEffects: '' });
  assert.equal(local.interactions, '本地虚构测试内容');
  assert.equal(local.sideEffects, '');
  assert.equal(local.fieldSources.interactions, undefined);
  assert.equal(local.fieldSources.sideEffects, undefined);
});
