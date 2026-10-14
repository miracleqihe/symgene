import assert from 'node:assert/strict';
import test from 'node:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildPack, verifyPack } from '../vendor/t02/src/pack.mjs';
import { subjectDigest } from '../vendor/t02/src/contract.mjs';
import { adaptVerifiedBundle, acceptEmergencyRetractions, createRetractionLedger, projectVisibleInstitutions } from '../src/content/adapter.js';
import { createAdoptionState, loadLockedCandidate, readContentLock, resolveLockedDirectory, simulateAdoption, simulateRollback, updateEmergencyState, projectAdoptedKnowledge } from '../scripts/t02/adoption.mjs';
import { checkContentPack, verifyVendorProvenance } from '../scripts/t02/check-content-pack.mjs';
import { validateData } from '../src/validation/dataValidation.js';
import { createEnvelope } from '../src/storage/migrations.js';
import { upsertEntry, deleteEntry } from '../src/storage/operations.js';
import { readKnowledge, createBackup, restoreBackup } from '../src/storage/storage.js';
import { STORAGE_KEY } from '../src/storage/constants.js';
import { matchKnowledge } from '../src/search.js';
import { MemoryStorage } from './helpers/storage-fixtures.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const NOW = Date.parse('2026-10-14T12:00:00Z');
const clone = (value) => JSON.parse(JSON.stringify(value));
const LOCK = readContentLock(ROOT);
const CURRENT = (await loadLockedCandidate(ROOT, { verifyPack, allowSimulation: true, now: NOW })).candidate;
const websiteGate = async (pack) => validateData(adaptVerifiedBundle(pack.bundle, { allowSimulation: true }).seedData, { requireDrugSideEffects: true }).length === 0;
const exact = (pack) => verifyPack(pack.packDir, {
  manifestSha256: pack.manifestSha256, packageDigest: pack.packageDigest,
  contentVersion: pack.contentVersion ?? pack.bundle.contentVersion, allowSimulation: true, now: NOW
});
const adopt = (state, pack, options = {}) => simulateAdoption(state, pack, {
  verifyCandidate: exact, verifyWebsite: websiteGate, websiteReviewApproved: true, ...options
});
const event = (targetIds, now = NOW) => ({
  sequence: 1, targetIds, issuedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 1800000).toISOString()
});
function context(t) {
  const directory = mkdtempSync(join(tmpdir(), 'symgene-overnight-consumer-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return {
    directory,
    bundle(version) { return { ...clone(CURRENT.bundle), contentVersion: version }; },
    build(bundle) {
      // All approvals below are explicitly synthetic fixtures, rebound to the
      // exact fictional subject. No human authority callback is fabricated.
      bundle.reviews = bundle.reviews.map((review) => ({
        ...review, id: `review:${bundle.contentVersion}:${review.gate}:${review.subjectId}`,
        subjectDigest: subjectDigest(bundle, review.subjectId)
      }));
      return buildPack(bundle, {
        outputRoot: join(directory, 'packs'), allowSimulation: true, now: NOW,
        pipelineCommit: CURRENT.manifest.pipelineCommit, codeDigest: CURRENT.manifest.codeDigest
      });
    },
    website(name) {
      const target = join(directory, name);
      mkdirSync(target);
      cpSync(join(ROOT, 'vendor'), join(target, 'vendor'), { recursive: true });
      mkdirSync(join(target, 'content-packs'));
      cpSync(CURRENT.packDir, join(target, LOCK.candidate.path), { recursive: true });
      writeFileSync(join(target, 'content-pack.lock'), JSON.stringify(LOCK));
      return target;
    }
  };
}
function twoDrugs(bundle) {
  const original = bundle.entities.find((entity) => entity.legacy?.collection === 'drugs');
  const other = clone(original);
  other.id = 'content:overnight-other-drug';
  other.legacy = { ...other.legacy, id: 'overnight-other-drug', order: 1 };
  other.payload.id = other.legacy.id;
  other.providerRefs = [];
  bundle.entities.push(other);
  for (const review of bundle.reviews.filter((item) => item.subjectId === original.id)) {
    bundle.reviews.push({ ...clone(review), subjectId: other.id });
  }
  const disease = bundle.entities.find((entity) => entity.legacy?.collection === 'disorders');
  disease.payload.relatedDrugIds = [other.legacy.id];
  return { original, other, disease, scenario: bundle.entities.find((entity) => entity.legacy?.collection === 'cases') };
}
function renameEntity(bundle, from, to, { redirect = false } = {}) {
  for (const entity of bundle.entities) {
    if (entity.id === from) entity.id = to;
    if (entity.parentId === from) entity.parentId = to;
    for (const field of ['sourceIds', 'claimIds']) entity[field] = entity[field].map((id) => id === from ? to : id);
  }
  bundle.reviews.forEach((review) => { if (review.subjectId === from) review.subjectId = to; });
  bundle.redirects.forEach((item) => { if (item.to === from) item.to = to; });
  if (redirect) bundle.redirects.push({ from, to });
}

test('overnight: direct case drugIds and resource diseaseId participate in real-package withdrawal', async (t) => {
  const c = context(t);
  const bundle = c.bundle('overnight-direct-dependencies');
  const { original, other, disease, scenario } = twoDrugs(bundle);
  scenario.payload.drugIds = [original.legacy.id];
  const resource = bundle.entities.find((entity) => entity.legacy?.collection === 'resources');
  resource.payload.diseaseId = disease.legacy.id;
  const adopted = await adopt(createAdoptionState(), c.build(bundle));
  assert.equal(adopted.ok, true);
  const seed = adaptVerifiedBundle(bundle, { allowSimulation: true }).seedData;
  const withdrawn = updateEmergencyState(adopted.state, event([original.id]), { trusted: true, now: NOW });
  const visible = projectAdoptedKnowledge(withdrawn, seed, { now: NOW });
  assert.deepEqual(visible.data.drugs.map((item) => item.id), [other.legacy.id]);
  assert.equal(visible.data.disorders.length, 1, 'the disease is independent of the withdrawn drug');
  assert.equal(visible.data.cases.length, 0, 'direct drug dependency cannot hide behind an unrelated disease');
  const diseaseWithdrawn = updateEmergencyState(adopted.state, event([disease.id]), { trusted: true, now: NOW });
  assert.equal(projectAdoptedKnowledge(diseaseWithdrawn, seed, { now: NOW }).data.resources.length, 0);
});

test('overnight: post-merge drug references in overrides/custom entries stay hidden after backup restoration', async (t) => {
  const c = context(t);
  const bundle = c.bundle('overnight-local-dependencies');
  const { original, other, scenario } = twoDrugs(bundle);
  scenario.payload.drugIds = [other.legacy.id];
  const adopted = await adopt(createAdoptionState(), c.build(bundle));
  assert.equal(adopted.ok, true);
  const seed = adaptVerifiedBundle(bundle, { allowSimulation: true }).seedData;
  let envelope = upsertEntry(createEnvelope(seed), 'cases', { ...seed.cases[0], drugIds: [original.legacy.id] }, { seedData: seed });
  envelope = upsertEntry(envelope, 'cases', { ...seed.cases[0], id: 'overnight-custom-case', drugIds: [original.legacy.id] }, { seedData: seed });
  envelope = upsertEntry(envelope, 'resources', { ...seed.resources[0], id: 'overnight-custom-resource', relatedDrugIds: [original.legacy.id] }, { seedData: seed });
  envelope = deleteEntry(envelope, 'resources', seed.resources[0].id, seed);
  const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(envelope)]]);
  const backup = createBackup(storage, storage.getItem(STORAGE_KEY));
  const state = updateEmergencyState(adopted.state, event([original.id]), { trusted: true, now: NOW });
  for (const merged of [readKnowledge(storage, seed), restoreBackup(storage, backup, seed)]) {
    assert.equal(merged.error ?? null, null);
    const before = JSON.stringify([...storage.values]);
    const sourceBefore = clone(merged.envelope.data);
    const visible = projectAdoptedKnowledge(state, merged.envelope.data, { now: NOW });
    assert.equal(visible.data.disorders.length, 1);
    assert.equal(visible.data.cases.length, 0);
    assert.equal(visible.data.resources.length, 0);
    assert.deepEqual(matchKnowledge(seed.cases[0].title, visible.data).cases, []);
    assert.deepEqual(merged.envelope.data, sourceBefore);
    assert.equal(JSON.stringify([...storage.values]), before);
    assert.ok(merged.envelope.deletedIds.resources.includes(seed.resources[0].id));
  }
});

