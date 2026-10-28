import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { loadDevelopmentBootstrap, startDevelopmentConsumer } from '../scripts/t02/dev-consumer.mjs';
import { startSignedConsumer } from '../scripts/t02/signed-consumer.mjs';
import { createSignedSession, createSignedStorage, SIGNED_MARKER, SIGNED_SAFETY_KEY, SIGNED_SELECTION_KEY, SIGNED_STORAGE_PREFIX } from '../src/dev/t02-signed-session.js';
import { adaptVerifiedBundle } from '../src/content/adapter.js';
import { STORAGE_KEY, BACKUP_KEY_PREFIX } from '../src/storage/constants.js';
import { MemoryStorage } from './helpers/storage-fixtures.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const NOW = Date.parse('2026-10-15T12:00:00Z');
const bootstrap = await loadDevelopmentBootstrap(ROOT, { now: NOW });
const candidate = bootstrap.packs.at(-1);
const configuration = { marker: SIGNED_MARKER, scope: 'local-test-only', production: 'legacy',
  versions: bootstrap.packs.map((pack) => pack.contentVersion), candidateVersion: candidate.contentVersion };
const snapshot = () => ({ available: true, scope: 'local-test-only', bundle: candidate.bundle,
  emergencyEvent: { sequence: 1, targetIds: [], issuedAt: new Date(NOW - 1000).toISOString(), expiresAt: new Date(NOW + 60000).toISOString() },
  proof: { packageDigest: '1'.repeat(64), manifestSha256: '2'.repeat(64), headDigest: '3'.repeat(64),
    publisherKeyId: 'fictional-publisher', adopterKeyId: 'fictional-adopter', checkpointKeyId: 'fictional-checkpoint', trustRevision: 1,
    validUntil: new Date(NOW + 60000).toISOString() } });
const native = () => new MemoryStorage([[STORAGE_KEY, 'fictional-original'], [`${BACKUP_KEY_PREFIX}fictional`, 'fictional-original-backup']]);

test('signed launcher requires explicit opt-in and fixed loopback authority before starting', async () => {
  await assert.rejects(startSignedConsumer(), { code: 'SIGNED_CONSUMER_DISABLED' });
  for (const gatewayURL of ['https://example.org', 'http://localhost:1000', 'http://127.0.0.1:1000/other', 'http://127.0.0.1:1000/?authority=example']) {
    await assert.rejects(startSignedConsumer({ enabled: true, gatewayURL }), { code: 'SIGNED_GATEWAY_URL_REJECTED' });
  }
});

test('signed launcher preserves every producer-valid version spelling without rewriting it', async () => {
  const versions = ['Release_2026.10', 'v'.repeat(80)];
  const server = await startSignedConsumer({ enabled: true, gatewayURL: 'http://127.0.0.1:12345', versions,
    candidateVersion: versions[1] });
  try {
    const response = await fetch(`${server.url}configuration`);
    assert.deepEqual((await response.json()).versions, versions);
  } finally { await server.app.close(); }
});

test('both opt-in launchers atomically reserve different ephemeral ports and close after a bind failure', async () => {
  const servers = [];
  const signedOptions = { enabled: true, gatewayURL: 'http://127.0.0.1:12345', versions: configuration.versions, candidateVersion: configuration.candidateVersion };
  const start = async (factory, options) => { const server = await factory(options); servers.push(server); return server; };
  try {
    const started = await Promise.all([start(startSignedConsumer, signedOptions), start(startSignedConsumer, signedOptions),
      start(startDevelopmentConsumer, { enabled: true }), start(startDevelopmentConsumer, { enabled: true })]);
    assert.equal(new Set(started.map((server) => new URL(server.url).port)).size, 4);
    for (let index = 0; index < started.length; index++) {
      const response = await fetch(`${started[index].url}${index < 2 ? 'configuration' : 'bootstrap'}`);
      assert.equal(response.status, 200); assert.equal((await response.json()).production, 'legacy');
    }
    const occupied = Number(new URL(started[0].url).port);
    await assert.rejects(startSignedConsumer({ ...signedOptions, port: occupied }));
    await assert.rejects(startDevelopmentConsumer({ enabled: true, port: occupied }));
    const response = await fetch(`${started[0].url}configuration`); assert.equal(response.status, 200); await response.json();
  } finally { await Promise.all(servers.map((server) => server.app.close())); }
});

