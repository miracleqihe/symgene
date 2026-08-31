import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_TARGETS = Object.freeze([
  '上海市精神卫生中心',
  '武汉市精神卫生中心',
  '北京大学第六医院'
]);

const RESTRICTED_FLAGS = new Set([
  'direct_identifier_redacted',
  'high_risk_personal_disclosure',
  'abusive_or_dehumanizing_language',
  'public_affairs_or_identity_sensitive',
  'advertising_or_solicitation',
  'medical_claim_or_advice',
  'medical_treatment_detail',
  'named_clinician_or_staff',
  'context_requires_restricted_review'
]);
const RESTRICTED_TEXT = /\[(?:URL|EMAIL|ID|PHONE|CONTACT|@USER|CLINICIAN)\]/;

const hash = (value) => createHash('sha256').update(value).digest('hex');

function readJsonl(path) {
  const source = readFileSync(path, 'utf8');
  const records = [];
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (!line) continue;
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`normalized input contains invalid JSON at line ${index + 1}`);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`normalized input must contain objects at line ${index + 1}`);
    }
    records.push(value);
  }
  return { records, sourceHash: hash(source) };
}

const proposedInstitution = (record) => record.entityMatches?.length === 1
  ? record.entityMatches[0].name
  : null;

const hasRestrictedEvidence = (record, contents) => {
  if (RESTRICTED_TEXT.test(record.cleanedText ?? '')) return true;
  if (record.flags?.some((flag) => RESTRICTED_FLAGS.has(flag))) return true;
  if (record.entityMatchMethod !== 'content_context') return false;
  const context = contents.get(record.contentRef);
  return !context || RESTRICTED_TEXT.test(context.cleanedText ?? '')
    || context.flags?.some((flag) => RESTRICTED_FLAGS.has(flag));
};

const deterministicTake = (records, count, seed) => [...records]
  .sort((left, right) => hash(`${seed}:${left.recordId}`).localeCompare(hash(`${seed}:${right.recordId}`)))
  .slice(0, count);

function countBy(records, getter) {
  const result = {};
  for (const record of records) {
    const key = getter(record) ?? 'none';
    result[key] = (result[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b, 'zh-Hans')));
}

function toReviewRecord(record, cohort, contents) {
  const context = record.entityMatchMethod === 'content_context' ? contents.get(record.contentRef) : null;
  const institution = proposedInstitution(record);
  const contextTerms = context?.entityMatchEvidence
    ?.find((evidence) => evidence.institutionId === record.entityMatches?.[0]?.id)?.terms;
  return {
    reviewId: record.recordId,
    cohort,
    platform: record.platform,
    kind: record.kind,
    proposedInstitution: proposedInstitution(record),
    text: record.cleanedText,
    context: context ? {
      reviewId: context.recordId,
      matchedTerms: Array.isArray(contextTerms) && contextTerms.length > 0 ? contextTerms : [institution],
      proposedInstitution: institution
    } : null,
    machine: {
      matchMethod: record.entityMatchMethod,
      serviceExperience: Boolean(record.serviceExperience),
      aspects: record.aspects ?? [],
      flags: record.flags ?? []
    }
  };
}

