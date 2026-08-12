import assert from 'node:assert/strict';
import test from 'node:test';
import { matchKnowledge } from '../src/search.js';

function makeSearchData(overrides = {}) {
  return {
    drugs: [
      { id: 'sertraline', name: '舍曲林', aliases: 'Sertraline · 左洛复', categoryLabel: 'SSRI', className: '抗抑郁药' },
      { id: 'fluoxetine', name: '氟西汀', aliases: ['Fluoxetine', '百忧解'], categoryLabel: 'SSRI', className: '抗抑郁药' },
      { id: 'mirtazapine', name: '米氮平', aliases: null, categoryLabel: 'NaSSA', className: '抗抑郁药' }
    ],
    disorders: [
      {
        id: 'depression',
        name: '抑郁障碍',
        aliases: ['抑郁发作'],
        category: '心境障碍',
        patientPhrases: ['逐渐不想见人并停止社交'],
        symptoms: ['早醒后白天难以工作'],
        summary: '来访者持续三个月都很累并减少活动，也可出现持续疲惫。',
        relatedDrugIds: ['sertraline']
      },
      {
        id: 'gad',
        name: 'Generalized Anxiety Disorder',
        aliases: ['GAD'],
        category: 'Anxiety disorders',
        summary: 'Persistent worry and tension.',
        relatedDrugIds: []
      }
    ],
    cases: [
      {
        id: 'case-depression',
        disorderId: 'depression',
        title: '疲惫与社交退缩',
        tags: ['持续疲惫'],
        summary: '相似案例中也有持续疲惫和活动减少。',
        presentation: ['早醒'],
        stage: '初步评估'
      }
    ],
    resources: [],
    ...overrides
  };
}

const EMPTY_RESULT = {
  risk: null,
  disorders: [],
  cases: [],
  drugs: [],
  directDrugHint: false
};

test('空字符串返回完整空结构', () => {
  assert.deepEqual(matchKnowledge('', makeSearchData()), EMPTY_RESULT);
});

test('纯空格返回完整空结构', () => {
  assert.deepEqual(matchKnowledge('   \t ', makeSearchData()), EMPTY_RESULT);
});

for (const [label, separator] of [
  ['中文逗号', '，'],
  ['中文句号', '。'],
  ['中文问号', '？'],
  ['英文逗号', ','],
  ['多个空格', '   ']
]) {
  test(`${label}保留分词能力`, () => {
    const result = matchKnowledge(`三个月都很累${separator}不想见人`, makeSearchData());
    assert.equal(result.disorders[0]?.item.id, 'depression');
    assert.ok(result.disorders[0].hits.includes('三个月都很累'));
    assert.ok(result.disorders[0].hits.includes('不想见人'));
  });
}

test('英文大小写不影响疾病匹配', () => {
  const result = matchKnowledge('GENERALIZED ANXIETY DISORDER', makeSearchData());
  assert.equal(result.disorders[0]?.item.id, 'gad');
});

test('药物短查询会显示药物名称提示', () => {
  assert.equal(matchKnowledge('舍曲林', makeSearchData()).directDrugHint, true);
});

test('包含药物名称的完整句会显示药物名称提示', () => {
  assert.equal(matchKnowledge('吃舍曲林后睡不着怎么办', makeSearchData()).directDrugHint, true);
});

test('不包含药物名称的查询不会误报提示', () => {
  assert.equal(matchKnowledge('最近三个月总是很累，早醒，不想见人', makeSearchData()).directDrugHint, false);
});

test('字符串形式的药物别名可被识别', () => {
  assert.equal(matchKnowledge('最近开始服用左洛复', makeSearchData()).directDrugHint, true);
});

test('数组形式的药物别名可被识别', () => {
  assert.equal(matchKnowledge('百忧解需要注意什么', makeSearchData()).directDrugHint, true);
});

test('英文药物别名识别不受大小写影响', () => {
  assert.equal(matchKnowledge('Taking SERTRALINE now', makeSearchData()).directDrugHint, true);
});

