import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { MemoryStorage } from './helpers/storage-fixtures.mjs';
import { loadDevelopmentBootstrap, startDevelopmentConsumer } from '../scripts/t02/dev-consumer.mjs';
import { createDevelopmentStorage, DEVELOPMENT_STORAGE_PREFIX, LEDGER_KEY } from '../src/dev/t02-storage.js';
import { createDevelopmentSession, DEVELOPMENT_MARKER, readDevelopmentImportFile } from '../src/dev/t02-session.js';
import { STORAGE_KEY, BACKUP_KEY_PREFIX } from '../src/storage/constants.js';
import { matchKnowledge } from '../src/search.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const NOW = Date.parse('2026-10-15T12:00:00Z');
const bootstrap = await loadDevelopmentBootstrap(ROOT, { now: NOW });
function setup() {
  const native = new MemoryStorage([[STORAGE_KEY, 'fictional-original-user-envelope'], [`${BACKUP_KEY_PREFIX}fictional`, 'fictional-original-user-backup'], ['unrelated', 'fictional-unrelated']]);
  const storage = createDevelopmentStorage(native);
  const session = createDevelopmentSession(bootstrap, storage, { clock: () => NOW });
  return { native, storage, session };
}
function originalUntouched(native) {
  assert.equal(native.getItem(STORAGE_KEY), 'fictional-original-user-envelope');
  assert.equal(native.getItem(`${BACKUP_KEY_PREFIX}fictional`), 'fictional-original-user-backup');
  assert.equal(native.getItem('unrelated'), 'fictional-unrelated');
}

test('development consumer requires strict explicit opt-in before looking up a root', async () => {
  for (const enabled of [false, undefined, 'true', 1]) await assert.rejects(startDevelopmentConsumer({ enabled, root: 'fictional-nonexistent-root' }), { code: 'DEV_CONSUMER_DISABLED' });
});

test('development bootstrap uses complete locked simulation packages and legacy production', () => {
  assert.equal(bootstrap.marker, DEVELOPMENT_MARKER);
  assert.equal(bootstrap.production, 'legacy');
  assert.equal(bootstrap.packs.length, 2);
  assert.ok(bootstrap.packs.every((pack) => pack.bundle.mode === 'simulation'));
});

test('storage namespace covers reads, enumeration, removal and clear without original writes', () => {
  const { native, storage } = setup();
  storage.setItem(STORAGE_KEY, 'fictional-isolated');
  storage.setItem(`${BACKUP_KEY_PREFIX}isolated`, 'fictional-isolated-backup');
  assert.equal(storage.length, 2);
  assert.deepEqual(new Set([storage.key(0), storage.key(1)]), new Set([STORAGE_KEY, `${BACKUP_KEY_PREFIX}isolated`]));
  assert.equal(storage.key(2), null);
  assert.equal(native.getItem(DEVELOPMENT_STORAGE_PREFIX + STORAGE_KEY), 'fictional-isolated');
  assert.throws(() => storage.setItem('unrelated', 'rejected'), { code: 'DEV_STORAGE_KEY_REJECTED' });
  storage.removeItem(`${BACKUP_KEY_PREFIX}isolated`);
  assert.equal(storage.length, 1);
  storage.clear();
  assert.equal(storage.length, 0);
  originalUntouched(native);
});

test('invalid or public bootstrap is rejected before any storage access', () => {
  for (const change of [(value) => { value.production = 'public'; }, (value) => { value.packs[0].bundle.mode = 'public'; }, (value) => { value.packs[1].bundle.entities = []; }]) {
    const candidate = structuredClone(bootstrap); change(candidate);
    let calls = 0;
    const storage = new Proxy({}, { get() { calls++; throw new Error('must not touch storage'); } });
    assert.throws(() => createDevelopmentSession(candidate, storage));
    assert.equal(calls, 0);
  }
});

test('React session projects after real storage APIs and preserves override, tombstone, backup on rollback/import', () => {
  const { native, storage, session } = setup();
  assert.ok(Object.values(session.snapshot().counts).every((count) => count === 0));
  session.trustSyntheticState();
  assert.equal(session.snapshot().counts.disorders, 1);
  session.createFictionalEdits();
  const before = session.snapshot();
  assert.equal(before.envelope.data.cases.length, 2);
  assert.equal(before.envelope.deletedIds.resources.length, 1);
  assert.ok(Object.keys(before.envelope.localOverrides.disorders).length);
  const backup = session.backup();
  const exported = session.exportText();
  session.withdrawDisorder();
  let hidden = session.snapshot();
  assert.equal(hidden.counts.disorders, 0);
  assert.equal(hidden.counts.cases, 0);
  assert.equal(matchKnowledge(before.envelope.data.disorders[0].name, hidden.data).disorders.length, 0);
  const sequence = hidden.sequence;
  const safetyBefore = storage.getItem(LEDGER_KEY);
  session.restore(backup);
  session.select(bootstrap.packs[0].contentVersion);
  const preview = session.previewImport(exported);
  session.importConfirmed(preview);
  hidden = session.snapshot();
  assert.equal(hidden.sequence, sequence);
  assert.equal(hidden.counts.disorders, 0);
  assert.equal(hidden.counts.cases, 0);
  assert.equal(hidden.envelope.data.disorders[0].summary, '完全虚构的 React 开发本地覆盖');
  assert.equal(hidden.envelope.deletedIds.resources.length, 1);
  assert.equal(hidden.envelope.data.cases.length, 2);
  assert.equal(storage.getItem(LEDGER_KEY), safetyBefore);
  const recovered = createDevelopmentSession(bootstrap, storage, { clock: () => NOW }).snapshot();
  assert.equal(recovered.selected, bootstrap.packs[0].contentVersion);
  assert.equal(recovered.counts.disorders, 0);
  originalUntouched(native);
});

