import { adaptVerifiedBundle, createRetractionLedger, projectVisibleKnowledge } from '../content/adapter.js';
import { readKnowledge, writeKnowledge, createBackup, listBackups, restoreBackup } from '../storage/storage.js';
import { upsertEntry, deleteEntry } from '../storage/operations.js';
import { STORAGE_KEY, BACKUP_KEY_PREFIX } from '../storage/constants.js';
import { migrateKnowledge } from '../storage/migrations.js';
import { validateData } from '../validation/dataValidation.js';

export const SIGNED_MARKER = 'T02_SIGNED_TEST_CONSUMER';
export const SIGNED_PATH = '/symgene/t02-signed/';
export const SIGNED_STORAGE_PREFIX = 'symgene-t02-signed-test:';
export const SIGNED_SAFETY_KEY = 't02-signed-denial-history';
export const SIGNED_SELECTION_KEY = 't02-signed-selection';
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const clone = (value) => JSON.parse(JSON.stringify(value));
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const exactId = (value) => typeof value === 'string' && value.length > 0 && value === value.trim();
const GRAPH = ['identities', 'redirects', 'dependencies', 'retractions'];

// Keep the existing v4 APIs and logical keys. Only the physical namespace differs.
export function createSignedStorage(nativeStorage) {
  const allowed = (key) => typeof key === 'string' && (key === STORAGE_KEY || key === SIGNED_SAFETY_KEY
    || key === SIGNED_SELECTION_KEY || key.startsWith(BACKUP_KEY_PREFIX));
  const physical = (key) => { if (!allowed(key)) fail('SIGNED_STORAGE_KEY_REJECTED'); return SIGNED_STORAGE_PREFIX + key; };
  const keys = () => Array.from({ length: nativeStorage.length }, (_, index) => nativeStorage.key(index))
    .filter((key) => key?.startsWith(SIGNED_STORAGE_PREFIX) && allowed(key.slice(SIGNED_STORAGE_PREFIX.length)))
    .map((key) => key.slice(SIGNED_STORAGE_PREFIX.length));
  return Object.freeze({
    get length() { return keys().length; }, key(index) { return keys()[index] ?? null; },
    getItem(key) { return nativeStorage.getItem(physical(key)); },
    setItem(key, value) { nativeStorage.setItem(physical(key), String(value)); },
    removeItem(key) { nativeStorage.removeItem(physical(key)); },
    clear() { for (const key of keys()) nativeStorage.removeItem(physical(key)); }
  });
}