test('signed projection requires an online response and never reads persisted fresh/trusted booleans', async () => {
  const original = native(); const storage = createSignedStorage(original);
  let value = snapshot(); let online = true; let clock = NOW;
  const fetchImpl = async (url, options) => {
    assert.ok(url.startsWith('/symgene/t02-signed/snapshot?'));
    assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error');
    if (!online) throw new TypeError('Fictional network failure');
    return new Response(JSON.stringify(value), { headers: { 'Cache-Control': 'no-store' } });
  };
  const session = createSignedSession(configuration, storage, { fetchImpl, clock: () => clock });
  assert.equal(session.snapshot().fresh, false);
  assert.equal(await session.refresh(), true);
  assert.equal(session.snapshot().counts.disorders, 1);
  session.createFictionalEdits(); session.backup();
  const before = session.snapshot();
  assert.ok(before.envelope.localOverrides.disorders);
  assert.equal(before.envelope.deletedIds.resources.length, 1);
  const persisted = JSON.parse(storage.getItem(SIGNED_SAFETY_KEY));
  assert.equal(persisted.scope, 'denial-only-no-offline-authority');
  assert.equal(Object.hasOwn(persisted, 'trusted'), false);
  assert.equal(Object.hasOwn(persisted, 'bundle'), false);
  storage.setItem(SIGNED_SAFETY_KEY, JSON.stringify({ ...persisted, trusted: true, fresh: true }));
  assert.equal(createSignedSession(configuration, storage, { fetchImpl, clock: () => clock }).snapshot().fresh, false);
  clock += 2100;
  assert.equal(session.snapshot().fresh, false);
  assert.ok(Object.values(session.snapshot().counts).every((count) => count === 0));
  clock = NOW; online = false; await session.refresh();
  assert.equal(session.snapshot().fresh, false);
  assert.equal(session.snapshot().backups.length, before.backups.length);
  assert.equal(original.getItem(STORAGE_KEY), 'fictional-original');
  assert.equal(original.getItem(`${BACKUP_KEY_PREFIX}fictional`), 'fictional-original-backup');
  assert.ok([...original.values.keys()].filter((key) => key !== STORAGE_KEY && key !== `${BACKUP_KEY_PREFIX}fictional`).every((key) => key.startsWith(SIGNED_STORAGE_PREFIX)));
});

test('signed consumer rejects artifact trust flags, cacheable responses and proof downgrade', async () => {
  let value = snapshot(); let noStore = true;
  const session = createSignedSession(configuration, createSignedStorage(native()), { clock: () => NOW,
    fetchImpl: async () => new Response(JSON.stringify(value), { headers: { 'Cache-Control': noStore ? 'no-store' : 'max-age=60' } }) });
  value.trusted = true; assert.equal(await session.refresh(), false);
  value = snapshot(); noStore = false; assert.equal(await session.refresh(), false);
  noStore = true; assert.equal(await session.refresh(), true);
  value.proof.headDigest = '4'.repeat(64); assert.equal(await session.refresh(), false);
  assert.equal(session.snapshot().error, 'SIGNED_SEQUENCE_EQUIVOCATION');
  value = snapshot(); value.emergencyEvent.sequence = 0; assert.equal(await session.refresh(), false);
  assert.ok(Object.values(session.snapshot().counts).every((count) => count === 0));
});

test('a late successful gateway read cannot reopen a session invalidated by network failure', async () => {
  let resolve;
  const session = createSignedSession(configuration, createSignedStorage(native()), { clock: () => NOW,
    fetchImpl: () => new Promise((done) => { resolve = done; }) });
  const pending = session.refresh();
  session.invalidate('SIGNED_NETWORK_OFFLINE');
  resolve(new Response(JSON.stringify(snapshot()), { headers: { 'Cache-Control': 'no-store' } }));
  assert.equal(await pending, false);
  assert.equal(session.snapshot().fresh, false);
  assert.equal(session.snapshot().sequence, 0);
  assert.ok(Object.values(session.snapshot().counts).every((count) => count === 0));
});

test('disjoint legacy IDs reject a switch before adopting or writing and keep failed snapshots safely hidden', async () => {
  const disjoint = structuredClone(candidate.bundle);
  disjoint.contentVersion = configuration.versions[0];
  const remap = new Map(disjoint.entities.filter((item) => item.legacy).map((item) => [`${item.legacy.collection}:${item.legacy.id}`, `fictional-old-${item.legacy.id}`]));
  for (const item of disjoint.entities) {
    if (!item.legacy) continue;
    item.legacy.id = remap.get(`${item.legacy.collection}:${item.legacy.id}`); item.payload.id = item.legacy.id;
    if (item.payload.disorderId) item.payload.disorderId = remap.get(`disorders:${item.payload.disorderId}`);
    for (const field of ['relatedDrugIds', 'drugIds']) if (item.payload[field]) item.payload[field] = item.payload[field].map((id) => remap.get(`drugs:${id}`));
  }
  assert.deepEqual(adaptVerifiedBundle(disjoint, { allowSimulation: true }).seedData.disorders[0].relatedDrugIds,
    [adaptVerifiedBundle(disjoint, { allowSimulation: true }).seedData.drugs[0].id]);
  const original = native(); const storage = createSignedStorage(original);
  const session = createSignedSession(configuration, storage, { clock: () => NOW,
    fetchImpl: async (url) => {
      const next = snapshot(); if (new URL(url, 'http://example.org').searchParams.get('version') === disjoint.contentVersion) next.bundle = disjoint;
      return new Response(JSON.stringify(next), { headers: { 'Cache-Control': 'no-store' } });
    } });
  assert.equal(await session.refresh(), true); session.createFictionalEdits(); session.backup();
  const before = [...original.values.entries()];
  assert.equal(await session.refresh(disjoint.contentVersion), false);
  assert.deepEqual([...original.values.entries()], before);
  assert.equal(storage.getItem(SIGNED_SELECTION_KEY), configuration.candidateVersion);
  let failed; assert.doesNotThrow(() => { failed = session.snapshot(); });
  assert.equal(failed.fresh, false); assert.equal(failed.selected, configuration.candidateVersion);
  assert.ok(Object.values(failed.counts).every((count) => count === 0));
  assert.equal(failed.envelope.data.cases.length, 2);
  assert.equal(failed.envelope.deletedIds.resources.length, 1);
  assert.ok(Object.keys(failed.envelope.localOverrides.disorders).length > 0);
  assert.deepEqual([...original.values.entries()], before);
  assert.equal(await session.refresh(configuration.candidateVersion), true);
  assert.equal(session.snapshot().counts.disorders, 1);
});

