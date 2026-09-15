// 第三批人工裁定应用器：把 batch3（30 条，扩别名表后新归因机构的亲历记录）逐条裁定写盘。
// 采用 reviewId 键控，缺失条目运行时报错；准则见 scripts/atlas/REVIEW-RULES.md v3。
//
// 本批特点：机构覆盖从 3 家扩到 17 家后，新归因记录几乎全部来自泛化关键词采集
// （"精神卫生中心""心理咨询 体验"等），而非机构定向检索，因此：
//   - 多数为提问、家属病情叙述或泛论，不构成服务经历 -> not_experience / exclude
//   - 优质长文常含接诊医生全名 -> privacy=residual_identifier（沿用 batch1 田芳案先例）
//   - content_context 归因需满足 R1 三条件（父内容指向 + 第一人称就诊动作 + 无他院线索）
//
// 运行：node scripts/atlas/apply-adjudication-batch3.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const QUEUE = join(ROOT, 'work', 'review-queue-batch3.json');
const OUT = join(ROOT, 'work', 'review-adjudication-batch3.json');

// reviewId -> [entity, experience, privacy, aggregation, aspects, correctedInstitution, rationale, relaxed]
const RULINGS = {
  // 1 湘雅二：本人就诊长文，事实具体（抢号难、候诊约两小时、问诊十余分钟），但全文为
  //   "贬湘雅二、推华兴心理医院"的对比推荐结构并带话题标签，无法排除推广动机 -> uncertain
  b3_5fef604550a99de5: ['correct', 'firsthand', 'clear', 'uncertain',
    ['access_and_wait', 'staff_interaction', 'process_and_information', 'environment_and_facilities', 'continuity_and_follow_up', 'self_reported_outcome'],
    '中南大学湘雅二医院', '本人+姐姐陪诊就诊经历，挂号难、候诊约两小时、问诊约十几分钟等事实具体可核对；但全文为对比推荐结构（结尾推荐华兴心理医院并附话题标签），无法排除软文与推广动机，存疑不聚合', false],
  // 2 广州白云：本人万元消费经历，服务事实具体；但含"李医生"姓氏与拍打病人等可定位行为事件
  b3_e2f6022f687e7dba: ['correct', 'firsthand', 'residual_identifier', 'exclude',
    ['cost_and_billing', 'staff_interaction'],
    '广州白云心理医院', '明确机构名本人就诊，费用（上万元、半小时180元）与医护行为具体；但含医生姓氏（李医生）与可定位的具体行为事件，标识符不可剥离', false],
  // 3 西安：优质就诊长文，但含两位医生全名（职璞、张品）
  b3_626934626c708b54: ['correct', 'firsthand', 'residual_identifier', 'exclude',
    ['access_and_wait', 'cost_and_billing', 'staff_interaction', 'process_and_information'],
    '西安市精神卫生中心', '明确机构名本人就诊，挂号渠道、量表流程与心理咨询定价（45分钟200元）具体；但含两位医生全名，标识符不可剥离', false],
  // 4 广州白云：用药叙事为主体（度洛西汀/文拉法辛/喹硫平及副作用），医学内容硬排除
  b3_b9454c79bf05939a: ['correct', 'firsthand', 'clear', 'exclude',
    ['continuity_and_follow_up', 'staff_interaction'],
    '广州白云心理医院', 'R1：父内容指向广州白云；本人就诊（挂号、复诊），但内容主体为具体药物、剂量调整与副作用叙事，属医学内容', true],
  // 5 北京安定：主体为母亲病情与用药，且提及"康复医院"他院线索，R1 不成立
  b3_6ec1e2e85fa8534c: ['incorrect', 'not_experience', 'clear', 'exclude',
    ['self_reported_outcome'],
    null, '主体为母亲病情与自行停药运动调理叙事，就诊发生在"康复医院"（他院线索），与本机构服务无关', false],
  // 6 广州白云：本人 2017 年就诊，医生不滥用药、耐心沟通为服务行为主体，疗效自述一笔带过
  b3_d998bb16b4856c8e: ['correct', 'firsthand', 'clear', 'include',
    ['staff_interaction', 'self_reported_outcome'],
    '广州白云心理医院', 'R1：父内容指向广州白云；本人就诊，陈述医生沟通方式（不随意开药、先问症状）与厌学改善；疗效自述一笔带过且以医生服务行为为主体，无诊断药名与标识符', true],
  // 7 湘雅二：向博主提问封闭病房与陪护安排，非本人服务经历
  b3_ba11691a72b225c7: ['uncertain', 'not_experience', 'clear', 'exclude',
    ['environment_and_facilities'],
    null, '向博主提问母亲住院安排（封闭病房、陪护），本人无就诊动作，R1 不成立；含家属诊断信息', false],
  // 8 北京安定：主体为丈夫服药两周后的疗效变化，用药叙事
  b3_812f0fd4ff1a8043: ['correct', 'accompanied', 'clear', 'exclude',
    ['self_reported_outcome'],
    '北京安定医院', 'R1：父内容指向安定医院；家属陪同就诊，但内容主体为服药两周的疗效变化，属用药叙事，无独立服务维度事实', true],
  // 9 杭州七院：提及"东北的医疗环境"他 region 线索，主体为家属照顾安排
  b3_5c68cac16f8e18b1: ['incorrect', 'not_experience', 'clear', 'exclude',
    [],
    null, '主体为母亲不配合吃药的家属叙述与回杭州照顾安排；提及东北医疗环境（他 region 线索），无本机构服务经历', false],
  // 10 杭州七院：提问他人疗效 + 家属状态更新；"医生让住院"为临床建议事件，服务陈述不完整
  b3_d0a7938efacb3e72: ['correct', 'uncertain', 'clear', 'exclude',
    ['process_and_information'],
    '杭州市第七人民医院', '"我们在七院"指认明确，但主体为向他人提问疗效与家属不愿住院的状态更新，服务经历陈述不完整', true],
  // 11 重庆：询问线上问诊渠道，非服务经历
  b3_00df56ee01818cbc: ['uncertain', 'not_experience', 'clear', 'exclude',
    [],
    null, '询问线上问诊渠道（父亲脑出血腿脚不便），本人无就诊动作；机构归属仅由父内容推断', false],
  // 12 山东：本人就诊，医生撸袖子、只问是否受刺激、开量表抽血眼动，行为事件具体
  b3_41478b07d848b253: ['correct', 'firsthand', 'clear', 'include',
    ['staff_interaction', 'process_and_information'],
    '山东省精神卫生中心', 'R1：父内容指向山东精卫某医生；本人周一就诊（挂号、随兄陪同），陈述医生进诊室撸袖子、仅问是否受刺激、安排量表抽血与眼动检查等具体行为；未出现医生姓名，无诊断处方与标识符', true],
  // 13 北京安定：家属 NPD/精神分裂/双相病情叙述，无就诊服务事实
  b3_944278d609eacfbf: ['uncertain', 'not_experience', 'clear', 'exclude',
    [],
    null, '家属精神健康问题自述与住院意愿讨论，无本机构就诊动作与服务事实；含多个诊断标签', false],
  // 14 北京安定：二姨被害妄想家庭叙述，无就诊服务事实
  b3_8bc7773b342504dc: ['uncertain', 'not_experience', 'clear', 'exclude',
    [],
    null, '家属妄想症状与就医抗拒的家庭叙述，无本机构就诊动作与服务事实', false],
  // 15 杭州七院：本人住院第一天，但含医生全名（唐文新）
  b3_3989a4b62f10317c: ['correct', 'firsthand', 'residual_identifier', 'exclude',
    ['environment_and_facilities', 'process_and_information'],
    '杭州市第七人民医院', '本人住院首日陈述（物品管理、脑电波检查）；含主治医生全名，标识符不可剥离', true],
  // 16 西安：询问首次就诊挂号科室组合，非服务经历
  b3_47b4f9225a6989f2: ['uncertain', 'not_experience', 'clear', 'exclude',
    [],
    null, '询问首次就诊的科室挂号组合，本人未就诊', false],
  // 17 西安：本人两次就诊的流程体验（首诊开药、复诊被转挂心理科未开药），流程事实具体
  b3_9d1f403a22886968: ['correct', 'firsthand', 'clear', 'include',
    ['process_and_information'],
    '西安市精神卫生中心', 'R1：父内容指向西安精卫；本人两次就诊，陈述首诊开药、复诊被另一医生要求转挂心理科且未开药的流程体验；开药仅为流程叙述，未披露药名剂量，无标识符', true],
  // 18 北京安定：丈夫拒绝就医的家庭叙述，无本机构服务事实
  b3_607a834183e12ac9: ['uncertain', 'not_experience', 'clear', 'exclude',
    [],
    null, '丈夫拒绝就医的家庭矛盾叙述，无本机构就诊动作与服务事实', false],
  // 19 西安：询问夫妻/家庭关系挂什么科，非服务经历
  b3_cfd018eaf51185dc: ['uncertain', 'not_experience', 'clear', 'exclude',
    [],
    null, '询问夫妻家庭关系就诊的科室与医生选择，本人未就诊', false],
  // 20 杭州七院：本人就诊并评价医生，但含医生全名（张颖）
  b3_362b0862c52c5376: ['correct', 'firsthand', 'residual_identifier', 'exclude',
    ['staff_interaction'],
    '杭州市第七人民医院', '本人就诊并评价医生态度（感觉还可以）；含医生全名，标识符不可剥离', true],
  // 21 杭州七院：询问疗效与陪护政策，含精神分裂诊断
  b3_e930730fbb45a314: ['uncertain', 'not_experience', 'clear', 'exclude',
    ['environment_and_facilities'],
    null, '询问治疗效果与陪护政策，本人未陈述服务经历；含精神分裂诊断，属医学内容', false],
  // 22 北京安定：泛论中医与基因，无本机构服务事实
  b3_8fb16e1a9d33dc2e: ['uncertain', 'not_experience', 'clear', 'exclude',
    [],
    null, '对中医与精神疾病可治性的泛论，无本机构就诊动作与服务事实', false],
  // 23 杭州七院：母亲症状叙述，无服务经历
  b3_77180ad9ee15a00b: ['uncertain', 'not_experience', 'clear', 'exclude',
    [],
    null, '母亲幻觉与猜疑症状叙述，无本机构就诊动作与服务事实', false],
  // 24 杭州七院：询问医生推荐，含孩子诊断
  b3_69580eb0a4a7a922: ['uncertain', 'not_experience', 'clear', 'exclude',
    [],
    null, '询问儿童情绪障碍的医生推荐，本人未就诊；含孩子诊断结论，属医学内容', false],
  // 25 杭州七院：已挂号未就诊 + 医生全名（陈致宇）+ 精分住院政策提问
  b3_8757a7be483913eb: ['correct', 'uncertain', 'residual_identifier', 'exclude',
    [],
    '杭州市第七人民医院', '已挂号未就诊（"不知道怎么样"），主体为住院政策提问；含医生全名，标识符不可剥离', true],
  // 26 山东：医生指引院外药店购药，利益关联质疑，行为事件具体
  b3_4c8efc60fe2a477d: ['correct', 'firsthand', 'clear', 'include',
    ['cost_and_billing'],
    '山东省精神卫生中心', 'R1：父内容指向山东精卫；本人就诊中被医生指引到院外药店购药并质疑利益关联，属费用与结算维度的具体可核对事件；无医生姓名与标识符', true],
  // 27 杭州七院：询问两个院区哪个好，非服务经历
  b3_49194f0c1b6a8d41: ['uncertain', 'not_experience', 'clear', 'exclude',
    [],
    null, '询问两个院区地址选择，本人未就诊', false],
  // 28 杭州七院：住过5次今年3月出院，但无任何服务维度事实
  b3_1a105a83457cb622: ['correct', 'firsthand', 'clear', 'exclude',
    [],
    '杭州市第七人民医院', 'R1：父内容指向杭州七院；本人多次住院属实，但未涉及任何服务环节事实（等待、费用、流程、态度、环境），不满足最小事实原则', true],
  // 29 杭州七院：住院需排队等床，床位可得性属挂号与等待维度
  b3_f0bb4f1366ade842: ['correct', 'firsthand', 'clear', 'include',
    ['access_and_wait'],
    '杭州市第七人民医院', 'R1：父内容指向杭州七院；本人陈述住院住不进去需要排队等位置，床位可得性属挂号与等待维度的具体事实；无标识符', true],
  // 30 广州白云："骗人医院 我去过"，抽象情绪评价，无具体服务事实
  b3_f68fce47583e95f6: ['correct', 'firsthand', 'clear', 'exclude',
    [],
    '广州白云心理医院', 'R1：父内容指向广州白云；本人声称去过，但仅"骗人医院"抽象评价，无任何可核对的服务事实，按 H2 最小事实原则排除', true]
};

