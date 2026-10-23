import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  adaptVerifiedBundle, createRetractionLedger, acceptEmergencyRetractions,
  effectiveRetractions, projectVisibleKnowledge, projectVisibleInstitutions
} from '../src/content/adapter.js';
import {
  ADOPTION_PHASES, createAdoptionState, simulateAdoption, simulateRollback,
  updateEmergencyState, projectAdoptedKnowledge, readContentLock, resolveLockedDirectory, loadLockedCandidate
} from '../scripts/t02/adoption.mjs';
import { createEnvelope } from '../src/storage/migrations.js';
import { deleteEntry, upsertEntry } from '../src/storage/operations.js';
import { readKnowledge, restoreBackup, listBackups, createBackup } from '../src/storage/storage.js';
import { STORAGE_KEY } from '../src/storage/constants.js';
import { validateData } from '../src/validation/dataValidation.js';
import { matchKnowledge } from '../src/search.js';
import { MemoryStorage, makeSeed, clone, customEntry } from './helpers/storage-fixtures.mjs';
import { measureLegacySeed } from '../scripts/t02-golden.mjs';
import { cloneSeed } from '../src/data.js';

const NOW = Date.parse('2026-10-14T12:00:00Z');
const CLOCK = new Date(NOW);
const event = (sequence, targetIds = []) => ({
  sequence, targetIds,
  issuedAt: '2026-10-14T11:59:00Z', expiresAt: '2026-10-14T12:30:00Z'
});
const fresh = (targetIds = []) => acceptEmergencyRetractions(createRetractionLedger(), event(1, targetIds), { trusted: true, now: NOW });

function bundleFor(seed = makeSeed(), version = 'sim-unit-1') {
  return {
    schemaVersion: '1.0.0', contentVersion: version, mode: 'simulation',
    entities: Object.entries(seed).flatMap(([collection, rows]) => rows.map((payload, order) => ({
      id: `canonical:${collection}:${payload.id}`, type: collection === 'cases' ? 'scenario' : collection === 'resources' ? 'resource' : 'contentEntry',
      payload: clone(payload), legacy: { collection, id: payload.id, order },
      aliases: [], providerRefs: [], sourceIds: [], claimIds: []
    }))),
    redirects: [], retractions: []
  };
}

// This descriptor is used only by the state-machine unit tests. The separate
// locked-package test below runs the real vendored verifier over real bytes.
function unitPack(bundle, digest = bundle.contentVersion.padEnd(64, '0')) {
  const typeCount = (type) => bundle.entities.filter((entity) => entity.type === type).length;
  return { bundle: clone(bundle), manifest: {
    retractionSequence: Math.max(0, ...bundle.retractions.map((x) => x.sequence)),
    counts: {
      entities: bundle.entities.length, sources: typeCount('source'), claims: typeCount('claim'),
      contentEntries: typeCount('contentEntry'), scenarios: typeCount('scenario'), resources: typeCount('resource'),
      rights: bundle.rights?.length ?? 0, reviews: bundle.reviews?.length ?? 0,
      redirects: bundle.redirects.length, retractions: bundle.retractions.length
    }
  }, packageDigest: digest, manifestSha256: digest };
}
async function adopt(state, pack, options = {}) {
  return simulateAdoption(state, pack, {
    verifyCandidate: async (candidate) => clone(candidate),
    verifyWebsite: async (candidate) => validateData(adaptVerifiedBundle(candidate.bundle, { allowSimulation: true }).seedData).length === 0,
    websiteReviewApproved: true,
    ...options
  });
}

test('content adapter: exact legacy fields/order and independent clone; simulation opt-in', () => {
  const seed = makeSeed();
  const bundle = bundleFor(seed);
  bundle.entities.reverse();
  assert.throws(() => adaptVerifiedBundle(bundle), { code: 'ADAPTER_MODE_REJECTED' });
  const projected = adaptVerifiedBundle(bundle, { allowSimulation: true });
  assert.deepEqual(projected.seedData, seed);
  assert.deepEqual(validateData(projected.seedData), []);
  projected.seedData.drugs[0].name = 'changed only in returned clone';
  assert.deepEqual(adaptVerifiedBundle(bundle, { allowSimulation: true }).seedData, seed);
});

