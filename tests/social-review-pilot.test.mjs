import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeReviewLabels } from '../scripts/research/analyze-review-labels.mjs';
import { buildReviewPilot } from '../scripts/research/build-review-pilot.mjs';
import { createReviewServer } from '../scripts/research/serve-review-pilot.mjs';

const institution = { id: 'example-1', name: '示例市安心医院' };
const row = (overrides) => ({
  platform: 'xhs', kind: 'contents', recordId: 'r_default', contentRef: 'r_default', parentRef: null,
  sourceTimestamp: 1, cleanedText: '示例文本', flags: [], entityMatches: [], entityMatchMethod: null,
  serviceExperience: false, aspects: [], sentiment: 'mixed_or_unclear', requiresHumanReview: false,
  candidateForExperienceReview: false, crossPlatformDuplicate: false, excludedAsDuplicate: false,
  engagement: {}, ...overrides
});

const writeJsonl = (path, rows) => writeFileSync(path, `${rows.map((value) => JSON.stringify(value)).join('\n')}\n`);

test('review pilot: builds a private stratified queue and text-free manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'symgene-review-pilot-'));
  try {
    const input = join(root, 'normalized-private.jsonl');
    writeJsonl(input, [
      row({ recordId: 'r_content_safe', cleanedText: '我在示例市安心医院看病，医生解释清楚', entityMatches: [institution], entityMatchMethod: 'direct', entityMatchEvidence: [{ institutionId: institution.id, terms: [institution.name] }], serviceExperience: true, aspects: ['staff_interaction'], candidateForExperienceReview: true }),
      row({ kind: 'comments', recordId: 'r_comment_safe', contentRef: 'r_content_safe', cleanedText: '我去复诊，挂号很方便', entityMatches: [institution], entityMatchMethod: 'content_context', serviceExperience: true, aspects: ['access_and_wait'], candidateForExperienceReview: true }),
      row({ recordId: 'r_target_negative', cleanedText: '示例市安心医院发布通知', flags: ['not_first_person_service_experience'], entityMatches: [institution], entityMatchMethod: 'direct' }),
      row({ kind: 'comments', platform: 'douyin', recordId: 'r_unmatched', contentRef: 'r_unknown', cleanedText: '我去看病，排队很久', flags: ['no_institution_match'], serviceExperience: true, aspects: ['access_and_wait'] }),
      row({ recordId: 'r_restricted_parent', cleanedText: '我在示例市安心医院看病时曾有自伤想法', flags: ['high_risk_personal_disclosure'], entityMatches: [institution], entityMatchMethod: 'direct', requiresHumanReview: true }),
      row({ kind: 'comments', recordId: 'r_restricted_comment', contentRef: 'r_restricted_parent', cleanedText: '我去复诊，挂号方便', flags: ['context_requires_restricted_review'], entityMatches: [institution], entityMatchMethod: 'content_context', serviceExperience: true, requiresHumanReview: true }),
      row({ recordId: 'r_stale_redaction', cleanedText: '我在示例市安心医院由[CLINICIAN]接诊', entityMatches: [institution], entityMatchMethod: 'direct', serviceExperience: true, candidateForExperienceReview: true })
    ]);
    const output = join(root, 'output');
    const { queue, manifest } = buildReviewPilot({
      inputPath: input,
      outputDir: output,
      targets: [institution.name],
      targetAuditPerInstitution: 1,
      unmatchedAuditPerPlatform: 1
    });

    assert.equal(queue.publicationStatus, 'LOCAL_REVIEW_ONLY');
    assert.equal(queue.records.length, 4);
    assert.equal(manifest.counts.byCohort.primary_candidate, 2);
    assert.equal(manifest.counts.byCohort.target_negative_audit, 1);
    assert.equal(manifest.counts.byCohort.unmatched_false_negative_audit, 1);
    assert.equal(queue.records.some((record) => record.reviewId === 'r_restricted_comment'), false);
    assert.equal(queue.records.some((record) => record.reviewId === 'r_stale_redaction'), false);
    assert.equal(queue.records.find((record) => record.reviewId === 'r_comment_safe').context.reviewId, 'r_content_safe');
    assert.deepEqual(queue.records.find((record) => record.reviewId === 'r_comment_safe').context.matchedTerms, [institution.name]);
    assert.equal('text' in queue.records.find((record) => record.reviewId === 'r_comment_safe').context, false);

    const manifestText = readFileSync(join(output, 'review-manifest.json'), 'utf8');
    assert.doesNotMatch(manifestText, /cleanedText|示例文本|医生解释|排队很久/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('review pilot server: binds a no-store, same-origin-only review surface', async () => {
  const root = mkdtempSync(join(tmpdir(), 'symgene-review-server-'));
  const queuePath = join(root, 'queue.json');
  writeFileSync(queuePath, JSON.stringify({ publicationStatus: 'LOCAL_REVIEW_ONLY', records: [{}] }));
  const server = createReviewServer({ queuePath });
  try {
    await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
    assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.doesNotMatch(html, /localStorage|https?:\/\//);
    assert.match(html, /本地证据审阅/);

    const queueResponse = await fetch(`http://127.0.0.1:${address.port}/queue.json`);
    assert.equal(queueResponse.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal((await queueResponse.json()).publicationStatus, 'LOCAL_REVIEW_ONLY');
  } finally {
    await new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
    rmSync(root, { recursive: true, force: true });
  }
});

test('review label analysis: reports coverage, agreement and text-free disagreements', () => {
  const root = mkdtempSync(join(tmpdir(), 'symgene-review-analysis-'));
  try {
    const shared = { schemaVersion: 1, publicationStatus: 'LOCAL_LABELS_ONLY', queueId: 'queue-example' };
    const annotation = (reviewId, aggregationDecision) => ({
      reviewId, entityDecision: 'correct', experienceDecision: 'firsthand', privacyDecision: 'clear',
      aggregationDecision, aspects: ['access_and_wait'], notes: '', complete: true
    });
    const leftPath = join(root, 'left.json');
    const rightPath = join(root, 'right.json');
    writeFileSync(leftPath, JSON.stringify({ ...shared, reviewerAlias: 'reviewer-a', annotations: [annotation('r1', 'include'), annotation('r2', 'include')] }));
    writeFileSync(rightPath, JSON.stringify({ ...shared, reviewerAlias: 'reviewer-b', annotations: [annotation('r1', 'include'), annotation('r2', 'exclude')] }));

    const report = analyzeReviewLabels({ labelPaths: [leftPath, rightPath] });
    assert.equal(report.coverage.completeOverlap, 2);
    assert.equal(report.agreement.entityDecision.observedAgreement, 1);
    assert.equal(report.agreement.aggregationDecision.observedAgreement, 0.5);
    assert.deepEqual(report.disagreements, [{ reviewId: 'r2', field: 'aggregationDecision' }]);
    assert.doesNotMatch(JSON.stringify(report), /示例文本|cleanedText/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