const queue = JSON.parse(readFileSync(QUEUE, 'utf-8'));
const missing = queue.records.filter((r) => !RULINGS[r.reviewId]).map((r) => r.reviewId);
if (missing.length) throw new Error(`以下队列记录缺少裁定：${missing.join(', ')}`);
const extra = Object.keys(RULINGS).filter((id) => !queue.records.some((r) => r.reviewId === id));
if (extra.length) throw new Error(`裁定含未知 reviewId：${extra.join(', ')}`);

const records = queue.records.map((r) => {
  const [entity, experience, privacy, aggregation, aspects, corrected, rationale, relaxed] = RULINGS[r.reviewId];
  const finalInst = aggregation === 'include' ? (corrected ?? r.proposedInstitution) : corrected;
  return {
    reviewId: r.reviewId,
    cohort: r.cohort,
    batch: 'batch3',
    platform: r.platform,
    proposedInstitution: r.proposedInstitution,
    text: r.text,
    adjudicatedInstitution: entity === 'correct' ? finalInst : (corrected ?? null),
    attributionBasis: relaxed ? 'parent_context_relaxed' : 'direct_text',
    entityDecision: entity,
    experienceDecision: experience,
    privacyDecision: privacy,
    aggregationDecision: aggregation,
    aspects,
    rationale
  };
});