test('corrupted signed storage returns a stable hidden snapshot without changing user bytes or backups', async () => {
  const original = native(); const storage = createSignedStorage(original);
  const session = createSignedSession(configuration, storage, { clock: () => NOW,
    fetchImpl: async () => new Response(JSON.stringify(snapshot()), { headers: { 'Cache-Control': 'no-store' } }) });
  assert.equal(await session.refresh(), true); session.backup();
  storage.setItem(STORAGE_KEY, '{fictional-invalid');
  const before = [...original.values.entries()];
  for (let index = 0; index < 3; index++) {
    let failed; assert.doesNotThrow(() => { failed = session.snapshot(); });
    assert.equal(failed.fresh, false); assert.equal(failed.proof, null);
    assert.ok(Object.values(failed.counts).every((count) => count === 0));
  }
  assert.deepEqual([...original.values.entries()], before);
});

test('same-origin proxy fetches authority on every read and refuses offline cached content', async () => {
  let requests = 0; let available = true;
  const upstream = createServer((request, response) => {
    requests++; response.setHeader('Cache-Control', 'no-store'); response.setHeader('Content-Type', 'application/json');
    response.statusCode = available ? 200 : 503; response.end(JSON.stringify(available ? snapshot() : { available: false }));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const server = await startSignedConsumer({ enabled: true, gatewayURL: `http://127.0.0.1:${upstream.address().port}`,
    versions: configuration.versions, candidateVersion: configuration.candidateVersion });
  try {
    const target = `${server.url}snapshot?version=${candidate.contentVersion}&action=adopt`;
    for (let index = 0; index < 2; index++) {
      const response = await fetch(target); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
      await response.json();
    }
    assert.equal(requests, 2);
    available = false;
    const response = await fetch(target); assert.equal(response.status, 503); assert.equal((await response.json()).available, false);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const rejected = await fetch(`${target}&source=http://example.org`); assert.equal(rejected.status, 400); await rejected.text();
  } finally { await server.app.close(); await new Promise((resolve) => upstream.close(resolve)); }
});

test('actual production build excludes signed development UI, routes and namespace', async () => {
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
  for (const asset of (Array.isArray(result) ? result : [result]).flatMap((item) => item.output)) {
    const value = asset.type === 'chunk' ? asset.code : String(asset.source);
    assert.doesNotMatch(value, /T02_SIGNED_TEST_CONSUMER|symgene-t02-signed-test:|enable-signed-test|t02-signed-consumer|t02-signed-session|\/symgene\/t02-signed\//);
    assert.doesNotMatch(asset.fileName, /t02-signed/);
  }
});

test('frequent session refreshes only read; adopting and rolling back are explicit operations', async () => {
  const actions = [];
  const session = createSignedSession(configuration, createSignedStorage(native()), { clock: () => NOW,
    fetchImpl: async (url) => {
      const query = new URL(url, 'http://example.org').searchParams;
      actions.push(query.get('action'));
      const value = structuredClone(snapshot()); value.bundle.contentVersion = query.get('version');
      return new Response(JSON.stringify(value), { headers: { 'Cache-Control': 'no-store' } });
    } });
  for (let poll = 0; poll < 40; poll++) assert.equal(await session.refresh(), true);
  assert.deepEqual(actions, Array(40).fill('read'));
  assert.equal(await session.adopt(configuration.candidateVersion), true);
  assert.equal(actions.at(-1), 'adopt');
  assert.equal(await session.adopt(configuration.versions[0]), true);
  assert.equal(actions.at(-1), 'rollback');
  assert.equal(await session.refresh(), true); assert.equal(actions.at(-1), 'read');
});