export function createSignedSession(configuration, storage, { fetchImpl = globalThis.fetch, clock = Date.now } = {}) {
  if (configuration?.marker !== SIGNED_MARKER || configuration.scope !== 'local-test-only'
    || configuration.production !== 'legacy' || !Array.isArray(configuration.versions)
    || configuration.versions.length < 2 || !configuration.versions.every(exactId)
    || new Set(configuration.versions).size !== configuration.versions.length
    || !configuration.versions.includes(configuration.candidateVersion)) fail('SIGNED_CONFIGURATION_REJECTED');
  let selected = storage.getItem(SIGNED_SELECTION_KEY) ?? configuration.candidateVersion;
  if (!configuration.versions.includes(selected)) fail('SIGNED_SELECTION_REJECTED');
  let desired = selected;
  let history = { sequence: 0, targetIds: [], headDigest: null, trustRevision: 0, graph: Object.fromEntries(GRAPH.map((field) => [field, []])) };
  const rawHistory = storage.getItem(SIGNED_SAFETY_KEY);
  if (rawHistory !== null) {
    try {
      const value = JSON.parse(rawHistory);
      if (value.scope !== 'denial-only-no-offline-authority' || !Number.isSafeInteger(value.sequence) || value.sequence < 1
        || !digest(value.headDigest) || !Number.isSafeInteger(value.trustRevision) || value.trustRevision < 1
        || !Array.isArray(value.targetIds) || !value.targetIds.every(exactId)
        || GRAPH.some((field) => !Array.isArray(value.graph?.[field]))) fail('SIGNED_CACHE_INVALID');
      history = value;
    } catch { fail('SIGNED_CACHE_INVALID'); }
  }
  let adapter = null;
  let available = false;
  let leaseUntil = 0;
  let event = null;
  let proof = null;
  let error = 'SIGNED_CURRENT_STATE_REQUIRED';
  let requestSequence = 0;
  let abort = null;
  let pendingVersion = null;
  const now = () => clock();
  const invalidate = (code = 'SIGNED_GATEWAY_UNAVAILABLE') => {
    requestSequence++; abort?.abort(); pendingVersion = null; available = false; leaseUntil = 0; error = code;
  };
  const preflight = (nextAdapter) => {
    const raw = storage.getItem(STORAGE_KEY);
    // A release may carry different legacy IDs. Never guess their mapping or
    // invoke the writing migration path until the complete merge is valid.
    if (raw !== null && !migrateKnowledge(raw, nextAdapter.seedData, { now: new Date(now()) }).ok) fail('SIGNED_STORAGE_COMPATIBILITY_REJECTED');
  };
  const envelope = (nextAdapter = adapter) => {
    if (!nextAdapter) return null;
    preflight(nextAdapter);
    const read = readKnowledge(storage, nextAdapter.seedData, { now: new Date(now()) });
    if (read.error) fail('SIGNED_STORAGE_READ_FAILED');
    return read.envelope;
  };
  const session = {
    invalidate,
    async refresh(version = desired, operation = 'read') {
      if (!['read', 'decide'].includes(operation)) fail('SIGNED_OPERATION_REJECTED');
      if (!configuration.versions.includes(version)) fail('SIGNED_SELECTION_REJECTED');
      desired = version;
      if (pendingVersion === version && operation === 'read') return false;
      const request = ++requestSequence;
      abort?.abort(); const controller = new AbortController(); abort = controller; pendingVersion = version;
      const timeout = setTimeout(() => controller.abort(), 1500);
      try {
        // This path is fixed by the opt-in launcher. No URL, artifact boolean, or
        // browser storage value can choose the authority for this request.
        const action = operation === 'read' ? 'read' : version === configuration.candidateVersion ? 'adopt' : 'rollback';
        const response = await fetchImpl(`${SIGNED_PATH}snapshot?${new URLSearchParams({ version, action })}`, {
          method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal
        });
        if (!response.ok || !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('cache-control') ?? '')) fail('SIGNED_GATEWAY_UNAVAILABLE');
        const snapshot = await response.json();
        if (request !== requestSequence) return false;
        const nextEvent = snapshot?.emergencyEvent;
        const nextProof = snapshot?.proof;
        if (snapshot.available !== true || snapshot.scope !== 'local-test-only' || snapshot.bundle?.mode !== 'simulation'
          || snapshot.bundle.contentVersion !== version || Object.hasOwn(snapshot, 'trusted')
          || !nextProof || !['packageDigest', 'manifestSha256', 'headDigest'].every((field) => digest(nextProof[field]))
          || !['publisherKeyId', 'adopterKeyId', 'checkpointKeyId'].every((field) => exactId(nextProof[field]))
          || nextProof.publisherKeyId === nextProof.adopterKeyId || !Number.isSafeInteger(nextProof.trustRevision) || nextProof.trustRevision < 1
          || !Number.isFinite(Date.parse(nextProof.validUntil)) || Date.parse(nextProof.validUntil) <= now()
          || !Number.isSafeInteger(nextEvent?.sequence) || nextEvent.sequence < 1
          || !Array.isArray(nextEvent.targetIds) || !nextEvent.targetIds.every(exactId)
          || !Number.isFinite(Date.parse(nextEvent.issuedAt)) || !Number.isFinite(Date.parse(nextEvent.expiresAt))
          || Date.parse(nextEvent.issuedAt) > now() || Date.parse(nextEvent.expiresAt) <= now()
          || now() - Date.parse(nextEvent.issuedAt) > 60 * 60 * 1000) fail('SIGNED_GATEWAY_RESPONSE_REJECTED');
        if (nextEvent.sequence < history.sequence) fail('SIGNED_SEQUENCE_DOWNGRADE');
        if (nextProof.trustRevision < history.trustRevision) fail('SIGNED_TRUST_REVISION_DOWNGRADE');
        if (nextEvent.sequence === history.sequence && nextProof.headDigest !== history.headDigest) fail('SIGNED_SEQUENCE_EQUIVOCATION');
        const nextAdapter = adaptVerifiedBundle(snapshot.bundle, { allowSimulation: true });
        if (validateData(nextAdapter.seedData, { requireDrugSideEffects: true }).length) fail('SIGNED_WEBSITE_DATA_REJECTED');
        preflight(nextAdapter);
        const graph = Object.fromEntries(GRAPH.map((field) => [field, [...new Map(
          [...history.graph[field], ...nextAdapter[field]].map((item) => [JSON.stringify(item), item])).values()]]));
        const nextHistory = { scope: 'denial-only-no-offline-authority', sequence: nextEvent.sequence,
          targetIds: [...new Set([...history.targetIds, ...nextEvent.targetIds])].sort(), headDigest: nextProof.headDigest,
          trustRevision: nextProof.trustRevision, graph };
        // Complete the existing v4 merge before publishing a new active adapter.
        // An incompatible switch has performed only reads above this point.
        envelope(nextAdapter);
        // Persist only monotonic rejection history, never a fresh/trusted lease.
        storage.setItem(SIGNED_SAFETY_KEY, JSON.stringify(nextHistory));
        storage.setItem(SIGNED_SELECTION_KEY, version);
        history = nextHistory; selected = version; adapter = nextAdapter;
        event = clone(nextEvent); proof = clone(nextProof);
        available = true; leaseUntil = Math.min(now() + 2000, Date.parse(nextEvent.expiresAt), Date.parse(nextProof.validUntil)); error = '';
        return true;
      } catch (cause) {
        if (request === requestSequence) { available = false; leaseUntil = 0; error = /^[A-Z0-9_]+$/.test(cause.code ?? '') ? cause.code : 'SIGNED_GATEWAY_UNAVAILABLE'; }
        return false;
      } finally { clearTimeout(timeout); if (request === requestSequence) pendingVersion = null; }
    },
    async adopt(version = desired) { return session.refresh(version, 'decide'); },
    snapshot() {
      let current = null;
      let status = null;
      let backups = [];
      // The Node gateway verifies the signatures and independent latest checkpoint
      // on every read. The boolean here is process-local projection state only;
      // it is never loaded from artifacts or persisted browser data.
      try {
        current = envelope(); backups = listBackups(storage);
        const ledger = available && now() < leaseUntil ? { ...createRetractionLedger(), ...event, targetIds: history.targetIds, trusted: true }
          : { ...createRetractionLedger(), sequence: history.sequence, targetIds: history.targetIds };
        status = current ? projectVisibleKnowledge(current.data, { ...adapter, ...history.graph }, ledger, { now: now() }) : null;
      } catch (cause) {
        invalidate(/^[A-Z0-9_]+$/.test(cause.code ?? '') ? cause.code : 'SIGNED_STORAGE_READ_FAILED');
        current = null; status = null;
      }
      const live = available && now() < leaseUntil;
      const data = status?.data ?? Object.fromEntries(['drugs', 'disorders', 'cases', 'resources'].map((field) => [field, []]));
      return { marker: SIGNED_MARKER, scope: 'local-test-only', production: 'legacy', selected, versions: configuration.versions,
        fresh: live && status?.fresh === true, sequence: history.sequence, data, envelope: current,
        counts: Object.fromEntries(Object.entries(data).map(([field, rows]) => [field, rows.length])),
        backups, error: live ? error : error || 'SIGNED_CURRENT_STATE_REQUIRED', proof: live ? proof : null,
        storageNamespace: SIGNED_STORAGE_PREFIX };
    },
    createFictionalEdits() {
      if (!adapter) fail('SIGNED_CURRENT_STATE_REQUIRED');
      const seed = adapter.seedData;
      let value = envelope();
      value = upsertEntry(value, 'disorders', { ...seed.disorders[0], summary: '完全虚构的签名消费本地覆盖' }, { seedData: seed, now: new Date(now()) });
      value = upsertEntry(value, 'cases', { ...seed.cases[0], id: 't02-signed-fictional-case', title: '完全虚构的签名消费自定义案例' }, { seedData: seed, now: new Date(now()) });
      value = deleteEntry(value, 'resources', seed.resources[0].id, seed, { now: new Date(now()) });
      writeKnowledge(storage, value);
    },
    backup() { return createBackup(storage, storage.getItem(STORAGE_KEY), { now: new Date(now()) }); },
    restore(key) { if (!adapter) fail('SIGNED_CURRENT_STATE_REQUIRED'); return restoreBackup(storage, key, adapter.seedData, { now: new Date(now()) }); }
  };
  return Object.freeze(session);
}
