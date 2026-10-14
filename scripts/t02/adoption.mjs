import { realpathSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import {
  ContentAdapterError, adaptVerifiedBundle, createRetractionLedger,
  acceptEmergencyRetractions, projectVisibleKnowledge
} from '../../src/content/adapter.js';
import { readLocalConfig, requireLocalPath } from './read-local-config.mjs';

export const ADOPTION_PHASES = ['built', 'verified', 'archived', 'website_reviewed', 'website_verified', 'adopted'];
const COUNT_KEYS = ['entities', 'sources', 'claims', 'contentEntries', 'scenarios', 'resources', 'rights', 'reviews', 'redirects', 'retractions'];
const LEGACY_COUNT_KEYS = ['drugs', 'disorders', 'cases', 'resources', 'institutions'];
const clone = (value) => JSON.parse(JSON.stringify(value));
const fail = (code, message) => { throw new ContentAdapterError(code, message); };

export function readContentLock(websiteRoot) {
  const lock = readLocalConfig(websiteRoot, 'content-pack.lock', 'LOCK_FILE_UNSAFE');
  if (lock.lockVersion !== 1 || lock.adoption !== 'legacy' || lock.scope !== 'local_simulation_only') {
    fail('LOCK_ADOPTION_REJECTED', 'This rollout permits only legacy production and local simulation.');
  }
  if (!lock.candidate) fail('LOCK_CANDIDATE_MISSING', 'The configured simulation rollout requires an exact candidate lock.');
  if (!lock.policy?.minimumCounts || !lock.policy?.minimumLegacyCounts) {
    fail('LOCK_COUNT_POLICY_MISSING', 'Independent reviewed manifest and legacy count floors are required.');
  }
  validateCountPolicy(lock.policy.minimumCounts, COUNT_KEYS);
  validateCountPolicy(lock.policy.minimumLegacyCounts, LEGACY_COUNT_KEYS);
  return lock;
}

function validateCountPolicy(floors, keys) {
  if (!floors || typeof floors !== 'object' || Array.isArray(floors)
    || Object.keys(floors).length !== keys.length
    || keys.some((key) => !Number.isSafeInteger(floors[key]) || floors[key] < 0)) {
    fail('LOCK_COUNT_POLICY_INVALID', 'Count policy must declare exact nonnegative floors for every collection.');
  }
}

function legacyCounts(bundle) {
  const adapter = adaptVerifiedBundle(bundle, { allowSimulation: true });
  return { ...Object.fromEntries(Object.entries(adapter.seedData).map(([key, rows]) => [key, rows.length])), institutions: adapter.institutions.length };
}

function enforceFloors(counts, floors, code) {
  for (const [key, minimum] of Object.entries(floors)) {
    if (!Number.isSafeInteger(counts?.[key]) || counts[key] < minimum) fail(code, 'The complete candidate violates an independently reviewed count floor.');
  }
}

export function resolveLockedDirectory(websiteRoot, candidate) {
  if (!candidate || typeof candidate.path !== 'string' || !candidate.path.startsWith('content-packs/')
    || isAbsolute(candidate.path) || candidate.path.includes('\\')
    || candidate.path.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail('LOCK_PATH_INVALID', 'The exact immutable candidate must be inside content-packs.');
  }
  const artifactRoot = requireLocalPath(websiteRoot, 'content-packs', 'LOCK_PATH_ESCAPE');
  const root = realpathSync(artifactRoot);
  const directory = realpathSync(requireLocalPath(websiteRoot, candidate.path, 'LOCK_PATH_ESCAPE'));
  const rel = relative(root, directory);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    fail('LOCK_PATH_ESCAPE', 'The locked candidate escaped the artifact directory.');
  }
  for (const field of ['manifestSha256', 'packageDigest']) {
    if (!/^[a-f0-9]{64}$/.test(candidate[field] ?? '')) fail('LOCK_HASH_INVALID', 'The lock requires exact SHA-256 values.');
  }
  if (typeof candidate.contentVersion !== 'string' || typeof candidate.schemaRange !== 'string') {
    fail('LOCK_VERSION_INVALID', 'The lock requires an exact content version and explicit schema range.');
  }
  return directory;
}