for (const kind of ['rights', 'reviews']) {
  test(`overnight: ${kind} expiry cannot be renewed by a fresh emergency ledger`, async (t) => {
    const c = context(t);
    const bundle = c.bundle(`overnight-expiry-${kind}`);
    bundle[kind][0].expiresAt = new Date(NOW + 300000).toISOString();
    const pack = c.build(bundle);
    const adopted = await adopt(createAdoptionState(), pack);
    assert.equal(adopted.ok, true);
    const adapter = adaptVerifiedBundle(bundle, { allowSimulation: true });
    const before = updateEmergencyState(adopted.state, event([]), { trusted: true, now: NOW });
    assert.ok(projectAdoptedKnowledge(before, adapter.seedData, { now: NOW }).data.drugs.length > 0);
    for (const now of [NOW + 300000, NOW + 600000]) {
      const expired = updateEmergencyState(adopted.state, event([], now), { trusted: true, now });
      const visible = projectAdoptedKnowledge(expired, adapter.seedData, { now });
      assert.equal(visible.contentFresh, false);
      assert.equal(visible.fresh, false);
      assert.ok(Object.values(visible.data).every((rows) => rows.length === 0));
      assert.deepEqual(projectVisibleInstitutions(adapter.institutions, adapter, expired.emergency, { now }).institutions, []);
      assert.throws(() => verifyPack(pack.packDir, { allowSimulation: true, now }), { code: kind === 'rights' ? 'RIGHTS_EXPIRED' : 'REVIEW_EXPIRED' });
    }
  });
}

