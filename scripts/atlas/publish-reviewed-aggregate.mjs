// 发布聚合器：只把"通过人工裁定"的证据转成机构级匿名计数，供前端展示。
//
// 与旧管线（aggregate-social-enhanced.mjs）的关键差异：
//   1. 输入不是原始抓取，而是人工裁定文件 work/review-adjudication.json（两批合并、已去重）
//   2. 仅 aggregationDecision === 'include' 且 privacyDecision === 'clear' 的记录进入统计
//   3. 绝不输出原文、标题、链接、平台 ID、昵称、作者哈希
//   4. 样本量低于阈值只报"样本不足"，不产出任何估算
//   5. 不产出 0-100 综合口碑分：样本为自我选择的亲历叙述（非随机抽样），且未做正负极性
//      裁定，任何加权总分都会伪装成机构总体口碑，故只发布服务维度提及分布
//
// 运行：node scripts/atlas/publish-reviewed-aggregate.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ADJUDICATION = join(ROOT, 'work', 'review-adjudication.json');
const POLARITY = join(ROOT, 'work', 'polarity-adjudication.json');
const OUT = join(ROOT, 'src', 'atlas', 'chinaSocialReputation.js');

// 目标机构：即使无可用样本也列出，保持地图图层稳定
const TARGETS = ['上海市精神卫生中心', '武汉市精神卫生中心', '北京大学第六医院'];

// 样本量阈值：低于此值不发布任何维度分布与分数（沿用"高置信度需 ≥20 条"的口径）
const MIN_SAMPLE_FOR_SCORE = 20;

// 单个维度至少要有这么多条标注了极性的证据才计算该维度分，否则 1 条好评就变成 100 分
const MIN_ASPECT_SAMPLE = 3;

// 至少要有这么多个有效维度才合成总分，避免被单一维度带偏
const MIN_DIMENSIONS_FOR_SCORE = 3;

// 若需只看"文本自身指认机构"的严格口径，把这里改成 true
const STRICT_ONLY = false;

const adjudication = JSON.parse(readFileSync(ADJUDICATION, 'utf-8'));
const polarity = JSON.parse(readFileSync(POLARITY, 'utf-8'));
const platformLabel = { xhs: '小红书', douyin: '抖音', zhihu: '知乎' };

const usable = adjudication.records.filter(
  (r) => r.aggregationDecision === 'include' && r.privacyDecision === 'clear' && r.adjudicatedInstitution
);
const counted = STRICT_ONLY ? usable.filter((r) => r.attributionBasis === 'direct_text') : usable;

// reviewId -> 极性裁定（按维度）
const polById = new Map(polarity.records.map((r) => [r.reviewId, r]));
for (const rec of counted) {
  if (!polById.has(rec.reviewId)) {
    throw new Error(`纳入记录 ${rec.reviewId} 缺少极性裁定；请先运行 apply-polarity.mjs`);
  }
}

const emptyAgg = () => ({
  mentions: 0, strict: 0, relaxed: 0, aspects: {}, byPlatform: {},
  experiences: { firsthand: 0, accompanied: 0 },
  polarity: { positive: 0, negative: 0, neutral: 0 },
  dimensionScores: {}, serviceScore: null, serviceScoreNote: null,
  reputationScore: null, dimensions: null
});

const aggregates = {};
for (const inst of TARGETS) aggregates[inst] = emptyAgg();
for (const rec of counted) {
  const inst = rec.adjudicatedInstitution;
  aggregates[inst] ??= emptyAgg();
  const agg = aggregates[inst];
  agg.mentions += 1;
  if (rec.attributionBasis === 'direct_text') agg.strict += 1; else agg.relaxed += 1;
  for (const aspect of rec.aspects ?? []) agg.aspects[aspect] = (agg.aspects[aspect] ?? 0) + 1;
  const p = platformLabel[rec.platform] ?? rec.platform;
  agg.byPlatform[p] = (agg.byPlatform[p] ?? 0) + 1;
  if (rec.experienceDecision === 'firsthand' || rec.experienceDecision === 'accompanied') {
    agg.experiences[rec.experienceDecision] += 1;
  }
  const pol = polById.get(rec.reviewId);
  agg.polarity[pol.overall] += 1;
  for (const [aspect, v] of Object.entries(pol.polarity)) {
    agg.dimensionScores[aspect] ??= { positive: 0, negative: 0, neutral: 0, n: 0, score: null };
    const d = agg.dimensionScores[aspect];
    d[v] += 1;
    d.n += 1;
  }
}

