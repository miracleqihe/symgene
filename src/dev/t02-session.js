import { adaptVerifiedBundle, createRetractionLedger, acceptEmergencyRetractions, projectVisibleKnowledge } from '../content/adapter.js';
import { readKnowledge, writeKnowledge, createBackup, listBackups, restoreBackup } from '../storage/storage.js';
import { upsertEntry, deleteEntry } from '../storage/operations.js';
import { MAX_IMPORT_BYTES, serializeKnowledgeExport, parseKnowledgeImport, applyKnowledgeImport, summarizeKnowledgeImport } from '../storage/importExport.js';
import { STORAGE_KEY } from '../storage/constants.js';
import { validateData } from '../validation/dataValidation.js';
import { CLOCK_KEY, LEDGER_KEY, SELECTION_KEY } from './t02-storage.js';

export const DEVELOPMENT_MARKER = 'T02_DEV_SYNTHETIC_CONSUMER';
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const clone = (value) => JSON.parse(JSON.stringify(value));

export async function readDevelopmentImportFile(file) {
  if (!Number.isSafeInteger(file?.size) || file.size < 0 || file.size > MAX_IMPORT_BYTES) fail('import-file-too-large');
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_IMPORT_BYTES) fail('import-file-too-large');
  if (bytes.byteLength !== file.size) fail('DEV_IMPORT_SIZE_MISMATCH');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail('DEV_IMPORT_UTF8_INVALID'); }
}