for (const [label, aliases, query] of [
  ['中点', 'Sertraline · 左洛复', '左洛复'],
  ['中文逗号', 'Sertraline，左洛复', '左洛复'],
  ['英文逗号', 'Sertraline, Zoloft', 'Zoloft']
]) {
  test(`${label}分隔的字符串别名可独立识别`, () => {
    const data = makeSearchData({
      drugs: [{ id: 'sertraline', name: '舍曲林', aliases }]
    });
    assert.equal(matchKnowledge(`正在服用${query}`, data).directDrugHint, true);
  });
}

test('空字符串别名不会产生药物误报', () => {
  const data = makeSearchData({ drugs: [{ id: 'test-drug', name: '测试药物', aliases: '' }] });
  assert.equal(matchKnowledge('最近总是早醒', data).directDrugHint, false);
});

test('空数组别名不会产生药物误报', () => {
  const data = makeSearchData({ drugs: [{ id: 'test-drug', name: '测试药物', aliases: [] }] });
  assert.equal(matchKnowledge('最近总是早醒', data).directDrugHint, false);
});

test('别名数组中的空元素不会产生药物误报', () => {
  const data = makeSearchData({ drugs: [{ id: 'test-drug', name: '测试药物', aliases: ['', null, '   '] }] });
  assert.equal(matchKnowledge('最近总是早醒', data).directDrugHint, false);
});

test('只有宽泛药物分类词时不会触发直接药物提示', () => {
  assert.equal(matchKnowledge('抗抑郁药和SSRI有什么区别', makeSearchData()).directDrugHint, false);
});

for (const [label, query] of [
  ['当前自伤或自杀', '我现在想自杀，同时持续疲惫'],
  ['当前同义表达“想死”', '我现在想死，同时持续疲惫'],
  ['持有手段的伤人或暴力', '我想拿刀伤人，同时持续疲惫'],
  ['急性躯体或中毒', '持续疲惫，服药过量后意识不清']
]) {
  test(`${label}严重风险抑制所有普通结果`, () => {
    const result = matchKnowledge(query, makeSearchData());
    assert.equal(result.risk?.level, 'critical');
    assert.deepEqual(result.disorders, []);
    assert.deepEqual(result.cases, []);
    assert.deepEqual(result.drugs, []);
  });
}

test('未确认当前行动的本人风险表达降为 warning 并保留普通结果', () => {
  const result = matchKnowledge('我想死，同时持续疲惫', makeSearchData());
  assert.equal(result.risk?.level, 'warning');
  assert.equal(result.risk?.needsClarification, true);
  assert.equal(result.disorders[0]?.item.id, 'depression');
});

test('明确否定只排除所在风险事件', () => {
  assert.equal(matchKnowledge('我没有自杀想法', makeSearchData()).risk, null);
});

for (const [label, query, expectedContext] of [
  ['过去且当前安全', '十年前想过自杀，现在很安全', 'past-safe'],
  ['没有当前性的第三人称', '他说他想自杀', 'other-person'],
  ['条件或假设', '如果有人想自杀应该怎么办', 'hypothetical']
]) {
  test(`${label}风险表达提供 guidance 而不冒充即时危险`, () => {
    const risk = matchKnowledge(query, makeSearchData()).risk;
    assert.equal(risk?.level, 'guidance');
    assert.equal(risk?.events[0]?.context, expectedContext);
  });
}

test('常见“睡不醒”表达不会仅凭“不醒”触发急性中毒风险', () => {
  assert.equal(matchKnowledge('每天都睡不醒', makeSearchData()).risk, null);
});

test('真正叫不醒仍保持急性风险', () => {
  assert.equal(matchKnowledge('怎么叫都不醒', makeSearchData()).risk?.level, 'critical');
});

test('第三人称当前急性身体危险仍直接升级 critical', () => {
  assert.equal(matchKnowledge('他现在正在抽搐', makeSearchData()).risk?.level, 'critical');
});

test('条件句中已经发生的吞药危险仍直接升级 critical', () => {
  assert.equal(matchKnowledge('如果朋友已经吞了很多药怎么办', makeSearchData()).risk?.level, 'critical');
});

test('新闻或科普语境不会因具体危险词冒充现场急症', () => {
  const risk = matchKnowledge('新闻报道有人拿刀伤人', makeSearchData()).risk;
  assert.equal(risk?.level, 'guidance');
  assert.ok(risk?.events.every((event) => event.context === 'reported-or-educational'));
});

