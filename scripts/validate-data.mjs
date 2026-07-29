import { cloneSeed } from '../src/data.js';
import { matchKnowledge } from '../src/search.js';

const data = cloneSeed();
const disorderFields = [
  'id', 'name', 'aliases', 'category', 'summary', 'details', 'symptoms', 'patientPhrases',
  'courseClues', 'functionalImpact', 'assessment', 'differentials', 'treatmentOverview',
  'emergencySignals', 'relatedDrugIds', 'source'
];
const caseFields = [
  'id', 'disorderId', 'title', 'stage', 'tags', 'summary', 'presentation', 'timeline',
  'functionImpact', 'riskSignals', 'assessmentFocus', 'differentialClues', 'safetyNote', 'source'
];

function duplicateIds(items) {
  const seen = new Set();
  return items.map((item) => item.id).filter((id) => seen.has(id) || !seen.add(id));
}

function missingFields(items, fields) {
  return items.flatMap((item) => fields
    .filter((field) => item[field] === undefined || item[field] === null || item[field] === '')
    .map((field) => `${item.id}:${field}`));
}

const disorderIds = new Set(data.disorders.map((item) => item.id));
const drugIds = new Set(data.drugs.map((item) => item.id));
const caseDisorderIds = new Set(data.cases.map((item) => item.disorderId));
const problems = {
  missingDisorderFields: missingFields(data.disorders, disorderFields),
  missingCaseFields: missingFields(data.cases, caseFields),
  duplicateDisorders: duplicateIds(data.disorders),
  duplicateCases: duplicateIds(data.cases),
  orphanCases: data.cases.filter((item) => !disorderIds.has(item.disorderId)).map((item) => item.id),
  disordersWithoutCases: data.disorders.filter((item) => !caseDisorderIds.has(item.id)).map((item) => item.id),
  unsafePublicResources: data.resources
    .filter((item) => /(?:^|[\\/])raw[\\/]|\.pdf(?:$|[?#])/i.test(item.url || ''))
    .map((item) => `${item.id}:${item.url}`),
  invalidDrugLinks: data.disorders.flatMap((item) => (item.relatedDrugIds || [])
    .filter((id) => !drugIds.has(id))
    .map((id) => `${item.id}->${id}`))
};

const regressions = [
  ['连续几天不睡还特别有劲，花很多钱', 'bipolar'],
  ['脑子里有人说话，觉得有人跟踪我', 'schizophrenia'],
  ['有时清楚有时糊涂，总看见屋里有人，睡觉还会打人', 'lewy-body-neurocognitive'],
  ['前段时间发烧后胡言乱语，现在记忆和动作异常', 'encephalitis-related-mental'],
  ['没吃饭后手抖出汗突然糊涂', 'hypoglycemia-related-mental'],
  ['必须有人陪才敢出门，离家远就害怕', 'agoraphobia'],
  ['在家说话很多，在学校一句也说不出', 'selective-mutism'],
  ['反复拔头发和眉毛停不下来', 'trichotillomania'],
  ['世界像隔着玻璃不真实，但我知道只是感觉', 'depersonalization-derealization'],
  ['噎过以后不敢吃，不是怕胖', 'arfid'],
  ['打呼噜会停住不呼吸，白天开车犯困', 'obstructive-sleep-apnea'],
  ['一躺下腿里像有虫爬，走动才缓解', 'restless-legs'],
  ['不是缺钱也想偷，偷完才放松', 'kleptomania'],
  ['每次月经前情绪崩溃，来月经后就恢复', 'premenstrual-dysphoric'],
  ['几乎每天都很易怒，小事就严重发脾气', 'disruptive-mood-dysregulation'],
  ['孩子系鞋带总学不会，写字特别慢还累', 'developmental-coordination'],
  ['老师说长一点的指令就听不懂，但不是不专心', 'language-disorder'],
  ['总把反话当真，聊天也不知道什么时候该停', 'social-pragmatic-communication'],
  ['有几个音一直发不准，别人听不清', 'speech-sound-disorder'],
  ['一开口第一个字就卡住，怕口吃不敢接电话', 'childhood-onset-fluency'],
  ['孩子晚上总尿床，还因为怕被同学知道不敢过夜', 'enuresis'],
  ['怕痛一直憋大便，内裤总是弄脏', 'encopresis'],
  ['孩子摔倒受伤也不找熟悉的大人安慰', 'reactive-attachment'],
  ['在商场见陌生人就牵手跟走', 'disinhibited-social-engagement'],
  ['噪声一大就反复摇身体撞头', 'stereotypic-movement'],
  ['后半夜梦里挥拳，醒来记得梦还打伤了伴侣', 'rem-sleep-behavior'],
  ['前半夜睡着后走到楼梯，第二天完全不记得', 'non-rem-arousal'],
  ['每天做同一个噩梦，害怕睡觉', 'nightmare-disorder'],
  ['最近心跳快怕热手抖又睡不着', 'thyroid-related-mental'],
  ['加大激素后几天不睡还觉得被监视', 'corticosteroid-induced-mental'],
  ['多发性硬化复发后脑子变慢又特别疲劳', 'multiple-sclerosis-neuropsychiatric'],
  ['HIV 治疗后工作速度越来越慢，注意力差', 'hiv-associated-neurocognitive'],
  ['肝硬化后白天睡晚上乱，突然认不得人', 'hepatic-encephalopathy'],
  ['透析前脑子糊涂，手脚抽动说话乱', 'uremic-encephalopathy'],
  ['生孩子后一直低落，孩子睡了自己也睡不着', 'perinatal-depression'],
  ['产后几天不睡还听到声音，觉得孩子被替换', 'postpartum-psychosis'],
  ['吃抗抑郁药后性欲和高潮明显下降', 'sexual-dysfunction']
];

const failedRegressions = regressions.flatMap(([query, expected]) => {
  const result = matchKnowledge(query, data);
  const actual = result.disorders[0]?.item.id;
  console.log(`${actual === expected ? 'PASS' : 'FAIL'}  ${query} -> ${result.disorders.slice(0, 3).map(({ item }) => item.name).join(' | ')}`);
  return actual === expected ? [] : [`${query}: expected ${expected}, received ${actual || 'none'}`];
});

const critical = matchKnowledge('我已经准备好刀，打算伤人后自杀', data);
if (critical.risk?.level !== 'critical' || critical.disorders.length || critical.cases.length || critical.drugs.length) {
  failedRegressions.push('critical-risk queries must suppress knowledge results');
}

const infantCritical = matchKnowledge('产后听到声音命令我伤害婴儿', data);
if (infantCritical.risk?.level !== 'critical' || infantCritical.disorders.length || infantCritical.cases.length || infantCritical.drugs.length) {
  failedRegressions.push('infant-harm queries must suppress knowledge results');
}

console.log('\nCounts:', {
  drugs: data.drugs.length,
  disorders: data.disorders.length,
  cases: data.cases.length,
  resources: data.resources.length
});

const failures = [...Object.values(problems).flat(), ...failedRegressions];
if (failures.length) {
  console.error('\nValidation failed:', failures);
  process.exitCode = 1;
} else {
  console.log('\nData and search validation passed.');
}
