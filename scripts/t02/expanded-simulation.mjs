import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildPack, verifyPack } from '../../vendor/t02/src/pack.mjs';
import { canonical, sha256, subjectDigest } from '../../vendor/t02/src/contract.mjs';
import { adaptVerifiedBundle, projectVisibleInstitutions } from '../../src/content/adapter.js';
import { ADOPTION_PHASES, createAdoptionState, loadLockedCandidate, readContentLock, simulateAdoption, simulateRollback, updateEmergencyState, projectAdoptedKnowledge } from './adoption.mjs';
import { verifyVendorProvenance } from './check-content-pack.mjs';
import { readLocalConfig } from './read-local-config.mjs';
import { validateData } from '../../src/validation/dataValidation.js';
import { createEnvelope } from '../../src/storage/migrations.js';
import { upsertEntry, deleteEntry } from '../../src/storage/operations.js';
import { STORAGE_KEY } from '../../src/storage/constants.js';
import { readKnowledge, createBackup, restoreBackup } from '../../src/storage/storage.js';
import { matchKnowledge } from '../../src/search.js';
import { MemoryStorage } from '../../tests/helpers/storage-fixtures.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const EXPANDED_NOW = Date.parse('2026-10-14T12:00:00Z');
const clone = (value) => JSON.parse(JSON.stringify(value));
const counts = (data) => Object.fromEntries(Object.entries(data).map(([kind, rows]) => [kind, rows.length]));
const total = (data) => Object.values(data).reduce((sum, rows) => sum + rows.length, 0);

