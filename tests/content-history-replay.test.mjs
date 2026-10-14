import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { readFileSync } from 'node:fs';
import { runExpandedSimulation } from '../scripts/t02/expanded-simulation.mjs';
import { canonical, sha256 } from '../vendor/t02/src/contract.mjs';

let report;
let lockBefore;
before(async () => {
  lockBefore = readFileSync(new URL('../content-pack.lock', import.meta.url));
  report = await runExpandedSimulation();
});

test('expanded consumer: three complete versions retain independent same-name campuses and the locked count policy', () => {
  assert.equal(report.code, 'EXPANDED_SIMULATION_PASS');
  assert.deepEqual(report.population, { entities: 23, resources: 18, institutions: 9, sameNameCampuses: 8, distinctCampusProviderRefs: 8 });
  assert.equal(report.versions.length, 3);
  assert.equal(new Set(report.versions.map((version) => version.packageDigest)).size, 3);
  assert.deepEqual(report.versions.map((version) => version.counts.redirects), [1, 3, 4]);
  for (const version of report.versions) {
    assert.equal(version.counts.entities, 23);
    assert.equal(version.counts.reviews, 92);
    assert.match(version.manifestSha256, /^[a-f0-9]{64}$/);
  }
  const lock = JSON.parse(lockBefore);
  assert.equal(report.countPolicySha256, sha256(canonical(lock.policy)));
  assert.deepEqual(readFileSync(new URL('../content-pack.lock', import.meta.url)), lockBefore);
  assert.equal(report.replay.archiveCount, 3);
  assert.equal(report.replay.jsonRecoveries, 3);
  assert.equal(report.replay.successfulAdoptions, 4);
});

test('expanded consumer: source/claim/rights/review withdrawals survive rollback, backup restoration, and stale state', () => {
  assert.deepEqual(report.withdrawals.map((result) => result.kind), ['source', 'claim', 'rights', 'review']);
  for (const result of report.withdrawals) {
    assert.equal(result.code, 'WITHDRAWAL_ENFORCED');
    assert.deepEqual(result.rollbackAndBackup, result.adopted);
    assert.equal(result.adopted.institutionCount, 0);
    assert.equal(result.staleVisibleCount, 0);
    if (result.kind !== 'review') {
      assert.deepEqual(result.adopted.counts, { drugs: 0, disorders: 0, cases: 0, resources: 0 });
    } else {
      assert.deepEqual(result.adopted.counts, { drugs: 1, disorders: 1, cases: 2, resources: 7 });
    }
  }
});

test('expanded consumer: actual package and adoption gates reject invalid inputs and preserve every interrupted phase', () => {
  assert.deepEqual(Object.fromEntries(report.negatives.map((result) => [result.kind, result.code])), {
    provider: 'PROVIDER_REF_CONFLICT',
    'rights-evidence': 'RIGHTS_EVIDENCE_MISSING',
    'review-evidence': 'REVIEW_EVIDENCE_MISSING',
    'review-pending': 'REVIEW_NOT_APPROVED',
    'rights-expired': 'RIGHTS_EXPIRED',
    'review-expired': 'REVIEW_EXPIRED',
    url: 'DANGEROUS_URL',
    'count-drop': 'ADOPTION_COUNT_DROP',
    'builder-version-reuse': 'PACK_MANIFEST_HASH_MISMATCH',
    'adoption-version-reuse': 'ADOPTION_VERSION_CONFLICT',
    'partial-pack': 'PACK_FILE_SET_MISMATCH'
  });
  assert.deepEqual(report.failurePhases.map((result) => result.phase), ['built', 'verified', 'archived', 'website_reviewed', 'website_verified', 'adopted']);
  assert.ok(report.failurePhases.every((result) => result.code === 'ADOPTION_INJECTED_FAILURE'));
  assert.equal(report.replay.interruptedRetryCode, 'ADOPTION_INJECTED_FAILURE');
  assert.ok(report.checks >= 100);
});

test('expanded consumer: a second Git-outside run reproduces the checked-in aggregate report exactly', async () => {
  assert.deepEqual(await runExpandedSimulation(), report);
  const recorded = JSON.parse(readFileSync(new URL('../docs/t02/expanded-consumer-simulation.json', import.meta.url)));
  assert.deepEqual(recorded, report);
});

test('expanded consumer: report contains only aggregate evidence and keeps production legacy', () => {
  assert.equal(report.mode, 'local_simulation_only');
  assert.equal(report.production, 'legacy');
  assert.equal(report.identity, 'not_configured');
  const { reportSha256, ...body } = report;
  assert.equal(reportSha256, sha256(canonical(body)));
  const text = JSON.stringify(report);
  assert.doesNotMatch(text, /\/(?:Users|home|private|tmp|var)\/|"(?:payload|reviewerRef|evidenceRef)"|虚构同名|完全虚构/);
});