export function createDevelopmentSession(bootstrap, storage, { clock = Date.now } = {}) {
  if (bootstrap?.marker !== DEVELOPMENT_MARKER || bootstrap.scope !== 'local_simulation_only'
    || bootstrap.production !== 'legacy' || !Array.isArray(bootstrap.packs) || bootstrap.packs.length < 2) fail('DEV_BOOTSTRAP_REJECTED');
  const floors = bootstrap.policy?.minimumLegacyCounts;
  if (!floors || Object.keys(floors).length !== 5
    || ['drugs', 'disorders', 'cases', 'resources', 'institutions'].some((key) => !Number.isSafeInteger(floors[key]) || floors[key] < 0)) fail('DEV_BOOTSTRAP_REJECTED');
  const packs = new Map();
  // Finish validation before any storage reads/writes or exposing any package.
  for (const pack of bootstrap.packs) {
    if (pack.bundle?.mode !== 'simulation' || pack.contentVersion !== pack.bundle.contentVersion
      || !/^[a-f0-9]{64}$/.test(pack.packageDigest ?? '') || packs.has(pack.contentVersion)) fail('DEV_BOOTSTRAP_REJECTED');
    const adapter = adaptVerifiedBundle(pack.bundle, { allowSimulation: true });
    if (validateData(adapter.seedData, { requireDrugSideEffects: true }).length
      || Object.entries(floors).some(([type, floor]) => (type === 'institutions' ? adapter.institutions.length : adapter.seedData[type].length) < floor)) fail('DEV_BOOTSTRAP_DATA_INVALID');
    packs.set(pack.contentVersion, { ...pack, adapter });
  }
  if (!packs.has(bootstrap.candidateVersion)) fail('DEV_BOOTSTRAP_REJECTED');
  const history = Object.fromEntries(['identities', 'redirects', 'dependencies', 'retractions'].map((field) => [field, [...packs.values()].flatMap((pack) => pack.adapter[field]) ]));
  let selected = storage.getItem(SELECTION_KEY) ?? bootstrap.candidateVersion;
  if (!packs.has(selected)) fail('DEV_SELECTION_INVALID');
  let timeOffset = Number(storage.getItem(CLOCK_KEY) ?? 0);
  if (!Number.isSafeInteger(timeOffset) || timeOffset < 0) fail('DEV_CLOCK_STATE_INVALID');
  let lastError = null;
  const now = () => clock() + timeOffset;
  const active = () => packs.get(selected);
  const adapter = () => ({ ...active().adapter, ...history });
  const ledger = () => {
    const raw = storage.getItem(LEDGER_KEY);
    if (raw === null) return createRetractionLedger();
    try {
      const value = JSON.parse(raw);
      if (value.scope !== 'local_simulation_only' || value.synthetic !== true
        || !Array.isArray(value.ledger?.targetIds) || !Array.isArray(value.ledger?.eventTargetIds)) fail('DEV_SAFETY_STATE_INVALID');
      return value.ledger;
    } catch { fail('DEV_SAFETY_STATE_INVALID'); }
  };
  const current = () => {
    const result = readKnowledge(storage, active().adapter.seedData, { now: new Date(now()) });
    if (result.error) fail('DEV_STORAGE_READ_FAILED');
    return result.envelope;
  };
  const saveLedger = (value) => storage.setItem(LEDGER_KEY, JSON.stringify({ scope: 'local_simulation_only', synthetic: true, ledger: value }));
  const session = {
    snapshot() {
      const envelope = current();
      let status;
      try { status = projectVisibleKnowledge(envelope.data, adapter(), ledger(), { now: now() }); }
      catch { status = projectVisibleKnowledge(envelope.data, adapter(), createRetractionLedger(), { now: now() }); }
      return {
        marker: DEVELOPMENT_MARKER, scope: 'local_simulation_only', production: 'legacy', selected,
        versions: [...packs.keys()], candidateVersion: bootstrap.candidateVersion,
        envelope, data: status.data, fresh: status.fresh, contentFresh: status.contentFresh, sequence: status.sequence,
        counts: Object.fromEntries(Object.entries(status.data).map(([key, rows]) => [key, rows.length])), simulatedTimeOffsetMs: timeOffset,
        backups: listBackups(storage), lastError
      };
    },
    select(version) {
      if (!packs.has(version)) fail('DEV_SELECTION_INVALID');
      // Validate the merge without changing selection if a package fails.
      const previous = selected;
      selected = version;
      try { current(); storage.setItem(SELECTION_KEY, version); }
      catch (error) { selected = previous; throw error; }
    },
    trustSyntheticState(target = null) {
      const previous = ledger();
      const targetIds = target === null ? [] : [target];
      if (target !== null && !history.identities.some((identity) => identity.canonicalId === target)) fail('DEV_TARGET_INVALID');
      const next = acceptEmergencyRetractions(previous, {
        sequence: previous.sequence + 1, targetIds,
        issuedAt: new Date(now() - 1000).toISOString(), expiresAt: new Date(now() + 30 * 60 * 1000).toISOString()
      }, { trusted: true, now: now() });
      saveLedger(next);
    },
    withdrawDisorder() {
      const identity = active().adapter.identities.find((item) => item.collection === 'disorders');
      if (!identity) fail('DEV_TARGET_MISSING');
      session.trustSyntheticState(identity.canonicalId);
    },
    createFictionalEdits() {
      const seed = active().adapter.seedData;
      let envelope = current();
      envelope = upsertEntry(envelope, 'disorders', { ...seed.disorders[0], summary: '完全虚构的 React 开发本地覆盖' }, { seedData: seed, now: new Date(now()) });
      envelope = upsertEntry(envelope, 'cases', { ...seed.cases[0], id: 't02-fictional-local-case', title: '完全虚构的 React 本地案例' }, { seedData: seed, now: new Date(now()) });
      envelope = deleteEntry(envelope, 'resources', seed.resources[0].id, seed, { now: new Date(now()) });
      writeKnowledge(storage, envelope);
    },
    backup() { return createBackup(storage, storage.getItem(STORAGE_KEY), { now: new Date(now()) }); },
    restore(key) { return restoreBackup(storage, key, active().adapter.seedData, { now: new Date(now()) }); },
    exportText() {
      return JSON.stringify({ ...JSON.parse(serializeKnowledgeExport(current(), { now: new Date(now()) })), documentType: 't02-synthetic-backup', synthetic: true }, null, 2);
    },
    previewImport(text, size) {
      // The real import parser enforces 5 MiB before JSON parsing. Do not parse
      // a second unbounded input in this developer entry.
      const parsed = parseKnowledgeImport(text, { size, seedData: active().adapter.seedData, now: new Date(now()) });
      const tag = JSON.parse(text);
      if (tag.documentType !== 't02-synthetic-backup' || tag.synthetic !== true) fail('DEV_IMPORT_SYNTHETIC_REQUIRED');
      return { parsed, summary: summarizeKnowledgeImport(parsed.envelope, current()) };
    },
    importConfirmed(preview) { return applyKnowledgeImport(storage, clone(preview.parsed.envelope), { confirmed: true, now: new Date(now()) }); },
    expireSyntheticState() { const next = timeOffset + 2 * 60 * 60 * 1000; storage.setItem(CLOCK_KEY, String(next)); timeOffset = next; },
    noteError(error) { lastError = /^[A-Z0-9_-]+$/i.test(error?.code ?? '') ? error.code : 'DEV_OPERATION_FAILED'; }
  };
  return session;
}
