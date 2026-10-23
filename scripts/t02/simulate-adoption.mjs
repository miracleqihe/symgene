import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { checkContentPack } from './check-content-pack.mjs';
import {
  ADOPTION_PHASES, createAdoptionState, readContentLock, resolveLockedDirectory,
  simulateAdoption, simulateRollback, updateEmergencyState, projectAdoptedKnowledge
} from './adoption.mjs';
import { adaptVerifiedBundle } from '../../src/content/adapter.js';
import { createEnvelope } from '../../src/storage/migrations.js';
import { upsertEntry, deleteEntry } from '../../src/storage/operations.js';
import { readKnowledge, createBackup, restoreBackup } from '../../src/storage/storage.js';
import { STORAGE_KEY } from '../../src/storage/constants.js';
import { validateData } from '../../src/validation/dataValidation.js';
import { matchKnowledge } from '../../src/search.js';
import { MemoryStorage } from '../../tests/helpers/storage-fixtures.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
function assert(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { code });
}

export async function runLocalSimulation(root = ROOT, { now = Date.now() } = {}) {
  await checkContentPack(root);
  const { verifyPack } = await import('../../vendor/t02/src/pack.mjs');
  const lock = readContentLock(root);
  assert(Array.isArray(lock.simulationArchives) && lock.simulationArchives.length >= 2, 'SIMULATION_TWO_ARCHIVES_REQUIRED');
  const verifyDescriptor = (descriptor) => verifyPack(resolveLockedDirectory(root, descriptor), { ...descriptor, baselineCounts: lock.policy.minimumCounts, allowSimulation: true });
  const verifyWebsite = async (pack) => validateData(adaptVerifiedBundle(pack.bundle, { allowSimulation: true }).seedData, { requireDrugSideEffects: true }).length === 0;
  const firstDescriptor = lock.simulationArchives.find((item) => item.contentVersion !== lock.candidate.contentVersion);
  assert(firstDescriptor, 'SIMULATION_INDEPENDENT_VERSION_REQUIRED');
  const first = await simulateAdoption(createAdoptionState(), firstDescriptor, { verifyCandidate: verifyDescriptor, verifyWebsite, websiteReviewApproved: true });
  assert(first.ok, first.code);
  const adopted = await simulateAdoption(first.state, lock.candidate, { verifyCandidate: verifyDescriptor, verifyWebsite, websiteReviewApproved: true });
  assert(adopted.ok, adopted.code);
  const adapter = adaptVerifiedBundle(adopted.state.active.bundle, { allowSimulation: true });
  const seed = adapter.seedData;
  const disease = seed.disorders[0];
  const target = adapter.identities.find((item) => item.collection === 'disorders' && item.legacyId === disease.id).canonicalId;
  const state = updateEmergencyState(adopted.state, {
    sequence: 50,
    targetIds: [target],
    issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 30 * 60 * 1000).toISOString()
  }, { trusted: true, now });
  let envelope = upsertEntry(createEnvelope(seed), 'disorders', { ...disease, summary: 'Fictional local override retained only in the simulation' }, { seedData: seed });
  envelope = upsertEntry(envelope, 'cases', { id: 'simulation-local-case', disorderId: disease.id, title: 'Fictional local case', summary: 'No real person', source: 'Synthetic local test' }, { seedData: seed });
  envelope = deleteEntry(envelope, 'resources', seed.resources[0].id, seed);
  const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(envelope)]]);
  const backup = createBackup(storage, storage.getItem(STORAGE_KEY));
  const merged = readKnowledge(storage, seed);
  assert(!merged.error, 'SIMULATION_STORAGE_MERGE_FAILED');
  const beforeProjection = JSON.stringify([...storage.values]);
  const visible = projectAdoptedKnowledge(state, merged.envelope.data, { now });
  assert(!visible.data.disorders.some((item) => item.id === disease.id), 'SIMULATION_DETAILS_LEAK');
  assert(!matchKnowledge(disease.name, visible.data).disorders.some((item) => item.item.id === disease.id), 'SIMULATION_SEARCH_LEAK');
  assert(JSON.stringify([...storage.values]) === beforeProjection, 'SIMULATION_STORAGE_MUTATED');
  const restored = restoreBackup(storage, backup, seed);
  assert(!projectAdoptedKnowledge(state, restored.envelope.data, { now }).data.disorders.some((item) => item.id === disease.id), 'SIMULATION_BACKUP_REVIVAL');
  const rollback = await simulateRollback(state, firstDescriptor.contentVersion, {
    websiteReviewApproved: true, verifyWebsite,
    verifyArchived: (pack) => verifyPack(pack.packDir, {
      contentVersion: pack.bundle.contentVersion, manifestSha256: pack.manifestSha256,
      packageDigest: pack.packageDigest, schemaRange: firstDescriptor.schemaRange, allowSimulation: true
    })
  });
  assert(rollback.ok, rollback.code);
  const oldSeed = adaptVerifiedBundle(rollback.state.active.bundle, { allowSimulation: true }).seedData;
  assert(!projectAdoptedKnowledge(rollback.state, oldSeed, { now }).data.disorders.some((item) => item.id === disease.id), 'SIMULATION_ROLLBACK_REVIVAL');
  const stale = projectAdoptedKnowledge(rollback.state, oldSeed, { now: now + 2 * 60 * 60 * 1000 });
  assert(!stale.fresh && Object.values(stale.data).every((rows) => rows.length === 0), 'SIMULATION_STALE_CACHE_LEAK');
  let failuresPreserved = 0;
  for (const failureAt of ADOPTION_PHASES) {
    const failed = await simulateAdoption(state, lock.candidate, { verifyCandidate: verifyDescriptor, verifyWebsite, websiteReviewApproved: true, failureAt });
    assert(!failed.ok && failed.state.active.packageDigest === state.active.packageDigest, 'SIMULATION_PARTIAL_ADOPTION');
    failuresPreserved += 1;
  }
  return {
    mode: 'local_simulation_only', production: 'legacy', publisherIdentity: 'not_configured',
    websiteReview: 'synthetic_decision_only', emergencyTrust: 'controlled_test_injection_only',
    adoptedVersion: state.active.bundle.contentVersion,
    rollbackVersion: rollback.state.active.bundle.contentVersion,
    verifiedArchiveCount: Object.keys(state.archives).length,
    emergencySequenceAfterRollback: rollback.state.emergency.sequence,
    failurePhasesPreserved: failuresPreserved,
    backupRevivalBlocked: true, searchAndDetailsBlocked: true,
    staleRetractionState: 'all_high_risk_content_hidden', userStorage: 'in_memory_synthetic_only'
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await runLocalSimulation(), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ status: 'REJECTED', code: error.code ?? 'SIMULATION_FAILED' }));
    process.exitCode = 1;
  }
}
