import test from 'node:test';
import assert from 'node:assert/strict';
import knowledge from '../src/content/knowledge.json' with { type: 'json' };
import profiles from '../src/content/drugProfiles.json' with { type: 'json' };
import { professionalFor } from '../src/content/professional.js';

const profile = profiles.fluvoxamine;
const base = knowledge.drugs.find(item => item.id === 'fluvoxamine');
const display = professionalFor(base);

test('fluvoxamine separates the Chinese tablet indication and age from foreign formulations and research ages', () => {
  const source = profile.sources.find(source => source.id === 'fluvoxamine-cn-abbott');
  assert.equal(source.updated, '2025-05-16');
  assert.equal(source.sourceRevision, '3eaf98c40be421b3c4e32b900805c5ec95816c7ee399123a7c9a39bb8f204310');
  assert.deepEqual(source.product.strengths, ['50 mg', '100 mg']);
  assert.deepEqual(source.product.approvalNumbers, ['国药准字HJ20160193（50 mg）', '国药准字HJ20181117（100 mg）']);
  assert.equal(source.product.marketingAuthorisationHolder, 'Abbott Laboratories (Singapore) Private Limited');
  assert.match(display.indication, /说明书列出的用途是抑郁症和强迫症/);
  assert.match(display.specialPopulations, /8岁以上儿童和青少年的强迫症/);
  assert.match(display.specialPopulations, /18岁以下抑郁症.*不推荐/);
  assert.match(display.kinetics, /6～11岁.*不等于批准6岁儿童用药/);
  assert.match(display.indication, /国外缓释胶囊.*不能直接替代中国这款片剂/);
});

test('fluvoxamine retains direction-specific MAOI intervals without inventing a linezolid coadministration exception', () => {
  assert.match(display.interactions, /停不可逆MAOI后2周/);
  assert.match(display.interactions, /停可逆MAOI（如吗氯贝胺、利奈唑胺）1天后/);
  assert.match(display.interactions, /停氟伏沙明至少1周后，才开始MAOI/);
  assert.match(display.interactions, /禁止与.*替扎尼定.*硫利达嗪.*阿洛司琼.*匹莫齐特.*瑞美替昂同时使用/);
  assert.match(display.interactions, /不能把说明书中的转换间隔当作允许同时用药/);
  assert.doesNotMatch(display.interactions, /急需.*可以.*合用|利奈唑胺.*密切监测下合用/);
});

test('fluvoxamine kinetics preserve metabolic food scope, degree of activity and non-linear repeat-dose conditions', () => {
  assert.match(display.kinetics, /完全吸收.*进入全身循环的比例平均约53%/);
  assert.match(display.kinetics, /同时摄入食物不会影响本品的代谢/);
  assert.doesNotMatch(display.kinetics, /食物不会影响本品药代|主要代谢产物没有药理活性/);
  assert.match(display.kinetics, /两种主要代谢产物几乎无药理活性/);
  assert.match(display.kinetics, /单次服用.*13～15小时.*多次服用.*17～22小时.*10～14天/);
  assert.match(display.kinetics, /服药间隔内仍会有起伏/);
  assert.match(display.kinetics, /多次用药达到稳态后.*高于由单次数据推算.*较高日剂量/);
});

test('fluvoxamine interactions retain distinct clearance pathways and start-stop monitoring', () => {
  assert.match(display.interactions, /阿普唑仑.*清除变慢/);
  assert.match(display.interactions, /劳拉西泮、奥沙西泮、替马西泮的清除受影响较小.*不能据此保证没有困倦/);
  assert.match(display.interactions, /华法林.*开始或停用氟伏沙明都需要核对监测/);
  assert.match(display.interactions, /咖啡因浓度升高/);
  assert.match(display.interactions, /吸烟者.*代谢可能较快.*不能靠吸烟来调整/);
  assert.doesNotMatch(display.interactions, /浓度减少25%|浓度下降25%|瑞美替昂使氟伏沙明/);
});

test('fluvoxamine retains Chinese lactation prohibition and immediate public safety actions', () => {
  assert.match(display.specialPopulations, /哺乳期妇女禁用/);
  assert.match(display.specialPopulations, /婴儿血药浓度较低.*不能替代这一具体产品要求/);
  assert.match(display.contraindications, /眼痛或视力突然变化应立即就医评估/);
  assert.match(display.sideEffects, /面唇舌肿胀或呼吸困难，应立即寻求急救/);
  assert.match(display.monitoring, /有低钠风险者/);
  assert.doesNotMatch(display.monitoring, /高低钠风险者/);
  assert.match(display.monitoring, /漏服.*不自行叠加补服/);
  assert.match(display.monitoring, /虚构例子.*困倦是否与药物有关、怎样处理，仍需.*医生评估/);
});

test('fluvoxamine professional supplement respects local rewritten and explicitly cleared text', () => {
  const local = professionalFor({ ...base, interactions: '用户另写的虚构测试文字', sideEffects: '' });
  assert.equal(local.interactions, '用户另写的虚构测试文字');
  assert.equal(local.sideEffects, '');
  assert.equal(local.fieldSources.interactions, undefined);
  assert.equal(local.fieldSources.sideEffects, undefined);
});