test('content adapter: canonical/legacy/order ambiguity is rejected without rewriting IDs', () => {
  for (const [mutation, code] of [
    [(b) => { b.entities[1].id = b.entities[0].id; }, 'ADAPTER_CANONICAL_COLLISION'],
    [(b) => { b.entities[1].legacy.id = b.entities[0].legacy.id; b.entities[1].payload.id = b.entities[0].payload.id; }, 'ADAPTER_LEGACY_COLLISION'],
    [(b) => { b.entities[1].legacy.order = 0; }, 'ADAPTER_ORDER_COLLISION'],
    [(b) => { b.entities[0].payload.id = 'renamed'; }, 'ADAPTER_LEGACY_ID_MISMATCH']
  ]) {
    const bundle = bundleFor();
    mutation(bundle);
    assert.throws(() => adaptVerifiedBundle(bundle, { allowSimulation: true }), { code });
  }
});

test('content adapter: numeric institution IDs retain their original type', () => {
  const bundle = bundleFor();
  bundle.entities.push({ id: 'resource:institution-0', type: 'resource', payload: { id: 0, name: 'Fictional institution' }, legacy: { collection: 'institutions', id: 0, order: 0 } });
  const adapter = adaptVerifiedBundle(bundle, { allowSimulation: true });
  assert.equal(adapter.institutions[0].id, 0);
  assert.deepEqual(projectVisibleInstitutions(adapter.institutions, adapter, fresh(['resource:institution-0']), { now: NOW }).institutions, []);
});

test('retractions: authenticated channel, monotonic sequence, no same-sequence equivocation', () => {
  assert.throws(() => acceptEmergencyRetractions(createRetractionLedger(), event(1), { now: NOW }), { code: 'RETRACTION_UNTRUSTED' });
  const first = fresh(['canonical:drugs:drug-core']);
  const second = acceptEmergencyRetractions(first, event(2, ['canonical:resources:resource-core']), { trusted: true, now: NOW });
  assert.equal(second.targetIds.length, 2);
  assert.deepEqual(acceptEmergencyRetractions(second, event(2, ['canonical:resources:resource-core']), { trusted: true, now: NOW }), second);
  assert.throws(() => acceptEmergencyRetractions(second, event(1), { trusted: true, now: NOW }), { code: 'RETRACTION_DOWNGRADE' });
  assert.throws(() => acceptEmergencyRetractions(first, event(1, []), { trusted: true, now: NOW }), { code: 'RETRACTION_EQUIVOCATION' });
});

test('retractions: redirect and canonical/legacy closure plus source dependency propagation', () => {
  const bundle = bundleFor();
  bundle.entities.push({ id: 'source:fictional', type: 'source', payload: {}, sourceIds: [], claimIds: [] });
  bundle.entities[0].sourceIds = ['source:fictional'];
  bundle.redirects = [{ from: 'old:source', to: 'source:fictional' }];
  const adapter = adaptVerifiedBundle(bundle, { allowSimulation: true });
  const result = effectiveRetractions(adapter, fresh(['old:source']), { now: NOW });
  assert.ok(result.denied.includes('canonical:drugs:drug-core'));
  assert.ok(result.denied.includes('drugs:drug-core'));
  assert.ok(!projectVisibleKnowledge(makeSeed(), adapter, fresh(['old:source']), { now: NOW }).data.drugs.some((x) => x.id === 'drug-core'));
});

test('retractions: withdrawn parent and medication hide dependent entities without rewriting relationships', () => {
  const seed = makeSeed();
  const bundle = bundleFor(seed);
  const parent = bundle.entities.find((item) => item.legacy?.id === 'resource-core');
  const child = bundle.entities.find((item) => item.legacy?.id === 'resource-extra');
  child.parentId = parent.id;
  const adapter = adaptVerifiedBundle(bundle, { allowSimulation: true });
  assert.ok(!projectVisibleKnowledge(seed, adapter, fresh([parent.id]), { now: NOW }).data.resources.some((item) => item.id === 'resource-extra'));
  seed.disorders.push({ ...seed.disorders[0], id: 'local-disorder', name: 'Fictional local dependent disease' });
  seed.cases.push({ ...seed.cases[0], id: 'local-case', disorderId: 'local-disorder' });
  const before = clone(seed);
  const projected = projectVisibleKnowledge(seed, adapter, fresh(['canonical:drugs:drug-core']), { now: NOW });
  assert.ok(!projected.data.disorders.some((item) => ['disorder-core', 'local-disorder'].includes(item.id)));
  assert.equal(projected.data.cases.length, 0);
  assert.deepEqual(seed, before);
  assert.deepEqual(seed.disorders[0].relatedDrugIds, ['drug-core']);
});

