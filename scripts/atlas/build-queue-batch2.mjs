// 生成第二批审阅队列：目标机构 + 亲历信号 + 尚未审阅 + 按服务维度数降序。
// 运行：node scripts/atlas/build-queue-batch2.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewQueue } from './lib/private-inputs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TARGETS = ['上海市精神卫生中心', '武汉市精神卫生中心', '北京大学第六医院'];
const norm = readFileSync(join(ROOT, 'work', 'normalized-private.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));
const batch1 = JSON.parse(readFileSync(reviewQueue(), 'utf8'));
const seen = new Set(batch1.records.map((r) => r.text.trim().slice(0, 60)));

const candidates = norm
  .filter((r) => r.institution && TARGETS.includes(r.institution.name))
  .filter((r) => r.serviceExperience)
  .filter((r) => !seen.has(r.text.trim().slice(0, 60)))
  .sort((a, b) => b.aspects.length - a.aspects.length || b.text.length - a.text.length);

const records = candidates.map((r) => ({
  reviewId: `b2_${r.recordId}`,
  cohort: 'batch2_target_experience',
  platform: r.platform,
  kind: r.kind,
  proposedInstitution: r.institution?.name ?? null,
  text: r.text,
  context: { parentId: r.parentId, matchMethod: r.institution?.method ?? null, evidence: r.institution?.evidence ?? null },
  machine: {
    matchMethod: r.institution?.method ?? null,
    serviceExperience: r.serviceExperience,
    aspects: r.aspects,
    flags: r.flags
  }
}));

const out = {
  schemaVersion: 1,
  publicationStatus: 'LOCAL_REVIEW_ONLY',
  queueId: 'social-evidence-batch2-target-experience',
  targets: TARGETS,
  generatedAt: new Date().toISOString(),
  source: 'work/normalized-private.jsonl（第一批已审阅记录已排除）',
  annotationSchema: batch1.annotationSchema,
  records
};

writeFileSync(join(ROOT, 'work', 'review-queue-batch2.json'), JSON.stringify(out, null, 2));
const byInst = {};
for (const r of records) byInst[r.proposedInstitution] = (byInst[r.proposedInstitution] ?? 0) + 1;
console.log('第二批队列条数:', records.length);
console.log('分机构:', JSON.stringify(byInst));
console.log('平台:', JSON.stringify(records.reduce((a, r) => { a[r.platform] = (a[r.platform] ?? 0) + 1; return a; }, {})));