export async function loadLockedCandidate(websiteRoot, { verifyPack, allowSimulation = false, now } = {}) {
  const lock = readContentLock(websiteRoot);
  const packDir = resolveLockedDirectory(websiteRoot, lock.candidate);
  const verified = await verifyPack(packDir, { ...lock.candidate, baselineCounts: lock.policy.minimumCounts, allowSimulation, now });
  if (verified.bundle.mode !== 'simulation') fail('LOCK_PUBLIC_ADOPTION_DISABLED', 'This candidate slot is limited to synthetic simulation.');
  enforceFloors(legacyCounts(verified.bundle), lock.policy.minimumLegacyCounts, 'ADAPTER_LEGACY_COUNT_DROP');
  return { adoption: 'legacy', candidate: verified };
}

export function createAdoptionState() {
  return {
    scope: 'local_simulation_only',
    production: 'legacy',
    active: null,
    previous: null,
    archives: {},
    retainedPackTargets: [],
    retainedPackRetractions: [],
    retainedIdentities: [],
    retainedRedirects: [],
    retainedDependencies: [],
    packRetractionSequence: 0,
    emergency: createRetractionLedger(),
    events: []
  };
}

export function updateEmergencyState(state, event, options) {
  requireSimulationState(state);
  return { ...clone(state), emergency: acceptEmergencyRetractions(state.emergency, event, options) };
}

function requireSimulationState(state) {
  if (state?.scope !== 'local_simulation_only' || state?.production !== 'legacy') {
    fail('ADOPTION_SCOPE_REJECTED', 'The state must retain local simulation scope and legacy production.');
  }
}

function requireIdentityContinuity(state, pack) {
  const history = Object.values(state.archives).map((archived) => archived.bundle);
  if (state.active) history.push(state.active.bundle);
  const entities = new Map(pack.bundle.entities.map((entity) => [entity.id, entity]));
  const redirects = new Map(pack.bundle.redirects.map((item) => [item.from, item.to]));
  const terminal = (id) => {
    const seen = new Set();
    while (redirects.has(id)) {
      if (seen.has(id)) fail('ADOPTION_REDIRECT_CONFLICT', 'Historical redirect continuity is ambiguous.');
      seen.add(id);
      id = redirects.get(id);
    }
    return id;
  };
  const sameLegacy = (left, right) => left?.collection === right?.collection
    && typeof left?.id === typeof right?.id && left?.id === right?.id;
  const identities = [...state.retainedIdentities];
  const historicalRedirects = [...state.retainedRedirects];
  const providers = new Map();
  for (const bundle of history) {
    historicalRedirects.push(...bundle.redirects);
    for (const previous of bundle.entities) {
      const current = entities.get(previous.id);
      if (current && current.type !== previous.type) fail('ADOPTION_ID_TYPE_REUSE', 'A permanent application ID cannot change entity type.');
      if (previous.legacy) {
        identities.push({ canonicalId: previous.id, collection: previous.legacy.collection, legacyId: previous.legacy.id });
        if (current && !sameLegacy(previous.legacy, current.legacy)) {
          fail('ADOPTION_CANONICAL_REMAP', 'A permanent canonical ID cannot change its storage identity.');
        }
      }
      for (const ref of previous.providerRefs ?? []) {
        const key = JSON.stringify([ref.provider, ref.namespace, ref.externalId]);
        const ids = providers.get(key) ?? new Set();
        ids.add(previous.id);
        providers.set(key, ids);
      }
    }
  }
  for (const current of pack.bundle.entities) {
    if (current.legacy) {
      for (const previous of identities) {
        if (previous.collection === current.legacy.collection
          && typeof previous.legacyId === typeof current.legacy.id && previous.legacyId === current.legacy.id
          && previous.canonicalId !== current.id && terminal(previous.canonicalId) !== current.id) {
          fail('ADOPTION_LEGACY_ID_REUSE', 'A storage identity can move only through an explicit old-ID redirect.');
        }
      }
    }
    for (const ref of current.providerRefs ?? []) {
      for (const previous of providers.get(JSON.stringify([ref.provider, ref.namespace, ref.externalId])) ?? []) {
        if (previous !== current.id && terminal(previous) !== current.id) {
          fail('ADOPTION_PROVIDER_ID_REUSE', 'A provider identity cannot silently move to an unrelated entity.');
        }
      }
    }
  }
  for (const previous of historicalRedirects) {
    if (entities.has(previous.from)) fail('ADOPTION_REDIRECT_SOURCE_REUSED', 'A retired redirect source cannot become a new active entity.');
    // Updating A→B to A→C is safe only if B explicitly redirects to C too.
    if (terminal(previous.from) !== terminal(previous.to)) {
      fail('ADOPTION_REDIRECT_CONFLICT', 'An established redirect cannot be dropped or retargeted.');
    }
  }
}