test('retractions: withdrawing rights, a required review, or the review set hides their subjects and dependents', () => {
  const bundle = bundleFor();
  bundle.reviewSetId = 'reviewset:synthetic';
  bundle.entities.forEach((entity) => { entity.rightsId = 'rights:synthetic'; });
  bundle.reviews = [{ id: 'review:facts:synthetic-drug', subjectId: 'canonical:drugs:drug-core' }];
  const adapter = adaptVerifiedBundle(bundle, { allowSimulation: true });
  for (const target of ['rights:synthetic', 'reviewset:synthetic']) {
    assert.ok(Object.values(projectVisibleKnowledge(makeSeed(), adapter, fresh([target]), { now: NOW }).data).every((rows) => rows.length === 0));
  }
  const reviewWithdrawn = projectVisibleKnowledge(makeSeed(), adapter, fresh(['review:facts:synthetic-drug']), { now: NOW });
  assert.ok(!reviewWithdrawn.data.drugs.some((item) => item.id === 'drug-core'));
  assert.ok(!reviewWithdrawn.data.disorders.some((item) => item.id === 'disorder-core'));
  assert.equal(reviewWithdrawn.data.cases.length, 0);
});

test('retractions: missing/stale trusted state hides all high-risk content including local additions', () => {
  const seed = makeSeed();
  seed.cases.push(customEntry('cases'));
  const adapter = adaptVerifiedBundle(bundleFor(), { allowSimulation: true });
  for (const ledger of [createRetractionLedger(), fresh()]) {
    const now = ledger.sequence ? NOW + 2 * 60 * 60 * 1000 : NOW;
    const projected = projectVisibleKnowledge(seed, adapter, ledger, { now });
    assert.equal(projected.fresh, false);
    assert.ok(Object.values(projected.data).every((rows) => rows.length === 0));
  }
  assert.equal(seed.cases.length, 3);
});

test('storage compatibility: overrides, tombstones, custom cases and backups survive projection', () => {
  const seed = makeSeed();
  const bundle = bundleFor(seed);
  let envelope = upsertEntry(createEnvelope(seed), 'disorders', { ...seed.disorders[0], summary: 'Fictional local override' }, { seedData: seed, now: CLOCK });
  envelope = upsertEntry(envelope, 'cases', customEntry('cases'), { seedData: seed, now: CLOCK });
  envelope = deleteEntry(envelope, 'resources', 'resource-extra', seed, { now: CLOCK });
  const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(envelope)]]);
  const nextSeed = clone(seed);
  nextSeed.disorders[0].source = 'Fictional updated source';
  const read = readKnowledge(storage, nextSeed, { now: CLOCK });
  assert.equal(read.error, null);
  assert.equal(read.envelope.data.disorders[0].summary, 'Fictional local override');
  assert.equal(read.envelope.data.disorders[0].source, 'Fictional updated source');
  assert.ok(read.envelope.deletedIds.resources.includes('resource-extra'));
  assert.ok(read.envelope.data.cases.some((x) => x.id === 'case-custom'));
  const before = [...storage.values];
  const adapter = adaptVerifiedBundle(bundle, { allowSimulation: true });
  const denied = fresh(['canonical:disorders:disorder-core']);
  const visible = projectVisibleKnowledge(read.envelope.data, adapter, denied, { now: NOW });
  assert.ok(!visible.data.disorders.some((x) => x.id === 'disorder-core'));
  assert.equal(visible.data.cases.length, 0);
  assert.deepEqual(matchKnowledge('核心疾病', visible.data).disorders, []);
  assert.deepEqual([...storage.values], before, 'projection must not mutate storage or backup bytes');
  assert.ok(listBackups(storage).length > 0);
  const restored = restoreBackup(storage, read.backupKey, nextSeed, { now: new Date(NOW + 1000) });
  assert.ok(restored.envelope.data.disorders.some((x) => x.id === 'disorder-core'));
  assert.ok(!projectVisibleKnowledge(restored.envelope.data, adapter, denied, { now: NOW }).data.disorders.some((x) => x.id === 'disorder-core'));
});

test('storage 25zg regression: source deletion retains a disease; emergency retraction still hides it', () => {
  const seed = makeSeed();
  const data = clone(seed);
  data.cases.push(customEntry('cases'));
  const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(createEnvelope(data, { seedIds: Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((x) => x.id)])) }))]]);
  const nextSeed = clone(seed);
  nextSeed.disorders = nextSeed.disorders.filter((x) => x.id !== 'disorder-core');
  nextSeed.cases = [];
  const read = readKnowledge(storage, nextSeed, { now: CLOCK });
  assert.equal(read.error, null);
  assert.ok(read.envelope.data.disorders.some((x) => x.id === 'disorder-core'));
  const adapter = adaptVerifiedBundle(bundleFor(seed), { allowSimulation: true });
  const projected = projectVisibleKnowledge(read.envelope.data, adapter, fresh(['canonical:disorders:disorder-core']), { now: NOW });
  assert.ok(!projected.data.disorders.some((x) => x.id === 'disorder-core'));
  assert.deepEqual(projected.data.cases, []);
});

