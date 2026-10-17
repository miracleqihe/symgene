import test from 'node:test';
import assert from 'node:assert/strict';
import knowledge from '../src/content/knowledge.json' with { type: 'json' };
import profiles from '../src/content/drugProfiles.json' with { type: 'json' };
import { professionalFor } from '../src/content/professional.js';

const profile = profiles.fluoxetine;
const base = knowledge.drugs.find(item => item.id === 'fluoxetine');
const display = professionalFor(base);

test('fluoxetine distinguishes its Chinese capsule approval from research and foreign indications', () => {
  const source = profile.sources.find(source => source.id === 'fluoxetine-cn-lilly');
  assert.equal(source.updated, '2025-02-05');
  assert.equal(source.url, 'https://www.lillymedical.cn/zh-cn/cns/Prozac');
  assert.equal(source.sourceRevision, 'a099317c7cbe0572b683cc2dc1f74321d13833c2299c36a012ee1b68534dd9b7');
  assert.deepEqual(source.product.approvalNumbers, ['国药准字HJ20160501', '国药准字HJ20181215']);
  assert.deepEqual(source.product.strengths, ['20mg（以氟西汀计）']);
  assert.match(display.indication, /在中国.*抑郁症、强迫症和神经性贪食症/);
  assert.match(display.indication, /心理治疗的辅助/);
  assert.match(display.specialPopulations, /中国这款产品.*18岁以下.*不推荐/);
  assert.match(display.specialPopulations, /说明书同时收录儿科研究，不等于中国已经批准/);
});

test('fluoxetine retains the two MAOI directions and separates urgent-treatment restrictions', () => {
  assert.match(display.interactions, /停用MAOI后14天内禁止开始氟西汀/);
  assert.match(display.interactions, /停用氟西汀后5周内禁止开始MAOI/);
  assert.match(display.interactions, /利奈唑胺和静脉注射亚甲蓝需要特别处理/);
  assert.match(display.interactions, /这不是让患者自己停药后随意搭配/);
  assert.match(display.interactions, /对CYP3A4的抑制不太可能具有临床意义/);
  assert.match(display.interactions, /他莫昔芬.*尽量避免使用氟西汀/);
});

test('fluoxetine kinetics preserve study conditions and do not become a self-directed dosing rule', () => {
  assert.match(display.kinetics, /单次口服40mg研究中，约6～8小时/);
  assert.match(display.kinetics, /急性给药后约为1～3天，长期给药后约为4～6天/);
  assert.match(display.kinetics, /去甲氟西汀约为4～16天/);
  assert.match(display.kinetics, /不能直接转换成这款每日使用胶囊的服法/);
  assert.match(display.monitoring, /长半衰期.*不等于所有人都能突然停药/);
});

test('fluoxetine safety copy preserves individual context, lactation weighing and urgent eye assessment', () => {
  assert.match(display.specialPopulations, /分娩前一个月.*产后出血风险/);
  assert.match(display.specialPopulations, /不是笼统规定所有人不能哺乳/);
  assert.match(display.specialPopulations, /体重增加不足/);
  assert.match(display.contraindications, /突发明显眼痛或突然视物模糊，应立即就医/);
  assert.match(display.sideEffects, /个案当成常见发生率/);
  const edited = professionalFor({ ...base, interactions: '用户修改的虚构示例', sideEffects: '' });
  assert.equal(edited.interactions, '用户修改的虚构示例');
  assert.equal(edited.sideEffects, '');
  assert.equal(edited.fieldSources.interactions, undefined);
  assert.equal(edited.fieldAmendments?.interactions, undefined);
  assert.equal(edited.fieldAmendments?.sideEffects, undefined);
});