test('overnight: canonical IDs cannot change their typed legacy identity across verified packages', async (t) => {
  const c = context(t);
  const base = c.bundle('overnight-remap-base');
  const first = await adopt(createAdoptionState(), c.build(base));
  const next = clone(base);
  next.contentVersion = 'overnight-remap-next';
  const drug = next.entities.find((entity) => entity.legacy?.collection === 'drugs');
  const oldId = drug.legacy.id;
  drug.legacy.id = 'overnight-rebound-storage-id';
  drug.payload.id = drug.legacy.id;
  for (const entity of next.entities) for (const field of ['relatedDrugIds', 'drugIds']) {
    if (entity.payload[field]) entity.payload[field] = entity.payload[field].map((id) => id === oldId ? drug.legacy.id : id);
  }
  const rejected = await adopt(first.state, c.build(next));
  assert.equal(rejected.code, 'ADOPTION_CANONICAL_REMAP');
  assert.deepEqual(rejected.state.active, first.state.active);
  assert.deepEqual(rejected.state.archives, first.state.archives);
});

test('overnight: a legacy ID or provider identity cannot silently move to an unrelated canonical entity', async (t) => {
  const c = context(t);
  const base = c.bundle('overnight-identity-base');
  const resource = base.entities.find((entity) => entity.legacy?.collection === 'resources');
  const provider = { provider: 'synthetic', namespace: 'overnight-fiction', externalId: 'fictional-resource' };
  resource.providerRefs.push(provider);
  const first = await adopt(createAdoptionState(), c.build(base));
  const renamed = clone(base);
  renamed.contentVersion = 'overnight-unbound-canonical';
  renameEntity(renamed, resource.id, 'resource:overnight-unrelated');
  const rejectedRename = await adopt(first.state, c.build(renamed));
  assert.equal(rejectedRename.code, 'ADOPTION_LEGACY_ID_REUSE');
  const transferred = clone(base);
  transferred.contentVersion = 'overnight-provider-transfer';
  transferred.entities.find((entity) => entity.id === resource.id).providerRefs.pop();
  transferred.entities.find((entity) => entity.legacy?.collection === 'institutions').providerRefs.push(provider);
  assert.equal((await adopt(first.state, c.build(transferred))).code, 'ADOPTION_PROVIDER_ID_REUSE');
});

test('overnight: an unmapped source ID cannot be reused for a different entity type in a later valid package', async (t) => {
  const c = context(t);
  const base = c.bundle('overnight-type-base');
  const first = await adopt(createAdoptionState(), c.build(base));
  const next = clone(base);
  next.contentVersion = 'overnight-type-reuse';
  const source = next.entities.find((entity) => entity.type === 'source');
  const replacement = { ...clone(source), id: 'source:overnight-new-source', providerRefs: [] };
  for (const entity of next.entities) entity.sourceIds = entity.sourceIds.map((id) => id === source.id ? replacement.id : id);
  source.type = 'claim';
  source.payload = { text: 'Entirely fictional claim for an identity-continuity test.' };
  source.sourceIds = [replacement.id];
  next.entities.push(replacement);
  for (const review of next.reviews.filter((item) => item.subjectId === source.id)) {
    next.reviews.push({ ...clone(review), subjectId: replacement.id });
  }
  const rejected = await adopt(first.state, c.build(next));
  assert.equal(rejected.code, 'ADOPTION_ID_TYPE_REUSE');
  assert.deepEqual(rejected.state.active, first.state.active);
});