test('被否定的自杀片段不会掩盖同句已经发生的服药过量', () => {
  const risk = matchKnowledge('我没有自杀想法，但是刚刚吞了几十片安眠药', makeSearchData()).risk;
  assert.equal(risk?.level, 'critical');
  assert.deepEqual(risk?.labels, ['急性躯体/中毒风险']);
  assert.equal(risk?.events[0]?.term, '疑似服药过量');
});

test('否定词不能跨越“放弃”错误消除当前自杀计划', () => {
  assert.equal(matchKnowledge('我没有放弃自杀计划', makeSearchData()).risk?.level, 'critical');
});

test('前一个被否定的同类事件不能掩盖后一个当前事件', () => {
  const risk = matchKnowledge('我没有自杀想法，但是我现在想死', makeSearchData()).risk;
  assert.equal(risk?.level, 'critical');
  assert.equal(risk?.events.length, 1);
  assert.equal(risk?.events[0]?.term, '想死');
});

test('既往安全的自杀片段不会掩盖同句当前伤人计划', () => {
  const risk = matchKnowledge('十年前想过自杀，现在很安全，但是我正要拿刀伤人', makeSearchData()).risk;
  assert.equal(risk?.level, 'critical');
  assert.ok(risk?.events.some((event) => event.type === 'violence' && event.level === 'critical'));
});

for (const [label, query] of [
  ['常见错别字', '我想自沙'],
  ['未收录近义表达', '我想结束生命'],
  ['模糊高风险表达', '我想永远消失']
]) {
  test(`当前关键词策略暂不识别${label}`, () => {
    assert.equal(matchKnowledge(query, makeSearchData()).risk, null);
  });
}

test('一般症状输入不会变成严重风险', () => {
  const result = matchKnowledge('持续疲惫，早醒', makeSearchData());
  assert.equal(result.risk, null);
  assert.equal(result.disorders[0]?.item.id, 'depression');
});

test('warning 级风险保持普通匹配行为', () => {
  const result = matchKnowledge('持续疲惫，严重失眠', makeSearchData());
  assert.equal(result.risk?.level, 'warning');
  assert.equal(result.disorders[0]?.item.id, 'depression');
  assert.equal(result.cases[0]?.item.disorderId, 'depression');
});

test('一般症状可产生疾病、相关案例和关联药物结果', () => {
  const result = matchKnowledge('持续疲惫', makeSearchData());
  assert.equal(result.risk, null);
  assert.equal(result.disorders[0]?.item.id, 'depression');
  assert.equal(result.cases[0]?.item.disorderId, 'depression');
  assert.equal(result.drugs[0]?.id, 'sertraline');
});

test('疾病结果按分数降序排列', () => {
  const data = makeSearchData({
    drugs: [],
    disorders: [
      { id: 'higher', name: '疲惫甲', aliases: ['优先'], summary: '疲惫线索', relatedDrugIds: [] },
      { id: 'lower', name: '疲惫乙', aliases: [], summary: '疲惫线索', relatedDrugIds: [] }
    ],
    cases: []
  });
  const result = matchKnowledge('疲惫甲 疲惫乙 优先', data);
  assert.equal(result.disorders.length, 2);
  assert.equal(result.disorders[0].item.id, 'higher');
  assert.ok(result.disorders[0].score > result.disorders[1].score);
});

test('关联疾病命中时案例参与结果排序', () => {
  const result = matchKnowledge('持续疲惫', makeSearchData());
  assert.equal(result.cases[0]?.item.id, 'case-depression');
  assert.ok(result.cases[0].score > 0);
});

test('不相关案例不会仅凭自身文本独立出现', () => {
  const data = makeSearchData();
  data.cases.push({
    id: 'case-gad',
    disorderId: 'gad',
    title: '持续疲惫但疾病未命中',
    summary: '持续疲惫',
    stage: '对照案例'
  });
  const result = matchKnowledge('持续疲惫', data);
  assert.deepEqual(result.cases.map(({ item }) => item.id), ['case-depression']);
});

test('返回结构字段保持兼容', () => {
  const result = matchKnowledge('持续疲惫', makeSearchData());
  assert.deepEqual(Object.keys(result).sort(), [
    'cases',
    'directDrugHint',
    'disorders',
    'drugs',
    'risk'
  ]);
});