export function buildReviewPilot({
  inputPath,
  outputDir,
  targets = DEFAULT_TARGETS,
  targetAuditPerInstitution = 10,
  unmatchedAuditPerPlatform = 10
}) {
  if (!Array.isArray(targets) || targets.length === 0 || new Set(targets).size !== targets.length) {
    throw new Error('targets must be a non-empty list of unique institution names');
  }
  const { records, sourceHash } = readJsonl(inputPath);
  const contents = new Map(records.filter((record) => record.kind === 'contents').map((record) => [record.recordId, record]));
  const targetSet = new Set(targets);

  const primary = records.filter((record) => targetSet.has(proposedInstitution(record))
    && record.candidateForExperienceReview === true
    && !record.excludedAsDuplicate
    && !hasRestrictedEvidence(record, contents));

  const targetAudit = [];
  for (const target of targets) {
    const eligible = records.filter((record) => proposedInstitution(record) === target
      && record.candidateForExperienceReview !== true
      && !record.excludedAsDuplicate
      && !hasRestrictedEvidence(record, contents));
    targetAudit.push(...deterministicTake(eligible, targetAuditPerInstitution, `target-audit:${target}`));
  }

  const unmatchedAudit = [];
  for (const platform of ['xhs', 'douyin', 'zhihu']) {
    const eligible = records.filter((record) => record.platform === platform
      && record.entityMatches?.length === 0
      && record.serviceExperience === true
      && !record.excludedAsDuplicate
      && !hasRestrictedEvidence(record, contents));
    unmatchedAudit.push(...deterministicTake(eligible, unmatchedAuditPerPlatform, `unmatched-audit:${platform}`));
  }

  const selected = new Map();
  for (const [cohort, rows] of [
    ['primary_candidate', primary],
    ['target_negative_audit', targetAudit],
    ['unmatched_false_negative_audit', unmatchedAudit]
  ]) {
    for (const row of rows) if (!selected.has(row.recordId)) selected.set(row.recordId, { row, cohort });
  }

  const queueId = `social-evidence-${hash(JSON.stringify({ sourceHash, targets, targetAuditPerInstitution, unmatchedAuditPerPlatform })).slice(0, 16)}`;
  const queueRecords = [...selected.values()]
    .map(({ row, cohort }) => toReviewRecord(row, cohort, contents))
    .sort((left, right) => hash(`${queueId}:${left.reviewId}`).localeCompare(hash(`${queueId}:${right.reviewId}`)));
  const queue = {
    schemaVersion: 1,
    publicationStatus: 'LOCAL_REVIEW_ONLY',
    queueId,
    targets,
    annotationSchema: {
      entityDecision: ['correct', 'incorrect', 'uncertain'],
      experienceDecision: ['firsthand', 'accompanied', 'not_experience', 'uncertain'],
      privacyDecision: ['clear', 'residual_identifier', 'uncertain'],
      aggregationDecision: ['include', 'exclude', 'uncertain'],
      aspects: [
        'access_and_wait', 'cost_and_billing', 'staff_interaction', 'process_and_information',
        'environment_and_facilities', 'continuity_and_follow_up', 'self_reported_outcome', 'other'
      ]
    },
    records: queueRecords
  };
  const queueText = `${JSON.stringify(queue, null, 2)}\n`;
  const manifest = {
    schemaVersion: 1,
    publicationStatus: 'LOCAL_REVIEW_ONLY',
    queueId,
    source: { fileName: basename(inputPath), sha256: sourceHash },
    queueSha256: hash(queueText),
    targets,
    counts: {
      total: queueRecords.length,
      byCohort: countBy(queueRecords, (record) => record.cohort),
      byPlatform: countBy(queueRecords, (record) => record.platform),
      byInstitution: countBy(queueRecords, (record) => record.proposedInstitution),
      byMatchMethod: countBy(queueRecords, (record) => record.machine.matchMethod)
    },
    boundaries: [
      'The private queue contains redacted but still sensitive user-generated text.',
      'The manifest contains counts and hashes only and is not evidence of publication approval.',
      'Every primary candidate still requires independent human adjudication.',
      'Restricted high-risk or identifier-bearing evidence is intentionally excluded from this standard queue.'
    ]
  };

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, 'review-queue-private.json'), queueText);
  writeFileSync(resolve(outputDir, 'review-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(resolve(outputDir, 'README.md'), [
    '# Social evidence pilot review packet', '',
    '**LOCAL REVIEW ONLY. Do not commit, upload, or publish this directory.**', '',
    '- `review-queue-private.json` contains redacted but still sensitive text for trained reviewers.',
    '- `review-manifest.json` contains counts and hashes but no user text.',
    '- Use two independent reviewer aliases and export label files locally.',
    '- Do not contact authors or interpret this workflow as crisis intervention.'
  ].join('\n'));
  return { queue, manifest };
}

function parseCli(args) {
  const options = { targets: [] };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value) throw new Error(`missing value for ${flag}`);
    if (flag === '--input') options.inputPath = resolve(value);
    else if (flag === '--output-dir') options.outputDir = resolve(value);
    else if (flag === '--target') options.targets.push(value);
    else if (flag === '--target-audit-per-institution') options.targetAuditPerInstitution = Number(value);
    else if (flag === '--unmatched-audit-per-platform') options.unmatchedAuditPerPlatform = Number(value);
    else throw new Error(`unknown argument: ${flag}`);
    index += 1;
  }
  if (!options.inputPath || !options.outputDir) throw new Error('provide --input and --output-dir');
  if (options.targets.length === 0) options.targets = DEFAULT_TARGETS;
  for (const field of ['targetAuditPerInstitution', 'unmatchedAuditPerPlatform']) {
    if (options[field] !== undefined && (!Number.isInteger(options[field]) || options[field] < 0)) {
      throw new Error(`${field} must be a non-negative integer`);
    }
  }
  return options;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const { manifest } = buildReviewPilot(parseCli(process.argv.slice(2)));
    console.log(JSON.stringify({ queueId: manifest.queueId, counts: manifest.counts }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