const tally = (key) => records.reduce((acc, r) => { acc[r[key]] = (acc[r[key]] ?? 0) + 1; return acc; }, {});
const included = records.filter((r) => r.aggregationDecision === 'include' && r.privacyDecision === 'clear');

const out = {
  schemaVersion: 1,
  publicationStatus: 'LOCAL_REVIEW_ONLY',
  queueId: queue.queueId,
  adjudicatedAt: new Date().toISOString(),
  adjudicatorNote: '第三批（30 条，扩别名表后新归因机构）：泛化关键词采集导致多数为提问/家属叙述/泛论；优质长文多含接诊医生全名触发隐私门槛。R1 放宽归因仅在三条件齐备时使用。',
  summary: {
    total: records.length,
    entity: tally('entityDecision'),
    experience: tally('experienceDecision'),
    privacy: tally('privacyDecision'),
    aggregation: tally('aggregationDecision'),
    attributionBasis: tally('attributionBasis'),
    publishable: { total: included.length, strictDirectText: included.filter((r) => r.attributionBasis === 'direct_text').length, relaxedContext: included.filter((r) => r.attributionBasis !== 'direct_text').length }
  },
  records
};

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('batch3 裁定完成：', JSON.stringify(out.summary, null, 1));
console.log('输出：', OUT);