for (const [name, agg] of Object.entries(aggregates)) {
  const enough = agg.mentions >= MIN_SAMPLE_FOR_SCORE;

  // 维度分：正面记 1 分、中性记 0.5 分、负面记 0 分，换算成百分制
  const scored = [];
  for (const [aspect, d] of Object.entries(agg.dimensionScores)) {
    if (d.n >= MIN_ASPECT_SAMPLE) {
      d.score = Math.round(((d.positive + 0.5 * d.neutral) / d.n) * 1000) / 10;
      scored.push(aspect);
    } else {
      d.score = null; // 样本太少时不给分，避免 1 条好评 = 100 分
      d.suppressed = `仅 ${d.n} 条，低于单维度 ${MIN_ASPECT_SAMPLE} 条下限`;
    }
  }
  agg.scoredDimensions = scored;

  if (enough && scored.length >= MIN_DIMENSIONS_FOR_SCORE) {
    agg.serviceScore = Math.round(
      (scored.reduce((sum, a) => sum + agg.dimensionScores[a].score, 0) / scored.length) * 10
    ) / 10;
    agg.reviewStatus = 'scored';
    agg.serviceScoreNote = `${agg.mentions} 条已审阅亲历叙述中 ${agg.polarity.positive} 条偏正面、${agg.polarity.negative} 条偏负面、${agg.polarity.neutral} 条中性；`
      + `取 ${scored.length} 个达标维度的平均分。`;
  } else if (enough) {
    agg.serviceScore = null;
    agg.reviewStatus = 'profile_published';
    agg.serviceScoreNote = `达标维度不足 ${MIN_DIMENSIONS_FOR_SCORE} 个（当前 ${scored.length} 个），暂不合成总分`;
  } else {
    agg.serviceScore = null;
    agg.reviewStatus = 'insufficient_sample';
    agg.serviceScoreNote = `仅 ${agg.mentions} 条通过人工审阅（阈值 ${MIN_SAMPLE_FOR_SCORE} 条），样本不足`;
    for (const d of Object.values(agg.dimensionScores)) d.score = null;
    agg.scoredDimensions = [];
  }

  agg.scoreNote = agg.reviewStatus === 'insufficient_sample'
    ? `${agg.serviceScoreNote}，暂不发布维度分布与评分`
    : `已发布服务维度分布（${agg.mentions} 条通过人工审阅）`;
  agg.attributionNote = agg.mentions > 0
    ? `其中 ${agg.strict} 条为文本自身指认机构，${agg.relaxed} 条为父内容上下文归因（R1 放宽）`
    : '暂无可用样本';
  agg.attributionConfidence = agg.mentions > 0 ? (agg.strict / agg.mentions >= 0.5 ? 'high' : 'medium') : null;
}

const meta = {
  platforms: [...new Set(adjudication.records.map((r) => platformLabel[r.platform] ?? r.platform))].sort(),
  aspectLabels: {
    access_and_wait: '挂号与等待',
    cost_and_billing: '费用与结算',
    staff_interaction: '医患沟通',
    process_and_information: '流程与告知',
    environment_and_facilities: '环境与设施',
    continuity_and_follow_up: '复诊与连续性',
    self_reported_outcome: '自述结果',
    other: '其他'
  },
  updatedAt: new Date().toISOString().slice(0, 10),
  noteCount: 0,      // 不发布任何原文
  commentCount: 0,   // 不发布任何原文
  hasDimensions: false,
  publicationGate: 'HUMAN_ADJUDICATED_ONLY',
  scorePolicy: {
    producesCompositeScore: false,
    producesServiceScore: true,
    scoreName: '服务体验倾向分',
    formula: '单个维度 =（正面条数 + 0.5 × 中性条数）÷ 该维度总条数 × 100；总分为各达标维度的简单平均，不加权。',
    minSampleForScore: MIN_SAMPLE_FOR_SCORE,
    minAspectSample: MIN_ASPECT_SAMPLE,
    minDimensionsForScore: MIN_DIMENSIONS_FOR_SCORE,
    strictOnly: STRICT_ONLY,
    reason: '队列是「亲历信号 + 服务维度数」降序抽样，不是就诊者的随机样本——愿意在网上写长文的人本就更可能是来吐槽的。'
      + '因此这里给出的是「已审阅亲历叙述里的正负面构成」，不是机构总体口碑，也不能当作就医推荐依据。'
      + '页面同时列出正/负/中性原始条数，读者可以自行判断。'
  },
  review: {
    queueId: adjudication.queueId,
    adjudicatedAt: adjudication.adjudicatedAt,
    total: adjudication.summary.total,
    included: adjudication.summary.aggregation.include ?? 0,
    pending: adjudication.summary.aggregation.uncertain ?? 0,
    excluded: adjudication.summary.aggregation.exclude ?? 0,
    publishable: adjudication.summary.publishable ?? null,
    duplicates: adjudication.duplicates?.length ?? 0,
    minSampleForScore: MIN_SAMPLE_FOR_SCORE
  },
  statusNote: '本页不展示任何原帖链接、账号或原文；仅展示经人工逐条审阅后的匿名计数。样本不足的机构一律不发布维度分布，也不计算综合评分。'
};

const banner = '// 由 scripts/atlas/publish-reviewed-aggregate.mjs 生成，请勿手改。\n'
  + '// 数据口径：仅包含通过人工审阅（aggregationDecision=include 且 privacyDecision=clear）的证据；\n'
  + '// 不含原文、链接、平台 ID、昵称或任何可识别字段；样本不足不发布；不产出机构综合口碑分。\n'
  + '// serviceScore 是「已审阅亲历叙述的正负面构成」，样本非随机，不代表机构总体服务水平。\n';

writeFileSync(
  OUT,
  banner
  + `export const SOCIAL_REPUTATION_META = ${JSON.stringify(meta, null, 2)};\n\n`
  + `export const SOCIAL_REPUTATION = ${JSON.stringify(aggregates, null, 2)};\n`
);

console.log('发布聚合完成：', Object.keys(aggregates).length, '家机构');
for (const [name, agg] of Object.entries(aggregates)) {
  console.log(' -', name, '可用样本', agg.mentions, '(直证', agg.strict, '/ 放宽', agg.relaxed, ') |', agg.reviewStatus,
    '| 倾向分', agg.serviceScore ?? '—',
    '| 正', agg.polarity.positive, '/ 负', agg.polarity.negative, '/ 中', agg.polarity.neutral);
}
console.log('输出：', OUT);
