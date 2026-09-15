// 生成第三批审阅队列：扩展别名表后新归因的机构 + 亲历信号 + 未审阅
import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = 'D:/公益科普';
const norm = readFileSync(`${ROOT}/work/normalized-private.jsonl`, 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));

const ORIGINAL = ['上海市精神卫生中心', '武汉市精神卫生中心', '北京大学第六医院'];
const key = (s) => (s ?? '')
  .replace(/\[[^\]\[]{1,12}\]/g, '')
  .replace(/\p{Extended_Pictographic}/gu, '')
  .replace(/\s+/g, '')
  .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
  .slice(0, 80);

const b1 = JSON.parse(readFileSync(`${ROOT}/work/review-queue-private.json`, 'utf8'));
const b2 = JSON.parse(readFileSync(`${ROOT}/work/review-queue-batch2.json`, 'utf8'));
const seen = new Set([...b1.records, ...b2.records].map((r) => key(r.text)));
const annotationSchema = b1.annotationSchema;

const candidates = norm
  .filter((r) => r.institution && !ORIGINAL.includes(r.institution.name))
  .filter((r) => r.serviceExperience)
  .filter((r) => !seen.has(key(r.text)))
  .sort((a, b) => b.aspects.length - a.aspects.length || b.text.length - a.text.length);

const records = candidates.map((r) => ({
  reviewId: `b3_${r.recordId}`,
  cohort: 'expanded_alias_new_institutions',
  platform: r.platform,
  kind: r.kind,
  proposedInstitution: r.institution.name,
  text: r.text,
  context: { parentId: r.parentId, matchMethod: r.institution.method, evidence: r.institution.evidence },
  machine: {
    matchMethod: r.institution.method,
    serviceExperience: r.serviceExperience,
    aspects: r.aspects,
    flags: r.flags
  }
}));

const out = {
  schemaVersion: 1,
  publicationStatus: 'LOCAL_REVIEW_ONLY',
  queueId: 'social-evidence-batch3-expanded-alias',
  targets: [...new Set(records.map((r) => r.proposedInstitution))],
  generatedAt: new Date().toISOString(),
  source: 'work/normalized-private.jsonl（别名表扩至 17 家后新归因的亲历记录；batch1/batch2 已审记录已排除）',
  annotationSchema,
  records
};
writeFileSync(`${ROOT}/work/review-queue-batch3.json`, JSON.stringify(out, null, 2));

console.log('batch3 队列条数:', records.length);
const byInst = {};
for (const r of records) byInst[r.proposedInstitution] = (byInst[r.proposedInstitution] ?? 0) + 1;
console.log('分机构:', JSON.stringify(byInst, null, 1));
console.log('\n===== 全文（供逐条裁定）=====');
records.forEach((r, i) => {
  console.log(`\n#${i + 1} ${r.reviewId} [${r.platform}/${r.kind}] -> ${r.proposedInstitution} (${r.context.matchMethod}: ${r.context.evidence})`);
  console.log(`   aspects=${JSON.stringify(r.machine.aspects)} flags=${JSON.stringify(r.machine.flags)}`);
  console.log(`   ${r.text}`);
});