for (const failureAt of ADOPTION_PHASES) {
  test(`atomic local adoption: controlled failure at ${failureAt} keeps previous verified package`, async () => {
    const first = await adopt(createAdoptionState(), unitPack(bundleFor()));
    const before = clone(first.state);
    const failed = await adopt(before, unitPack(bundleFor(makeSeed(), 'sim-unit-2')), { failureAt });
    assert.equal(failed.ok, false);
    assert.deepEqual(failed.state.active, before.active);
    assert.deepEqual(failed.state.archives, before.archives);
    assert.deepEqual(failed.state.emergency, before.emergency);
    assert.equal(failed.state.production, 'legacy');
  });
}

test('atomic local adoption: interrupted verification, build failure and missing website review reject', async () => {
  const first = await adopt(createAdoptionState(), unitPack(bundleFor()));
  for (const options of [
    { verifyCandidate: async () => { throw Object.assign(new Error('controlled interruption'), { code: 'PACK_INTERRUPTED' }); } },
    { verifyWebsite: async () => false },
    { websiteReviewApproved: false }
  ]) {
    const failed = await adopt(first.state, unitPack(bundleFor(makeSeed(), 'sim-unit-2')), options);
    assert.equal(failed.ok, false);
    assert.deepEqual(failed.state.active, first.state.active);
  }
});

test('adoption and rollback fail closed when the explicit website verifier is omitted', async () => {
  const pack = unitPack(bundleFor());
  const missing = await simulateAdoption(createAdoptionState(), pack, {
    verifyCandidate: async (candidate) => clone(candidate), websiteReviewApproved: true
  });
  assert.equal(missing.code, 'ADOPTION_WEBSITE_VERIFIER_REQUIRED');
  assert.equal(missing.state.active, null);
  const first = await adopt(createAdoptionState(), pack);
  const rollback = await simulateRollback(first.state, pack.bundle.contentVersion, {
    verifyArchived: async (archived) => clone(archived), websiteReviewApproved: true
  });
  assert.equal(rollback.code, 'ROLLBACK_WEBSITE_VERIFIER_REQUIRED');
});

test('rollback cannot revive emergency or previously adopted package retractions', async () => {
  const seed = makeSeed();
  const first = await adopt(createAdoptionState(), unitPack(bundleFor(seed)));
  const secondBundle = bundleFor(seed, 'sim-unit-2');
  secondBundle.retractions = [{ id: 'retraction:unit-1', targetId: 'canonical:drugs:drug-core', sequence: 1, effectiveAt: '2026-10-14T11:00:00Z', reasonCode: 'SYNTHETIC_TEST' }];
  const second = await adopt(first.state, unitPack(secondBundle));
  const withEmergency = updateEmergencyState(second.state, event(5, ['canonical:disorders:disorder-core']), { trusted: true, now: NOW });
  const rollback = await simulateRollback(withEmergency, 'sim-unit-1', {
    verifyArchived: async (pack) => clone(pack),
    verifyWebsite: async (pack) => validateData(adaptVerifiedBundle(pack.bundle, { allowSimulation: true }).seedData).length === 0,
    websiteReviewApproved: true
  });
  assert.equal(rollback.ok, true);
  assert.equal(rollback.state.emergency.sequence, 5);
  assert.equal(rollback.state.packRetractionSequence, 1);
  const visible = projectAdoptedKnowledge(rollback.state, seed, { now: NOW });
  assert.ok(!visible.data.drugs.some((x) => x.id === 'drug-core'));
  assert.ok(!visible.data.disorders.some((x) => x.id === 'disorder-core'));
  assert.equal(projectAdoptedKnowledge(rollback.state, seed, { now: NOW + 2 * 60 * 60 * 1000 }).fresh, false);
  const lower = await adopt(withEmergency, unitPack(bundleFor(seed, 'sim-unit-3')));
  assert.equal(lower.code, 'ADOPTION_RETRACTION_DOWNGRADE');
});

test('lock keeps production legacy and rejects traversal before looking up a package', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  assert.equal(readContentLock(root).adoption, 'legacy');
  for (const path of ['../outside', join(tmpdir(), 'synthetic-package'), 'content-packs/../outside', 'content-packs\\outside']) {
    assert.throws(() => resolveLockedDirectory(root, { path }), { code: 'LOCK_PATH_INVALID' });
  }
});