test('overnight: historical redirects cannot be retargeted or dropped by a later valid package', async (t) => {
  const c = context(t);
  const base = c.bundle('overnight-redirect-base');
  const first = await adopt(createAdoptionState(), c.build(base));
  for (const mode of ['retarget', 'drop']) {
    const next = clone(base);
    next.contentVersion = `overnight-redirect-${mode}`;
    if (mode === 'retarget') next.redirects[0].to = next.entities.find((entity) => entity.legacy?.collection === 'institutions').id;
    else next.redirects[0].from = 'resource:overnight-new-alias';
    const rejected = await adopt(first.state, c.build(next));
    assert.equal(rejected.code, 'ADOPTION_REDIRECT_CONFLICT');
    assert.deepEqual(rejected.state.active, first.state.active);
  }
});

test('overnight: explicit canonical rename chains remain compatible and keep withdrawal after JSON recovery/rollback', async (t) => {
  const c = context(t);
  const base = c.bundle('overnight-chain-base');
  const resource = base.entities.find((entity) => entity.legacy?.collection === 'resources');
  const first = await adopt(createAdoptionState(), c.build(base));
  const next = clone(base);
  next.contentVersion = 'overnight-chain-next';
  const newId = 'resource:overnight-chain-new';
  renameEntity(next, resource.id, newId);
  next.redirects.push({ from: resource.id, to: 'resource:overnight-middle' }, { from: 'resource:overnight-middle', to: newId });
  const second = await adopt(first.state, c.build(next));
  assert.equal(second.ok, true);
  const withdrawn = updateEmergencyState(second.state, event([newId]), { trusted: true, now: NOW });
  const recovered = clone(withdrawn);
  const rollback = await simulateRollback(recovered, base.contentVersion, { verifyArchived: exact, verifyWebsite: websiteGate, websiteReviewApproved: true });
  assert.equal(rollback.ok, true);
  const visible = projectAdoptedKnowledge(rollback.state, adaptVerifiedBundle(base, { allowSimulation: true }).seedData, { now: NOW });
  assert.equal(visible.data.resources.length, 0);
  assert.ok(visible.denied.includes(resource.id));
  assert.ok(visible.denied.includes(newId));
});

test('overnight: truthy results do not authorize website review, validation, rollback, or emergency trust', async (t) => {
  const c = context(t);
  const pack = c.build(c.bundle('overnight-strict-decisions'));
  const first = await adopt(createAdoptionState(), pack);
  for (const value of ['false', 1, { ok: false }, []]) {
    assert.equal((await adopt(first.state, pack, { verifyWebsite: async () => value })).code, 'ADOPTION_WEBSITE_FAILED');
    assert.equal((await adopt(first.state, pack, { websiteReviewApproved: value })).code, 'ADOPTION_REVIEW_REQUIRED');
    assert.equal((await simulateRollback(first.state, pack.contentVersion, { verifyArchived: exact, websiteReviewApproved: true, verifyWebsite: async () => value })).code, 'ROLLBACK_WEBSITE_FAILED');
    assert.equal((await simulateRollback(first.state, pack.contentVersion, { verifyArchived: exact, websiteReviewApproved: value, verifyWebsite: websiteGate })).code, 'ROLLBACK_REVIEW_REQUIRED');
    assert.throws(() => acceptEmergencyRetractions(createRetractionLedger(), event([]), { trusted: value, now: NOW }), { code: 'RETRACTION_UNTRUSTED' });
  }
});

test('overnight: corrupted simulation scope cannot be adopted, rolled back, or projected', async (t) => {
  const c = context(t);
  const pack = c.build(c.bundle('overnight-scope'));
  const first = await adopt(createAdoptionState(), pack);
  for (const mutation of [{ scope: 'public' }, { production: 'candidate' }]) {
    const state = { ...clone(first.state), ...mutation };
    assert.equal((await adopt(state, pack)).code, 'ADOPTION_SCOPE_REJECTED');
    assert.equal((await simulateRollback(state, pack.contentVersion, { verifyArchived: exact, verifyWebsite: websiteGate, websiteReviewApproved: true })).code, 'ADOPTION_SCOPE_REJECTED');
    assert.throws(() => projectAdoptedKnowledge(state, adaptVerifiedBundle(pack.bundle, { allowSimulation: true }).seedData, { now: NOW }), { code: 'ADOPTION_SCOPE_REJECTED' });
    assert.equal(state.active.packageDigest, first.state.active.packageDigest);
  }
});