function retainPackRetractions(state, pack) {
  state.retainedPackTargets = [...new Set([
    ...state.retainedPackTargets, ...pack.bundle.retractions.map((item) => item.targetId)
  ])].sort();
  const retained = new Map(state.retainedPackRetractions.map((item) => [item.id, item]));
  for (const item of pack.bundle.retractions) {
    const existing = retained.get(item.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(item)) {
      fail('ADOPTION_RETRACTION_EVENT_CONFLICT', 'A retained retraction event cannot be rewritten.');
    }
    retained.set(item.id, clone(item));
  }
  state.retainedPackRetractions = [...retained.values()];
  state.packRetractionSequence = Math.max(state.packRetractionSequence, pack.manifest.retractionSequence ?? 0);
  const adapter = adaptVerifiedBundle(pack.bundle, { allowSimulation: true });
  const identities = new Map(state.retainedIdentities.map((item) => [JSON.stringify([item.canonicalId, item.collection, item.legacyId]), item]));
  for (const item of adapter.identities) identities.set(JSON.stringify([item.canonicalId, item.collection, item.legacyId]), item);
  state.retainedIdentities = [...identities.values()];
  const redirects = new Map(state.retainedRedirects.map((item) => [JSON.stringify([item.from, item.to]), item]));
  for (const item of adapter.redirects) redirects.set(JSON.stringify([item.from, item.to]), item);
  state.retainedRedirects = [...redirects.values()];
  const dependencies = new Map(state.retainedDependencies.map((item) => [item.id, new Set(item.refs)]));
  for (const item of adapter.dependencies) {
    const refs = dependencies.get(item.id) ?? new Set();
    item.refs.forEach((ref) => refs.add(ref));
    dependencies.set(item.id, refs);
  }
  state.retainedDependencies = [...dependencies].map(([id, refs]) => ({ id, refs: [...refs].sort() }));
}

// This deliberately models a local website review as an explicit caller step.
// No approval record or signature is manufactured and production stays legacy.
// The archive is a verified immutable package descriptor, not a published host.
export async function simulateAdoption(previousState, candidate, {
  verifyCandidate,
  websiteReviewApproved = false,
  verifyWebsite,
  failureAt = null
} = {}) {
  const state = clone(previousState);
  const completed = [];
  let pack;
  try {
    requireSimulationState(state);
    for (const phase of ADOPTION_PHASES) {
      if (phase === failureAt) fail('ADOPTION_INJECTED_FAILURE', `Controlled failure at ${phase}.`);
      if (phase === 'verified') {
        if (typeof verifyCandidate !== 'function') fail('ADOPTION_PACKAGE_VERIFIER_REQUIRED', 'A real package verifier must be supplied.');
        pack = await verifyCandidate(candidate);
        if (pack.bundle.mode !== 'simulation') fail('ADOPTION_PUBLIC_DISABLED', 'Only synthetic local adoption is enabled.');
        adaptVerifiedBundle(pack.bundle, { allowSimulation: true });
        if ((pack.manifest.retractionSequence ?? 0) < state.packRetractionSequence) {
          fail('ADOPTION_RETRACTION_DOWNGRADE', 'A new adoption cannot lower the retained retraction sequence.');
        }
        if (state.active) {
          enforceFloors(pack.manifest.counts, state.active.manifest.counts, 'ADOPTION_COUNT_DROP');
          enforceFloors(legacyCounts(pack.bundle), legacyCounts(state.active.bundle), 'ADOPTION_LEGACY_COUNT_DROP');
        }
        requireIdentityContinuity(state, pack);
      }
      if (phase === 'archived') {
        const existing = state.archives[pack.contentVersion ?? pack.bundle.contentVersion];
        if (existing && existing.packageDigest !== pack.packageDigest) {
          fail('ADOPTION_VERSION_CONFLICT', 'An immutable content version cannot be replaced.');
        }
      }
      if (phase === 'website_reviewed' && websiteReviewApproved !== true) {
        fail('ADOPTION_REVIEW_REQUIRED', 'A separate website review decision is required.');
      }
      if (phase === 'website_verified') {
        if (typeof verifyWebsite !== 'function') fail('ADOPTION_WEBSITE_VERIFIER_REQUIRED', 'An explicit website verification gate must be supplied.');
        if ((await verifyWebsite(pack)) !== true) fail('ADOPTION_WEBSITE_FAILED', 'The website verification gate failed.');
      }
      completed.push(phase);
    }
    // Commit the coherent package and all indexes together, only after gates.
    const version = pack.bundle.contentVersion;
    state.archives[version] = clone(pack);
    state.previous = state.active;
    state.active = clone(pack);
    retainPackRetractions(state, pack);
    state.events.push({ action: 'simulation_adopt', version, completed, publisherIdentity: 'not_configured' });
    return { ok: true, state, completed };
  } catch (error) {
    // Keep every active field and archive from before this attempt. Error
    // reporting contains codes/phases only, never package or user text.
    return {
      ok: false,
      state: { ...clone(previousState), events: [...previousState.events, { action: 'simulation_reject', code: error.code ?? 'ADOPTION_FAILED', completed }] },
      code: error.code ?? 'ADOPTION_FAILED',
      completed
    };
  }
}