/** Offline engineering exercise. Never reads a real browser or real raw inputs. */
export async function runExpandedSimulation({ now = EXPANDED_NOW } = {}) {
  let checks = 0;
  const check = (condition, code) => {
    if (!condition) throw Object.assign(new Error(code), { code });
    checks++;
  };
  check(Number.isFinite(now), 'EXPANDED_CLOCK_INVALID');
  const lock = readContentLock(ROOT);
  verifyVendorProvenance(ROOT);
  const producer = readLocalConfig(ROOT, 'vendor/t02/provenance.json');
  const { candidate } = await loadLockedCandidate(ROOT, { verifyPack, allowSimulation: true, now });
  const directory = mkdtempSync(join(tmpdir(), 'symgene-expanded-synthetic-'));
  const outputRoot = join(directory, 'packs');
  const buildOptions = {
    outputRoot, allowSimulation: true, now,
    pipelineCommit: producer.pipelineCommit, codeDigest: producer.codeDigest
  };
  const exact = (pack) => verifyPack(pack.packDir, {
    contentVersion: pack.contentVersion ?? pack.bundle.contentVersion,
    manifestSha256: pack.manifestSha256, packageDigest: pack.packageDigest,
    baselineCounts: lock.policy.minimumCounts, schemaRange: lock.candidate.schemaRange, allowSimulation: true, now
  });
  const websiteGate = async (pack) => validateData(adaptVerifiedBundle(pack.bundle, { allowSimulation: true }).seedData, { requireDrugSideEffects: true }).length === 0;
  const adopt = (state, pack, options = {}) => simulateAdoption(state, pack, {
    verifyCandidate: exact, websiteReviewApproved: true, verifyWebsite: websiteGate, ...options
  });
  const bindReviews = (bundle) => {
    bundle.reviews = bundle.reviews.map((review) => ({
      ...review, id: `review:${bundle.contentVersion}:${review.gate}:${review.subjectId}`,
      subjectDigest: subjectDigest(bundle, review.subjectId)
    }));
    return bundle;
  };
  const archiveDigest = (state) => sha256(canonical(Object.values(state.archives).map((pack) => ({
    contentVersion: pack.bundle.contentVersion, manifestSha256: pack.manifestSha256, packageDigest: pack.packageDigest
  })).sort((left, right) => left.contentVersion.localeCompare(right.contentVersion))));
  const safetyDigest = (state) => sha256(canonical({
    emergency: state.emergency, retractions: state.retainedPackRetractions,
    identities: state.retainedIdentities, redirects: state.retainedRedirects,
    dependencies: state.retainedDependencies, sequence: state.packRetractionSequence
  }));
  const checkPreserved = (before, after) => {
    check(after.active.packageDigest === before.active.packageDigest, 'EXPANDED_ACTIVE_REPLACED');
    check(archiveDigest(after) === archiveDigest(before), 'EXPANDED_ARCHIVE_REPLACED');
    check(safetyDigest(after) === safetyDigest(before), 'EXPANDED_SAFETY_STATE_REPLACED');
  };
  try {
    const firstBundle = clone(candidate.bundle);
    firstBundle.contentVersion = 'expanded-offline-v1';
    const parent = firstBundle.entities.find((entity) => entity.legacy?.collection === 'resources');
    const campus = firstBundle.entities.find((entity) => entity.legacy?.collection === 'institutions');
    check(parent && campus, 'EXPANDED_FACTORY_INPUT_MISSING');
    for (const [kind, template] of [['campus', campus], ['service', parent]]) {
      for (let index = 1; index <= 8; index++) {
        const suffix = String(index).padStart(2, '0');
        const entity = clone(template);
        entity.id = `resource:expanded-${kind}-${suffix}`;
        entity.legacy.id = `expanded-${kind}-${suffix}`;
        entity.legacy.order = index;
        entity.payload.id = entity.legacy.id;
        entity.aliases = [];
        entity.providerRefs = [{ provider: 'synthetic-expanded', namespace: kind, externalId: `fiction-${suffix}` }];
        if (kind === 'campus') {
          entity.payload.name = '虚构同名机构（扩展合成夹具）';
          entity.payload.note = '完全虚构的独立院区，只用于离线工程演练。';
          entity.payload.lng = 116.4 + index / 10000;
          entity.payload.lat = 39.9 + index / 10000;
          entity.parentId = parent.id;
        } else {
          entity.payload.title = `虚构资源 ${suffix}（扩展合成夹具）`;
          entity.payload.url = `https://example.org/synthetic-resource/${suffix}`;
        }
        firstBundle.entities.push(entity);
        for (const review of firstBundle.reviews.filter((item) => item.subjectId === template.id)) {
          firstBundle.reviews.push({ ...clone(review), subjectId: entity.id });
        }
      }
    }
    bindReviews(firstBundle);
    const secondBundle = clone(firstBundle);
    secondBundle.contentVersion = 'expanded-offline-v2';
    const newId = 'resource:expanded-renamed';
    const rename = (bundle, from, to) => {
      bundle.entities.forEach((entity) => {
        if (entity.id === from) entity.id = to;
        if (entity.parentId === from) entity.parentId = to;
        for (const field of ['sourceIds', 'claimIds']) entity[field] = entity[field].map((id) => id === from ? to : id);
      });
      bundle.reviews.forEach((review) => { if (review.subjectId === from) review.subjectId = to; });
    };
    rename(secondBundle, parent.id, newId);
    secondBundle.redirects.push({ from: parent.id, to: 'resource:expanded-middle' }, { from: 'resource:expanded-middle', to: newId });
    bindReviews(secondBundle);
    const thirdBundle = clone(secondBundle);
    thirdBundle.contentVersion = 'expanded-offline-v3';
    const finalId = 'resource:expanded-final';
    rename(thirdBundle, newId, finalId);
    thirdBundle.redirects.push({ from: newId, to: finalId });
    bindReviews(thirdBundle);
    const bundles = [firstBundle, secondBundle, thirdBundle];
    const packs = bundles.map((bundle) => buildPack(bundle, buildOptions));
    const expandedCampus = firstBundle.entities.filter((entity) => entity.id.startsWith('resource:expanded-campus-'));
    check(new Set(expandedCampus.map((entity) => entity.payload.name)).size === 1, 'EXPANDED_SAME_NAME_FIXTURE_MISSING');
    check(new Set(expandedCampus.map((entity) => canonical(entity.providerRefs[0]))).size === 8, 'EXPANDED_PROVIDER_IDENTITIES_COLLIDED');
    const first = await adopt(createAdoptionState(), packs[0]);
    check(first.ok, first.code ?? 'EXPANDED_FIRST_ADOPTION_FAILED');
    const second = await adopt(clone(first.state), packs[1]);
    check(second.ok, second.code ?? 'EXPANDED_SECOND_ADOPTION_FAILED');
    const interrupted = await adopt(second.state, packs[2], { failureAt: 'website_verified' });
    check(!interrupted.ok && interrupted.code === 'ADOPTION_INJECTED_FAILURE', 'EXPANDED_RETRY_FAILURE_MISSING');
    checkPreserved(second.state, interrupted.state);
    const third = await adopt(clone(interrupted.state), packs[2]);
    check(third.ok, third.code ?? 'EXPANDED_THIRD_ADOPTION_FAILED');
    const retry = await adopt(clone(third.state), packs[2]);
    check(retry.ok && Object.keys(retry.state.archives).length === 3, 'EXPANDED_IMMUTABLE_RETRY_FAILED');
    const state = retry.state;
    const activeAdapter = adaptVerifiedBundle(state.active.bundle, { allowSimulation: true });
    const seed = activeAdapter.seedData;
    const sourceId = thirdBundle.entities.find((entity) => entity.type === 'source').id;
    const claimId = thirdBundle.entities.find((entity) => entity.type === 'claim').id;
    const reviewId = thirdBundle.reviews.find((review) => review.subjectId === finalId && review.gate === 'facts').id;
    const scenarios = [['source', sourceId], ['claim', claimId], ['rights', thirdBundle.rights[0].id], ['review', reviewId]];
    const withdrawalResults = [];
    for (const [index, [kind, targetId]] of scenarios.entries()) {
      const sequence = 100 + index;
      const withdrawn = updateEmergencyState(clone(state), {
        sequence, targetIds: [targetId], issuedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 1800000).toISOString()
      }, { trusted: true, now });
      let envelope = upsertEntry(createEnvelope(seed), 'disorders', { ...seed.disorders[0], summary: '完全虚构的本地覆盖，仅用于演练。' }, { seedData: seed });
      envelope = upsertEntry(envelope, 'cases', { ...seed.cases[0], id: 'expanded-local-case', title: '完全虚构的本地案例' }, { seedData: seed });
      envelope = upsertEntry(envelope, 'resources', { ...seed.resources[0], title: '完全虚构的本地资源覆盖' }, { seedData: seed });
      envelope = deleteEntry(envelope, 'resources', seed.resources.at(-1).id, seed);
      const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(envelope)]]);
      const backup = createBackup(storage, storage.getItem(STORAGE_KEY));
      const merged = readKnowledge(storage, seed);
      check(!merged.error && merged.envelope.deletedIds.resources.includes(seed.resources.at(-1).id), 'EXPANDED_STORAGE_MERGE_FAILED');
      const inspect = (current, data) => {
        const bytesBefore = JSON.stringify([...storage.values]);
        const dataBefore = canonical(data);
        const visible = projectAdoptedKnowledge(current, data, { now });
        const adapter = adaptVerifiedBundle(current.active.bundle, { allowSimulation: true });
        // Knowledge projection exposes the retained historical deny closure;
        // use that same closure for the separate institution consumer.
        const institutionProjection = projectVisibleInstitutions(adapter.institutions, adapter, { ...current.emergency, targetIds: visible.denied }, { now });
        check(!visible.data.resources.some((item) => item.id === parent.legacy.id), 'EXPANDED_DETAILS_REVIVAL');
        // The existing search returns disorders/cases/drugs; resources are
        // checked through their actual directory/details data boundary.
        const search = matchKnowledge(seed.disorders[0].name, visible.data);
        if (kind !== 'review') {
          check(search.disorders.length + search.cases.length + search.drugs.length === 0, 'EXPANDED_SEARCH_REVIVAL');
        } else {
          check(search.disorders.some((item) => item.item.id === seed.disorders[0].id), 'EXPANDED_UNRELATED_SEARCH_HIDDEN');
        }
        check(institutionProjection.institutions.length === 0, 'EXPANDED_CAMPUS_REVIVAL');
        check(JSON.stringify([...storage.values]) === bytesBefore && canonical(data) === dataBefore, 'EXPANDED_USER_BYTES_MUTATED');
        if (kind !== 'review') check(total(visible.data) === 0, 'EXPANDED_DEPENDENCY_REVIVAL');
        else check(visible.data.drugs.length === 1 && visible.data.resources.length === 7, 'EXPANDED_UNRELATED_CONTENT_HIDDEN');
        return { counts: counts(visible.data), institutionCount: institutionProjection.institutions.length, deniedCount: visible.denied.length };
      };
      const adoptedVisible = inspect(withdrawn, merged.envelope.data);
      const rollback = await simulateRollback(clone(withdrawn), firstBundle.contentVersion, { verifyArchived: exact, websiteReviewApproved: true, verifyWebsite: websiteGate });
      check(rollback.ok && rollback.state.emergency.sequence === sequence, rollback.code ?? 'EXPANDED_ROLLBACK_FAILED');
      const oldSeed = adaptVerifiedBundle(rollback.state.active.bundle, { allowSimulation: true }).seedData;
      const restored = restoreBackup(storage, backup, oldSeed);
      check(!restored.error && restored.envelope.data.resources.some((item) => item.id === parent.legacy.id), 'EXPANDED_BACKUP_FIXTURE_MISSING');
      const rollbackVisible = inspect(rollback.state, restored.envelope.data);
      const stale = projectAdoptedKnowledge(rollback.state, restored.envelope.data, { now: now + 7200000 });
      check(!stale.fresh && total(stale.data) === 0, 'EXPANDED_STALE_STATE_REVIVAL');
      withdrawalResults.push({ kind, sequence, targetSha256: sha256(targetId), adopted: adoptedVisible, rollbackAndBackup: rollbackVisible, staleVisibleCount: total(stale.data), code: 'WITHDRAWAL_ENFORCED' });
    }
    const negativeResults = [];
    const rejectBuild = (name, mutate, expected) => {
      const bundle = clone(thirdBundle);
      bundle.contentVersion = `expanded-invalid-${name}`;
      mutate(bundle);
      let code = null;
      try { buildPack(bindReviews(bundle), buildOptions); } catch (error) { code = error.code ?? 'BUILD_FAILED'; }
      check(code === expected, 'EXPANDED_NEGATIVE_NOT_REJECTED');
      negativeResults.push({ kind: name, code });
    };
    rejectBuild('provider', (bundle) => { bundle.entities.at(-1).providerRefs = clone(bundle.entities.at(-2).providerRefs); }, 'PROVIDER_REF_CONFLICT');
    rejectBuild('rights-evidence', (bundle) => { bundle.rights[0].evidenceRef = ' '; }, 'RIGHTS_EVIDENCE_MISSING');
    rejectBuild('review-evidence', (bundle) => { bundle.reviews[0].evidenceRef = ' '; }, 'REVIEW_EVIDENCE_MISSING');
    rejectBuild('review-pending', (bundle) => { bundle.reviews[0].decision = 'pending'; }, 'REVIEW_NOT_APPROVED');
    rejectBuild('rights-expired', (bundle) => { bundle.rights[0].expiresAt = new Date(now - 1000).toISOString(); }, 'RIGHTS_EXPIRED');
    rejectBuild('review-expired', (bundle) => { bundle.reviews[0].expiresAt = new Date(now - 1000).toISOString(); }, 'REVIEW_EXPIRED');
    rejectBuild('url', (bundle) => { bundle.entities.find((entity) => entity.legacy?.collection === 'resources').payload.url = 'javascript:syntheticOnly()'; }, 'DANGEROUS_URL');
    const reduced = clone(thirdBundle);
    reduced.contentVersion = 'expanded-count-drop';
    const dropped = reduced.entities.at(-1).id;
    reduced.entities = reduced.entities.filter((entity) => entity.id !== dropped);
    reduced.reviews = reduced.reviews.filter((review) => review.subjectId !== dropped);
    const countDrop = await adopt(state, buildPack(bindReviews(reduced), buildOptions));
    check(!countDrop.ok && countDrop.code === 'ADOPTION_COUNT_DROP', 'EXPANDED_COUNT_DROP_ACCEPTED');
    checkPreserved(state, countDrop.state);
    negativeResults.push({ kind: 'count-drop', code: countDrop.code });
    const replacement = clone(thirdBundle);
    replacement.entities.find((entity) => entity.legacy?.collection === 'resources').payload.title = '另一个完全虚构快照，不得覆盖同版本。';
    bindReviews(replacement);
    let collisionCode = null;
    try { buildPack(replacement, buildOptions); } catch (error) { collisionCode = error.code ?? 'BUILD_FAILED'; }
    check(collisionCode === 'PACK_MANIFEST_HASH_MISMATCH', 'EXPANDED_VERSION_OVERWRITTEN');
    check(exact(packs[2]).packageDigest === packs[2].packageDigest, 'EXPANDED_ORIGINAL_PACK_MUTATED');
    negativeResults.push({ kind: 'builder-version-reuse', code: collisionCode });
    const conflictingPack = buildPack(replacement, { ...buildOptions, outputRoot: join(directory, 'conflicting-pack') });
    const conflict = await adopt(state, conflictingPack);
    check(!conflict.ok && conflict.code === 'ADOPTION_VERSION_CONFLICT', 'EXPANDED_CONFLICT_ADOPTED');
    checkPreserved(state, conflict.state);
    negativeResults.push({ kind: 'adoption-version-reuse', code: conflict.code });
    const partial = join(directory, 'partial-pack');
    cpSync(packs[2].packDir, partial, { recursive: true });
    rmSync(join(partial, 'bundle.json'));
    const partialAttempt = await adopt(state, { ...packs[2], packDir: partial });
    check(!partialAttempt.ok && partialAttempt.code === 'PACK_FILE_SET_MISMATCH', 'EXPANDED_PARTIAL_PACK_ADOPTED');
    checkPreserved(state, partialAttempt.state);
    negativeResults.push({ kind: 'partial-pack', code: partialAttempt.code });
    const phaseResults = [];
    for (const failureAt of ADOPTION_PHASES) {
      const failed = await adopt(state, packs[2], { failureAt });
      check(!failed.ok && failed.code === 'ADOPTION_INJECTED_FAILURE', 'EXPANDED_FAILURE_PHASE_ACCEPTED');
      checkPreserved(state, failed.state);
      phaseResults.push({ phase: failureAt, code: failed.code });
    }
    const report = {
      reportVersion: 1, mode: 'local_simulation_only', production: 'legacy', identity: 'not_configured',
      inputManifestSha256: candidate.manifestSha256, inputPackageDigest: candidate.packageDigest,
      producerCodeDigest: producer.codeDigest, producerPipelineCommit: producer.pipelineCommit,
      countPolicySha256: sha256(canonical(lock.policy)),
      population: { entities: firstBundle.entities.length, resources: firstBundle.entities.filter((entity) => entity.type === 'resource').length, institutions: activeAdapter.institutions.length, sameNameCampuses: expandedCampus.length, distinctCampusProviderRefs: 8 },
      versions: packs.map((pack, index) => ({ ordinal: index + 1, manifestSha256: pack.manifestSha256, packageDigest: pack.packageDigest, counts: pack.manifest.counts })),
      replay: { archiveCount: Object.keys(state.archives).length, jsonRecoveries: 3, successfulAdoptions: 4, interruptedRetryCode: interrupted.code, archiveIndexSha256: archiveDigest(state), safetyStateSha256: safetyDigest(state) },
      withdrawals: withdrawalResults, negatives: negativeResults, failurePhases: phaseResults, checks, code: 'EXPANDED_SIMULATION_PASS'
    };
    return { ...report, reportSha256: sha256(canonical(report)) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await runExpandedSimulation(), null, 2)); }
  catch (error) {
    console.error(JSON.stringify({ code: error.code ?? 'EXPANDED_SIMULATION_FAILED' }));
    process.exitCode = 1;
  }
}