test('bad imports and unknown packages preserve the last stored bytes and selection', () => {
  const { native, storage, session } = setup();
  const before = session.snapshot();
  const bytes = storage.getItem(STORAGE_KEY);
  for (const text of ['{}', '{', 'x'.repeat(5 * 1024 * 1024 + 1)]) assert.throws(() => session.previewImport(text));
  assert.throws(() => session.select('fictional-unknown-version'), { code: 'DEV_SELECTION_INVALID' });
  assert.equal(session.snapshot().selected, before.selected);
  assert.equal(storage.getItem(STORAGE_KEY), bytes);
  originalUntouched(native);
});

test('real File invalid UTF-8 is rejected before the text-only storage importer can accept replacement characters', async () => {
  const { storage, session } = setup();
  session.snapshot();
  const exported = JSON.parse(session.exportText());
  exported.data.disorders[0].summary = 'fictional-utf8-slot';
  const bytes = Buffer.from(JSON.stringify(exported));
  bytes[bytes.indexOf('fictional-utf8-slot')] = 0xff;
  const file = new File([bytes], 'fictional-invalid-utf8.json', { type: 'application/json' });
  const raw = storage.getItem(STORAGE_KEY);
  const lossyText = await file.text();
  assert.ok(lossyText.includes('\ufffd'));
  assert.doesNotThrow(() => session.previewImport(lossyText, file.size));
  await assert.rejects(readDevelopmentImportFile(file), { code: 'DEV_IMPORT_UTF8_INVALID' });
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  const valid = new File([session.exportText()], 'fictional-valid.json', { type: 'application/json' });
  assert.equal(await readDevelopmentImportFile(valid), session.exportText());
});

test('file metadata and actual byte limits are checked before decoding', async () => {
  let reads = 0;
  await assert.rejects(readDevelopmentImportFile({ size: 5 * 1024 * 1024 + 1, arrayBuffer() { reads++; } }), { code: 'import-file-too-large' });
  assert.equal(reads, 0);
  await assert.rejects(readDevelopmentImportFile({ size: 1, async arrayBuffer() { return new ArrayBuffer(2); } }), { code: 'DEV_IMPORT_SIZE_MISMATCH' });
});

test('expired and corrupted isolated safety state fail closed without changing knowledge or backups', () => {
  const { storage, session } = setup();
  session.trustSyntheticState(); session.createFictionalEdits(); session.backup();
  const raw = storage.getItem(STORAGE_KEY);
  const backupCount = session.snapshot().backups.length;
  session.expireSyntheticState();
  assert.ok(Object.values(session.snapshot().counts).every((count) => count === 0));
  assert.ok(Object.values(createDevelopmentSession(bootstrap, storage, { clock: () => NOW }).snapshot().counts).every((count) => count === 0));
  storage.setItem(LEDGER_KEY, '{fictional-invalid');
  assert.ok(Object.values(session.snapshot().counts).every((count) => count === 0));
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.equal(session.snapshot().backups.length, backupCount);
});

test('actual production build excludes the development React app and enabling markers', async () => {
  // Vite development servers in earlier cases set NODE_ENV=development.
  // This case claims a production build, so explicitly restore that mode.
  const previousNodeEnv = process.env.NODE_ENV;
  let result;
  try {
    process.env.NODE_ENV = 'production';
    result = await build({ root: ROOT, logLevel: 'silent', build: { write: false } });
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
  assert.ok(outputs.some((asset) => asset.type === 'chunk' && asset.isEntry));
  for (const asset of outputs) {
    const text = asset.type === 'chunk' ? asset.code : String(asset.source);
    assert.doesNotMatch(text, /T02_DEV_SYNTHETIC_CONSUMER|symgene-t02-development:|enable-synthetic|t02-consumer\.jsx/);
    assert.doesNotMatch(asset.fileName, /t02-consumer|t02-session|t02-storage/);
  }
});
