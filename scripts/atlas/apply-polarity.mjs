// 极性裁定器：对已纳入匿名聚合的证据逐条标注正负极性（按服务维度标注）。
//
// 为什么单独做一轮：本轮之前的裁定只回答"涉及哪些服务维度"，没有回答"是好评还是差评"。
// 缺了极性就无法合成任何分数——与其拍脑袋加权，不如把极性作为独立一轮明确裁出来。
//
// 标注口径（每个维度独立判断）：
//   positive 对该环节的服务体验明确正面（医生有耐心、环境安静、费用合理）
//   negative 明确负面（态度差、等待过久、收费不符预期、流程断裂）
//   neutral  事实陈述、中性提问、褒贬各半（"两极分化"）、或仅"还可以/一般"这类及格表述
//
// 判不出来的（褒贬混杂且无法分辨主次）一律 neutral，不猜。
//
// 运行：node scripts/atlas/apply-polarity.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ADJ = join(ROOT, 'work', 'review-adjudication.json');
const OUT = join(ROOT, 'work', 'polarity-adjudication.json');

// reviewId -> { 维度: positive | negative | neutral }
const POLARITY = {
  r_b416b602419cc1251f4f0b8e: { staff_interaction: 'neutral' },
  r_60cb052cb052fedc5b4d0f3a: { cost_and_billing: 'negative', staff_interaction: 'negative', environment_and_facilities: 'negative' },
  r_c8e9b4400fcf7e0fa9c457e3: { access_and_wait: 'neutral', process_and_information: 'neutral', continuity_and_follow_up: 'negative' },
  r_8be50b4e5d75b49902fa49db: { environment_and_facilities: 'neutral', process_and_information: 'positive' },
  r_4af2a75c1e181b4137fb8ca0: { access_and_wait: 'negative', staff_interaction: 'negative', continuity_and_follow_up: 'negative' },
  r_ea5b650f5f36bc4cd4378b53: { access_and_wait: 'negative', process_and_information: 'neutral' },
  r_cdbd2e49fd8cc4e41a897caa: { staff_interaction: 'negative' },
  r_79622287dc798588b72385e7: { staff_interaction: 'neutral' },
  r_e841663d5c58bd6bb3253156: { staff_interaction: 'neutral', environment_and_facilities: 'neutral' },
  r_99225ebf99b0964b71302bcc: { access_and_wait: 'negative', process_and_information: 'neutral' },
  b2_8d7898f0dd5efb80: { access_and_wait: 'negative', staff_interaction: 'negative', process_and_information: 'negative' },
  b2_27be15721ecca67c: { access_and_wait: 'negative', cost_and_billing: 'negative', staff_interaction: 'negative', process_and_information: 'negative' },
  b2_757f67fbfde7ef5d: { access_and_wait: 'negative', staff_interaction: 'negative', process_and_information: 'negative' },
  b2_5c738fbaf6c5186a: { staff_interaction: 'negative', environment_and_facilities: 'negative' },
  b2_d908e165fabbcdba: { access_and_wait: 'negative', cost_and_billing: 'negative', staff_interaction: 'positive' },
  b2_17b474187949928f: { staff_interaction: 'negative', process_and_information: 'neutral' },
  b2_baa4a8b21bc6f24b: { staff_interaction: 'positive', environment_and_facilities: 'positive' },
  b2_f8f96dc801a0ef8d: { staff_interaction: 'positive' },
  b2_7e16237de415abe2: { access_and_wait: 'negative', cost_and_billing: 'negative' },
  b2_1b8d618f93668746: { staff_interaction: 'negative' },
  b2_4ad6d44feb459db6: { environment_and_facilities: 'neutral' },
  b2_18e66116f243b620: { access_and_wait: 'negative', cost_and_billing: 'negative', staff_interaction: 'negative' },
  b2_0ccdac160aa3aaef: { access_and_wait: 'neutral', process_and_information: 'neutral' },
  b2_e5ab74c929192b6e: { access_and_wait: 'neutral', staff_interaction: 'negative', process_and_information: 'negative' },
  b2_7230df6ef3b6ee79: { cost_and_billing: 'negative', staff_interaction: 'negative', continuity_and_follow_up: 'negative' },
  b2_b65bf87a5fb559bc: { continuity_and_follow_up: 'negative', process_and_information: 'negative' },
  b2_e83ece94c849bb01: { access_and_wait: 'negative', staff_interaction: 'negative' },
  b2_0408b7a6ee944658: { access_and_wait: 'neutral', process_and_information: 'neutral' },
  b2_2bfa17bfbc27c1e3: { staff_interaction: 'negative', process_and_information: 'negative' },
  b2_aee027231a1e116d: { environment_and_facilities: 'neutral' }
};

const adj = JSON.parse(readFileSync(ADJ, 'utf-8'));
const targets = adj.records.filter((r) => r.aggregationDecision === 'include' && r.privacyDecision === 'clear');

const missing = targets.filter((r) => !POLARITY[r.reviewId]).map((r) => r.reviewId);
if (missing.length) throw new Error(`以下纳入记录缺少极性裁定：${missing.join(', ')}`);
const extra = Object.keys(POLARITY).filter((id) => !targets.some((r) => r.reviewId === id));
if (extra.length) console.warn('警告：以下极性条目已不在纳入集合内（可能是被去重剔除）：', extra.join(', '));

// 记录级整体极性：取该条多数极性；正负相等判 neutral
const overallOf = (p) => {
  const v = Object.values(p);
  const pos = v.filter((x) => x === 'positive').length;
  const neg = v.filter((x) => x === 'negative').length;
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
};

const records = targets.map((r) => {
  const polarity = POLARITY[r.reviewId];
  const unknown = (r.aspects ?? []).filter((a) => !polarity[a]);
  return {
    reviewId: r.reviewId,
    batch: r.batch,
    platform: r.platform,
    institution: r.adjudicatedInstitution,
    experienceDecision: r.experienceDecision,
    attributionBasis: r.attributionBasis,
    aspects: r.aspects ?? [],
    polarity,
    overall: overallOf(polarity),
    note: unknown.length ? `维度未标注极性：${unknown.join(',')}` : null
  };
});

const unannotated = records.filter((r) => r.note);
if (unannotated.length) console.warn('警告：存在未标注极性的维度：', JSON.stringify(unannotated.map((r) => r.note)));

const tally = (fn) => records.reduce((acc, r) => {
  const k = fn(r);
  acc[k] = (acc[k] ?? 0) + 1;
  return acc;
}, {});

const out = {
  schemaVersion: 1,
  publicationStatus: 'LOCAL_REVIEW_ONLY',
  adjudicatedAt: new Date().toISOString(),
  adjudicatorNote: '对已纳入匿名聚合的 30 条证据按服务维度独立标注正负极性。褒贬混杂且无法分辨主次的判 neutral。记录级整体极性取该条多数极性。',
  summary: {
    total: records.length,
    overall: tally((r) => r.overall),
    byInstitution: records.reduce((acc, r) => {
      acc[r.institution] ??= { positive: 0, negative: 0, neutral: 0 };
      acc[r.institution][r.overall] += 1;
      return acc;
    }, {})
  },
  records
};

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('极性裁定完成：', JSON.stringify(out.summary, null, 1));
console.log('输出：', OUT);