test('lock: deleting the configured candidate is a hard failure', () => {
  const directory = mkdtempSync(join(tmpdir(), 'symgene-lock-test-'));
  try {
    writeFileSync(join(directory, 'content-pack.lock'), JSON.stringify({ lockVersion: 1, adoption: 'legacy', scope: 'local_simulation_only', candidate: null }));
    assert.throws(() => readContentLock(directory), { code: 'LOCK_CANDIDATE_MISSING' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('locked synthetic package: real full-package verifier and existing website validator', async () => {
  const { checkContentPack } = await import('../scripts/t02/check-content-pack.mjs');
  const result = await checkContentPack();
  assert.equal(result.adoption, 'legacy');
  // During initial scaffolding there is no candidate; delivery requires the
  // exact immutable fixture lock and this assertion rejects an empty slot.
  assert.equal(result.status, 'SIMULATION_VERIFIED');
  assert.equal(result.publisherIdentity, 'not_configured');
});

test('real institution package fields remain exact and resolve through the existing map consumer', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const { verifyPack } = await import('../vendor/t02/src/pack.mjs');
  const { validateBundle } = await import('../vendor/t02/src/contract.mjs');
  const { verifyInstitutionConsumer } = await import('../scripts/t02/check-content-pack.mjs');
  const { PROVINCE_GEO, project } = await import('../src/atlas/china/index.js');
  const locked = await loadLockedCandidate(root, { verifyPack, allowSimulation: true });
  const entity = locked.candidate.bundle.entities.find((item) => item.legacy?.collection === 'institutions');
  const adapter = adaptVerifiedBundle(locked.candidate.bundle, { allowSimulation: true });
  const institution = adapter.institutions.find((item) => item.id === entity.legacy.id);
  assert.deepEqual(institution, entity.payload, 'adapter must retain original field values and types');
  const fields = ['id', 'name', 'province', 'city', 'lng', 'lat', 'category', 'categoryLabel', 'adcode', 'source', 'precision', 'note'];
  for (const field of fields) {
    assert.ok(Object.hasOwn(institution, field), `missing map consumer field: ${field}`);
    const incomplete = clone(locked.candidate.bundle);
    delete incomplete.entities.find((item) => item.id === entity.id).payload[field];
    assert.throws(() => validateBundle(incomplete, { allowSimulation: true }), { code: 'SCHEMA_INVALID' });
  }
  assert.ok(PROVINCE_GEO.some((province) => province.name === institution.province && province.adcode === institution.adcode));
  assert.equal(verifyInstitutionConsumer(adapter.institutions).provinceReferences, 'resolved');
  const [x, y] = project(institution.lng, institution.lat);
  assert.ok(Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1);
  const wrongProvince = clone(adapter.institutions);
  wrongProvince[0].province = 'Fictional absent province';
  assert.throws(() => verifyInstitutionConsumer(wrongProvince), { code: 'ADAPTER_MAP_REFERENCE_INVALID' });
});

test('golden compatibility: exact legacy seed fields, IDs, content, order and references remain unchanged', () => {
  const baseline = JSON.parse(readFileSync(new URL('../docs/t02/golden-baseline.json', import.meta.url), 'utf8'));
  assert.equal(baseline.status, 'legacy_unverified');
  const measured = measureLegacySeed();
  for (const field of Object.keys(measured)) assert.deepEqual(measured[field], baseline[field], `legacy baseline changed: ${field}`);
  for (const file of baseline.atlasFiles) {
    const bytes = readFileSync(new URL(`../${file.path}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `legacy atlas changed: ${file.path}`);
  }
});

test('persistent legacy identity registry covers all 1788 typed public IDs in order without granting publication rights', () => {
  const registry = JSON.parse(readFileSync(new URL('../docs/t02/legacy-id-map.json', import.meta.url), 'utf8'));
  const golden = JSON.parse(readFileSync(new URL('../docs/t02/golden-baseline.json', import.meta.url), 'utf8'));
  const institutions = JSON.parse(readFileSync(new URL('../src/atlas/institutions.json', import.meta.url), 'utf8')).country.china.institutions;
  const publicIds = { ...cloneSeed(), institutions };
  assert.equal(registry.sourceCommit, golden.sourceCommit);
  assert.equal(registry.seedSha256, golden.seedSha256);
  assert.equal(registry.seedSha256, measureLegacySeed().seedSha256);
  assert.equal(registry.count, 1788);
  assert.equal(registry.entries.length, 1788);
  const canonicalIds = new Set();
  const typedLegacyIds = new Set();
  for (const entry of registry.entries) {
    assert.equal(entry.status, 'legacy_unverified');
    assert.equal(entry.providerMapping, 'not_inferred_from_legacy_identifier');
    assert.match(entry.canonicalId, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/);
    assert.ok(!canonicalIds.has(entry.canonicalId), 'permanent canonical identities must be globally unique');
    canonicalIds.add(entry.canonicalId);
    const typedKey = JSON.stringify([entry.collection, typeof entry.legacyId, entry.legacyId]);
    assert.ok(!typedLegacyIds.has(typedKey), 'typed legacy identities must map exactly once');
    typedLegacyIds.add(typedKey);
  }
  assert.equal(canonicalIds.size, 1788);
  for (const [collection, rows] of Object.entries(publicIds)) {
    const registered = registry.entries.filter((entry) => entry.collection === collection);
    assert.deepEqual(registered.map((entry) => [typeof entry.legacyId, entry.legacyId, entry.order]),
      rows.map((row, order) => [typeof row.id, row.id, order]), `persistent mapping differs from exact source identities/order: ${collection}`);
  }
  assert.equal(registry.entries.filter((entry) => !Object.hasOwn(publicIds, entry.collection)).length, 0);
});

test('real locked package → adapter → storage v4 → emergency projection → search/details; backup cannot revive', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const { verifyPack } = await import('../vendor/t02/src/pack.mjs');
  const lock = readContentLock(root);
  const loaded = await loadLockedCandidate(root, { verifyPack, allowSimulation: true });
  const adapter = adaptVerifiedBundle(loaded.candidate.bundle, { allowSimulation: true });
  assert.deepEqual(validateData(adapter.seedData, { requireDrugSideEffects: true }), []);
  const seed = adapter.seedData;
  const disease = seed.disorders[0];
  const identity = adapter.identities.find((item) => item.collection === 'disorders' && item.legacyId === disease.id);
  let envelope = upsertEntry(createEnvelope(seed), 'disorders', { ...disease, summary: 'Explicitly fictional local override' }, { seedData: seed, now: CLOCK });
  envelope = upsertEntry(envelope, 'cases', { id: 'simulation-custom-case', disorderId: disease.id, title: 'Synthetic custom case', summary: 'Fictional local case only', source: 'Synthetic local test' }, { seedData: seed, now: CLOCK });
  envelope = deleteEntry(envelope, 'resources', seed.resources[0].id, seed, { now: CLOCK });
  const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(envelope)]]);
  const backup = createBackup(storage, storage.getItem(STORAGE_KEY), { now: CLOCK });
  const merged = readKnowledge(storage, seed, { now: CLOCK });
  assert.equal(merged.error, null);
  assert.equal(merged.envelope.data.disorders[0].summary, 'Explicitly fictional local override');
  assert.ok(!merged.envelope.data.resources.some((item) => item.id === seed.resources[0].id));
  const adopted = await adopt(createAdoptionState(), loaded.candidate, {
    verifyCandidate: (candidate) => verifyPack(candidate.packDir, { ...lock.candidate, allowSimulation: true }),
    verifyWebsite: async (candidate) => validateData(adaptVerifiedBundle(candidate.bundle, { allowSimulation: true }).seedData).length === 0
  });
  assert.equal(adopted.ok, true);
  const state = updateEmergencyState(adopted.state, event(8, [identity.canonicalId]), { trusted: true, now: NOW });
  const rawBefore = [...storage.values];
  const visible = projectAdoptedKnowledge(state, merged.envelope.data, { now: NOW });
  assert.equal(visible.data.disorders.find((item) => item.id === disease.id), undefined, 'details boundary must not expose retracted entity');
  assert.ok(!matchKnowledge(disease.name, visible.data).disorders.some((item) => item.item.id === disease.id));
  assert.ok(!visible.data.cases.some((item) => item.disorderId === disease.id));
  assert.deepEqual([...storage.values], rawBefore);
  const restored = restoreBackup(storage, backup, seed, { now: new Date(NOW + 1000) });
  assert.ok(restored.envelope.data.disorders.some((item) => item.id === disease.id));
  assert.ok(!projectAdoptedKnowledge(state, restored.envelope.data, { now: NOW }).data.disorders.some((item) => item.id === disease.id));
  assert.equal(state.production, 'legacy');
});

test('real locked bytes: tampered replacement cannot replace the last verified simulation', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const { verifyPack } = await import('../vendor/t02/src/pack.mjs');
  const lock = readContentLock(root);
  const loaded = await loadLockedCandidate(root, { verifyPack, allowSimulation: true });
  const first = await adopt(createAdoptionState(), loaded.candidate);
  const directory = mkdtempSync(join(tmpdir(), 'symgene-pack-test-'));
  try {
    const corrupt = join(directory, 'corrupt');
    cpSync(loaded.candidate.packDir, corrupt, { recursive: true });
    writeFileSync(join(corrupt, 'bundle.json'), '{}\n');
    const failed = await adopt(first.state, { packDir: corrupt }, {
      verifyCandidate: (candidate) => verifyPack(candidate.packDir, { ...lock.candidate, allowSimulation: true })
    });
    assert.equal(failed.ok, false);
    assert.deepEqual(failed.state.active, first.state.active);
    assert.deepEqual(failed.state.archives, first.state.archives);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('vendor provenance cannot omit the scanner dependency while replacing it with an always-allow scanner', async () => {
  const { verifyVendorProvenance } = await import('../scripts/t02/check-content-pack.mjs');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const directory = mkdtempSync(join(tmpdir(), 'symgene-vendor-test-'));
  try {
    cpSync(join(root, 'vendor'), join(directory, 'vendor'), { recursive: true });
    const provenancePath = join(directory, 'vendor/t02/provenance.json');
    const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
    provenance.files = provenance.files.filter((item) => item.path !== 'src/scanner.mjs');
    writeFileSync(provenancePath, JSON.stringify(provenance));
    writeFileSync(join(directory, 'vendor/t02/src/scanner.mjs'), 'export const scanText = () => [];\n');
    assert.throws(() => verifyVendorProvenance(directory), { code: 'VENDOR_PROVENANCE_INVALID' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('real canonical rename packages: withdrawal survives old-package rollback and JSON state recovery', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const { buildPack, verifyPack } = await import('../vendor/t02/src/pack.mjs');
  const { subjectDigest } = await import('../vendor/t02/src/contract.mjs');
  const locked = await loadLockedCandidate(root, { verifyPack, allowSimulation: true });
  const directory = mkdtempSync(join(tmpdir(), 'symgene-history-pack-test-'));
  try {
    const oldBundle = clone(locked.candidate.bundle);
    oldBundle.contentVersion = 'sim-history-old';
    oldBundle.retractions = [];
    const recompute = (bundle) => {
      bundle.reviews = bundle.reviews.map((review) => ({
        ...review, id: `review:history:${review.gate}:${review.subjectId}`,
        subjectDigest: subjectDigest(bundle, review.subjectId)
      }));
    };
    recompute(oldBundle);
    const newBundle = clone(oldBundle);
    newBundle.contentVersion = 'sim-history-new';
    const oldEntity = newBundle.entities.find((entity) => entity.legacy?.collection === 'resources');
    const oldId = oldEntity.id;
    const legacyId = oldEntity.legacy.id;
    const newId = 'resource:simulation-renamed';
    oldEntity.id = newId;
    for (const entity of newBundle.entities) {
      if (entity.parentId === oldId) entity.parentId = newId;
      for (const field of ['sourceIds', 'claimIds']) {
        if (entity[field]) entity[field] = entity[field].map((id) => id === oldId ? newId : id);
      }
    }
    newBundle.redirects = newBundle.redirects.map((item) => ({ from: item.from, to: item.to === oldId ? newId : item.to }));
    newBundle.redirects.push({ from: oldId, to: newId });
    newBundle.reviews = newBundle.reviews.map((review) => ({ ...review, subjectId: review.subjectId === oldId ? newId : review.subjectId }));
    recompute(newBundle);
    const built = [oldBundle, newBundle].map((bundle) => buildPack(bundle, {
      outputRoot: directory, allowSimulation: true,
      pipelineCommit: locked.candidate.manifest.pipelineCommit,
      codeDigest: locked.candidate.manifest.codeDigest
    }));
    const exact = (descriptor) => verifyPack(descriptor.packDir, {
      contentVersion: descriptor.contentVersion ?? descriptor.bundle.contentVersion,
      manifestSha256: descriptor.manifestSha256, packageDigest: descriptor.packageDigest,
      schemaRange: '^1.0.0', allowSimulation: true
    });
    const websiteGate = async (pack) => validateData(adaptVerifiedBundle(pack.bundle, { allowSimulation: true }).seedData, { requireDrugSideEffects: true }).length === 0;
    const first = await simulateAdoption(createAdoptionState(), built[0], { verifyCandidate: exact, verifyWebsite: websiteGate, websiteReviewApproved: true });
    assert.equal(first.ok, true);
    const second = await simulateAdoption(first.state, built[1], { verifyCandidate: exact, verifyWebsite: websiteGate, websiteReviewApproved: true });
    assert.equal(second.ok, true);
    const withdrawn = updateEmergencyState(second.state, event(11, [newId]), { trusted: true, now: NOW });
    assert.ok(!projectAdoptedKnowledge(withdrawn, adaptVerifiedBundle(newBundle, { allowSimulation: true }).seedData, { now: NOW }).data.resources.some((item) => item.id === legacyId));
    // This is serialization/recovery of simulation state, not a claim that a
    // real authenticated durable emergency store has been provisioned.
    const recovered = JSON.parse(JSON.stringify(withdrawn));
    assert.deepEqual(recovered.retainedIdentities, withdrawn.retainedIdentities);
    assert.deepEqual(recovered.retainedRedirects, withdrawn.retainedRedirects);
    assert.deepEqual(recovered.retainedDependencies, withdrawn.retainedDependencies);
    const rollback = await simulateRollback(recovered, oldBundle.contentVersion, {
      verifyArchived: exact, verifyWebsite: websiteGate, websiteReviewApproved: true
    });
    assert.equal(rollback.ok, true);
    assert.equal(rollback.state.emergency.sequence, 11);
    const oldSeed = adaptVerifiedBundle(oldBundle, { allowSimulation: true }).seedData;
    const projected = projectAdoptedKnowledge(rollback.state, oldSeed, { now: NOW });
    assert.ok(!projected.data.resources.some((item) => item.id === legacyId));
    assert.ok(projected.denied.includes(oldId));
    assert.ok(projected.denied.includes(newId));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('real count policy: source-only and unmapped legacy packages cannot pass the locked consumer or replace an active package', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const { buildPack, verifyPack } = await import('../vendor/t02/src/pack.mjs');
  const { subjectDigest } = await import('../vendor/t02/src/contract.mjs');
  const { checkContentPack } = await import('../scripts/t02/check-content-pack.mjs');
  const lock = readContentLock(root);
  const locked = await loadLockedCandidate(root, { verifyPack, allowSimulation: true });
  const directory = mkdtempSync(join(tmpdir(), 'symgene-count-policy-test-'));
  try {
    cpSync(join(root, 'vendor'), join(directory, 'vendor'), { recursive: true });
    const sourceOnly = clone(locked.candidate.bundle);
    sourceOnly.contentVersion = 'sim-source-only';
    sourceOnly.entities = sourceOnly.entities.filter((entity) => entity.type === 'source');
    sourceOnly.reviews = sourceOnly.reviews.filter((review) => sourceOnly.entities.some((entity) => entity.id === review.subjectId));
    sourceOnly.redirects = [];
    sourceOnly.retractions = [];
    const unmapped = clone(locked.candidate.bundle);
    unmapped.contentVersion = 'sim-unmapped-resource';
    delete unmapped.entities.find((entity) => entity.legacy?.collection === 'resources').legacy;
    for (const bundle of [sourceOnly, unmapped]) {
      bundle.reviews = bundle.reviews.map((review) => ({ ...review, subjectDigest: subjectDigest(bundle, review.subjectId) }));
      const built = buildPack(bundle, {
        outputRoot: join(directory, 'content-packs'), allowSimulation: true,
        pipelineCommit: locked.candidate.manifest.pipelineCommit, codeDigest: locked.candidate.manifest.codeDigest
      });
      const descriptor = {
        path: `content-packs/${bundle.contentVersion}`, contentVersion: bundle.contentVersion,
        manifestSha256: built.manifestSha256, packageDigest: built.packageDigest, schemaRange: '^1.0.0'
      };
      writeFileSync(join(directory, 'content-pack.lock'), JSON.stringify({ ...lock, candidate: descriptor }));
      const expectedCode = bundle === sourceOnly ? 'PACK_ABNORMAL_COUNT_DROP' : 'ADAPTER_LEGACY_COUNT_DROP';
      await assert.rejects(() => loadLockedCandidate(directory, { verifyPack, allowSimulation: true }), { code: expectedCode });
      await assert.rejects(() => checkContentPack(directory), { code: expectedCode });
      const first = await adopt(createAdoptionState(), locked.candidate);
      const failed = await adopt(first.state, built, {
        verifyCandidate: (candidate) => verifyPack(candidate.packDir, { ...descriptor, allowSimulation: true })
      });
      assert.equal(failed.code, bundle === sourceOnly ? 'ADOPTION_COUNT_DROP' : 'ADOPTION_LEGACY_COUNT_DROP');
      assert.deepEqual(failed.state.active, first.state.active);
    }
    const missing = { ...lock };
    delete missing.policy;
    writeFileSync(join(directory, 'content-pack.lock'), JSON.stringify(missing));
    assert.throws(() => readContentLock(directory), { code: 'LOCK_COUNT_POLICY_MISSING' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
