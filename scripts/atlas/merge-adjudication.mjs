// 合并器：把第一批（87 条）、第二批（119 条）与第三批（30 条）裁定合并为单一可审计文件。
//
// 合并规则：
//   1. 以"去空白与标点后的正文"为去重键；多批出现同一正文时保留先裁定的批次结果，
//      后到记录标记为 duplicate_of，不重复计数。
//   2. 为每条记录补齐 batch 与 attributionBasis：
//        direct_text            文本自身含机构指认
//        parent_context         由父内容归因，但未套用 R1 放宽
//        parent_context_relaxed 套用 R1 放宽后判 correct
//      batch1 由 rationale 中的"R1放宽"回溯标记；batch2/batch3 由裁定器直接产出。
//   3. 汇总同时给出"严格口径"（仅 direct_text）与"含放宽口径"的纳入数，便于分别判定阈值。
//
// 运行：node scripts/atlas/merge-adjudication.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewQueue } from './lib/private-inputs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BATCH1_ADJ = join(ROOT, 'work', 'review-adjudication-batch1.json');
const BATCH1_QUEUE = reviewQueue();
const BATCH2_ADJ = join(ROOT, 'work', 'review-adjudication-batch2.json');
const BATCH3_ADJ = join(ROOT, 'work', 'review-adjudication-batch3.json');
const OUT = join(ROOT, 'work', 'review-adjudication.json');

// 归一化顺序很关键：先剥掉表情码与 emoji，再去标点。
// 小红书同一段话常被抓成两版（一版带 [笑哭R]、一版不带），若先去标点，
// 中括号被吃掉后剩下 "笑哭R" 会卡在正文中间，导致两条算不出同一个键。
const norm = (s) => (s ?? '')
  .replace(/\[[^\]\[]{1,12}\]/g, '')
  .replace(/\p{Extended_Pictographic}/gu, '')
  .replace(/\s+/g, '')
  .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
  .slice(0, 80);

// 第一批裁定由 apply-adjudication.mjs 单独产出到 batch1 文件。
// 合并器只读 batch1 + batch2 + batch3、只写合并结果 —— 这样重复运行是幂等的，
// 不会把上一轮的合并输出当成第一批再合并一遍。
const b1 = JSON.parse(readFileSync(BATCH1_ADJ, 'utf-8'));
const b1Queue = JSON.parse(readFileSync(BATCH1_QUEUE, 'utf-8'));
const b2 = JSON.parse(readFileSync(BATCH2_ADJ, 'utf-8'));
const b3 = JSON.parse(readFileSync(BATCH3_ADJ, 'utf-8'));

const b1Text = new Map(b1Queue.records.map((r) => [r.reviewId, r.text ?? '']));

const b1Records = b1.records.map((r) => ({
  ...r,
  batch: 'batch1',
  attributionBasis: /R1放宽/.test(r.rationale ?? '') ? 'parent_context_relaxed' : 'direct_text',
  text: b1Text.get(r.reviewId) ?? null
}));

const seen = new Map();
const merged = [];
const duplicates = [];

for (const r of [...b1Records, ...b2.records, ...b3.records]) {
  const key = norm(r.text);
  if (key && seen.has(key)) {
    duplicates.push({ reviewId: r.reviewId, batch: r.batch, duplicateOf: seen.get(key) });
    continue;
  }
  if (key) seen.set(key, r.reviewId);
  merged.push(r);
}

const tally = (key) => merged.reduce((acc, r) => {
  acc[r[key]] = (acc[r[key]] ?? 0) + 1;
  return acc;
}, {});

const included = merged.filter((r) => r.aggregationDecision === 'include' && r.privacyDecision === 'clear');
const strict = included.filter((r) => r.attributionBasis === 'direct_text');
const byInstitution = {};
for (const r of included) {
  const inst = r.adjudicatedInstitution ?? '(未归因)';
  byInstitution[inst] ??= { total: 0, strict: 0, relaxed: 0, aspects: {} };
  byInstitution[inst].total += 1;
  if (r.attributionBasis === 'direct_text') byInstitution[inst].strict += 1;
  else byInstitution[inst].relaxed += 1;
  for (const a of r.aspects ?? []) byInstitution[inst].aspects[a] = (byInstitution[inst].aspects[a] ?? 0) + 1;
}

const out = {
  schemaVersion: 2,
  publicationStatus: 'LOCAL_REVIEW_ONLY',
  queueId: `merged:${b1.queueId}+${b2.queueId}+${b3.queueId}`,
  adjudicatedAt: new Date().toISOString(),
  adjudicatorNote: '第一批（87 条，含 14 条待复核的再裁定）、第二批（119 条）与第三批（30 条，扩别名表后新归因机构）合并结果。跨批次同正文已去重，保留先裁定结果。attributionBasis 区分文本直证与父内容放宽，可分别统计。',
  batches: [
    { batch: 'batch1', queueId: b1.queueId, total: b1Records.length },
    { batch: 'batch2', queueId: b2.queueId, total: b2.records.length },
    { batch: 'batch3', queueId: b3.queueId, total: b3.records.length }
  ],
  duplicates,
  summary: {
    total: merged.length,
    aggregation: tally('aggregationDecision'),
    entity: tally('entityDecision'),
    experience: tally('experienceDecision'),
    privacy: tally('privacyDecision'),
    attributionBasis: tally('attributionBasis'),
    publishable: {
      total: included.length,
      strictDirectText: strict.length,
      relaxedContext: included.length - strict.length
    }
  },
  byInstitution,
  records: merged
};

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('合并完成：', JSON.stringify(out.summary, null, 1));
console.log('去重剔除：', duplicates.length, '条');
if (duplicates.length) console.log(JSON.stringify(duplicates, null, 1));
console.log('分机构可用样本：');
for (const [n, v] of Object.entries(byInstitution)) {
  console.log(' -', n, '合计', v.total, '| 直证', v.strict, '| 放宽', v.relaxed);
}
console.log('第一批来源：', BATCH1_ADJ);
console.log('合并输出：', OUT);