export async function simulateRollback(previousState, contentVersion, {
  verifyArchived,
  websiteReviewApproved = false,
  verifyWebsite
} = {}) {
  try {
    requireSimulationState(previousState);
    const archived = previousState.archives[contentVersion];
    if (!archived) return { ok: false, state: clone(previousState), code: 'ROLLBACK_NOT_ARCHIVED' };
    if (websiteReviewApproved !== true) return { ok: false, state: clone(previousState), code: 'ROLLBACK_REVIEW_REQUIRED' };
    if (typeof verifyArchived !== 'function') fail('ROLLBACK_PACKAGE_VERIFIER_REQUIRED', 'Rollback must reverify its archived package.');
    if (typeof verifyWebsite !== 'function') fail('ROLLBACK_WEBSITE_VERIFIER_REQUIRED', 'Rollback requires an explicit website verification gate.');
    const verified = await verifyArchived(archived);
    if (verified.bundle.mode !== 'simulation') fail('ROLLBACK_PUBLIC_DISABLED', 'Rollback is limited to synthetic local packages.');
    if (verified.packageDigest !== archived.packageDigest || verified.bundle.contentVersion !== contentVersion) {
      fail('ROLLBACK_HASH_MISMATCH', 'Rollback must reverify the exact archived package.');
    }
    if ((await verifyWebsite(verified)) !== true) fail('ROLLBACK_WEBSITE_FAILED', 'Rollback website verification failed.');
    const state = clone(previousState);
    state.previous = state.active;
    state.active = clone(verified);
    // Emergency/retained package targets survive even an older manifest.
    retainPackRetractions(state, verified);
    state.events.push({ action: 'simulation_rollback', version: contentVersion });
    return { ok: true, state };
  } catch (error) {
    return { ok: false, state: clone(previousState), code: error.code ?? 'ROLLBACK_FAILED' };
  }
}

export function projectAdoptedKnowledge(state, mergedKnowledge, options = {}) {
  requireSimulationState(state);
  if (!state.active) fail('ADOPTION_NOT_ACTIVE', 'No simulated package has been adopted.');
  if (state.active.bundle?.mode !== 'simulation') {
    fail('ADOPTION_ACTIVE_MODE_REJECTED', 'Restored active content must retain explicit simulation mode.');
  }
  const adapter = adaptVerifiedBundle(state.active.bundle, { allowSimulation: true });
  adapter.identities = [...adapter.identities, ...state.retainedIdentities];
  adapter.redirects = [...adapter.redirects, ...state.retainedRedirects];
  adapter.dependencies = [...adapter.dependencies, ...state.retainedDependencies];
  const ledger = {
    ...state.emergency,
    targetIds: [...new Set([
      ...state.emergency.targetIds,
      ...state.retainedPackRetractions.filter((item) => Date.parse(item.effectiveAt) <= (options.now ?? Date.now())).map((item) => item.targetId)
    ])]
  };
  return projectVisibleKnowledge(mergedKnowledge, adapter, ledger, options);
}