test('overnight: restored simulation labels cannot authorize an active bundle changed to public mode', async (t) => {
  const c = context(t);
  const pack = c.build(c.bundle('overnight-restored-mode'));
  const first = await adopt(createAdoptionState(), pack);
  const fresh = updateEmergencyState(first.state, event([]), { trusted: true, now: NOW });
  const restored = clone(fresh);
  restored.active.bundle.mode = 'public'; // Corruption injection, never a public approval.
  assert.equal(restored.scope, 'local_simulation_only');
  assert.equal(restored.production, 'legacy');
  const seed = adaptVerifiedBundle(pack.bundle, { allowSimulation: true }).seedData;
  assert.throws(() => projectAdoptedKnowledge(restored, seed, { now: NOW }), { code: 'ADOPTION_ACTIVE_MODE_REJECTED' });
});

test('overnight: full consumer gate rejects duplicate lock keys, including escaped nested keys', async (t) => {
  const c = context(t);
  for (const [name, mutate] of [
    ['top', (text) => text.replace('{', '{"adoption":"public",')],
    ['nested', (text) => text.replace('"minimumCounts":{', '"minimumCounts":{"entit\\u0069es":999,')]
  ]) {
    const root = c.website(`duplicate-${name}`);
    writeFileSync(join(root, 'content-pack.lock'), mutate(JSON.stringify(LOCK)));
    await assert.rejects(() => checkContentPack(root, { now: NOW }), { code: 'CONFIG_DUPLICATE_JSON_KEY' });
  }
});

test('overnight: duplicate provenance keys and broken UTF-8 fail before configuration is consumed', (t) => {
  const c = context(t);
  const root = c.website('invalid-config');
  const file = join(root, 'vendor/t02/provenance.json');
  writeFileSync(file, readFileSync(file, 'utf8').replace('{', '{"files":[],'));
  assert.throws(() => verifyVendorProvenance(root), { code: 'CONFIG_DUPLICATE_JSON_KEY' });
  writeFileSync(join(root, 'content-pack.lock'), Buffer.from([0xc3, 0x28]));
  assert.throws(() => readContentLock(root), { code: 'CONFIG_UTF8_INVALID' });
});

test('overnight: lock and candidate paths reject symlink files, roots, and intermediate components', async (t) => {
  const c = context(t);
  const linkedLock = c.website('linked-lock');
  const lockFile = join(linkedLock, 'content-pack.lock');
  renameSync(lockFile, join(c.directory, 'fictional-external-lock'));
  symlinkSync(join(c.directory, 'fictional-external-lock'), lockFile);
  await assert.rejects(() => checkContentPack(linkedLock, { now: NOW }), { code: 'LOCK_FILE_UNSAFE' });
  const root = c.website('linked-candidate');
  const versionDirectory = LOCK.candidate.path.split('/').at(-1);
  symlinkSync(versionDirectory, join(root, 'content-packs/alias'));
  assert.throws(() => resolveLockedDirectory(root, { ...LOCK.candidate, path: 'content-packs/alias' }), { code: 'LOCK_PATH_ESCAPE' });
  symlinkSync('.', join(root, 'content-packs/group'));
  assert.throws(() => resolveLockedDirectory(root, { ...LOCK.candidate, path: `content-packs/group/${versionDirectory}` }), { code: 'LOCK_PATH_ESCAPE' });
  renameSync(join(root, 'content-packs'), join(c.directory, 'outside-packs'));
  symlinkSync(join(c.directory, 'outside-packs'), join(root, 'content-packs'));
  assert.throws(() => resolveLockedDirectory(root, LOCK.candidate), { code: 'LOCK_PATH_ESCAPE' });
});

test('overnight: vendor provenance rejects symlink roots, intermediate directories, and source files', (t) => {
  const c = context(t);
  for (const [name, relative] of [['root', 'vendor/t02'], ['middle', 'vendor/t02/src'], ['file', 'vendor/t02/src/contract.mjs']]) {
    const root = c.website(`linked-vendor-${name}`);
    const target = join(root, relative);
    const outside = join(c.directory, `fictional-vendor-${name}`);
    renameSync(target, outside);
    symlinkSync(outside, target);
    assert.throws(() => verifyVendorProvenance(root), { code: 'VENDOR_UNSAFE_PATH' });
  }
});
