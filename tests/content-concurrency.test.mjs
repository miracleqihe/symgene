import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runSignedBrowser } from '../scripts/t02/signed-consumer-browser.mjs';
import { probeConsumer, runConcurrencyMatrix } from '../scripts/t02/consumer-concurrency.mjs';
import { startDevelopmentConsumer } from '../scripts/t02/dev-consumer.mjs';
import { startSignedConsumer } from '../scripts/t02/signed-consumer.mjs';
import { isAllowedSplitPath } from '../scripts/local-content/check-split.mjs';
import { createConsumerViteServer } from '../scripts/t02/consumer-vite-server.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const portIsReachable = port => new Promise(resolve => {
  const socket = createConnection({ host: '127.0.0.1', port });
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
  socket.setTimeout(1000, () => { socket.destroy(); resolve(true); });
});

test('close drains a real optimizer writer before removing its cache', { timeout: 20000 }, async () => {
  const writerStarted = Promise.withResolvers();
  const writerFinished = Promise.withResolvers();
  const releaseWriter = Promise.withResolvers();
  let app;
  let closing;
  try {
    app = await createConsumerViteServer({ root: ROOT, server: { host: '127.0.0.1', hmr: false },
      optimizeDeps: { holdUntilCrawlEnd: false, include: ['react'], rolldownOptions: { plugins: [{
        name: 'fictional-delayed-optimizer-writer',
        async writeBundle(options) {
          try {
            writerStarted.resolve();
            await releaseWriter.promise;
            mkdirSync(options.dir, { recursive: true });
            writeFileSync(join(options.dir, 'fictional-late-write'), 'synthetic');
          } finally { writerFinished.resolve(); }
        },
      }] } } });
    await new Promise((resolve, reject) => {
      app.httpServer.once('error', reject);
      app.httpServer.listen(0, '127.0.0.1', resolve);
    });
    await writerStarted.promise;
    const cache = app.config.cacheDir;
    closing = app.close();
    const outcome = await Promise.race([closing.then(() => 'closed'), new Promise(resolve => setTimeout(() => resolve('writer-pending'), 100))]);
    assert.equal(outcome, 'writer-pending', 'close must join the writer, not merely cancel it');
    releaseWriter.resolve();
    await closing;
    assert.equal(existsSync(cache), false, 'late writes must finish before cache deletion');
  } finally {
    releaseWriter.resolve();
    if (app) await writerFinished.promise;
    await (closing ?? app?.close());
  }
});

test('an optimizer drain deadline fails without deleting an unjoined writer cache', { timeout: 30000 }, async () => {
  const writerStarted = Promise.withResolvers();
  const writerFinished = Promise.withResolvers();
  const releaseWriter = Promise.withResolvers();
  let app;
  let pending = [];
  try {
    app = await createConsumerViteServer({ root: ROOT, server: { host: '127.0.0.1', hmr: false },
      optimizeDeps: { holdUntilCrawlEnd: false, include: ['react'], rolldownOptions: { plugins: [{
        name: 'fictional-deadline-optimizer-writer',
        async writeBundle(options) {
          try {
            writerStarted.resolve();
            await releaseWriter.promise;
            mkdirSync(options.dir, { recursive: true });
            writeFileSync(join(options.dir, 'fictional-late-write'), 'synthetic');
          } finally { writerFinished.resolve(); }
        },
      }] } } });
    await new Promise((resolve, reject) => {
      app.httpServer.once('error', reject);
      app.httpServer.listen(0, '127.0.0.1', resolve);
    });
    await writerStarted.promise;
    const port = app.httpServer.address().port;
    pending = Object.values(app.environments.client.depsOptimizer.metadata.discovered).map(info => info.processing);
    await assert.rejects(app.close(), error => error.code === 'T02_CONSUMER_SHUTDOWN_TIMEOUT'
      && error.cleanupIncomplete === true && error.cacheDir === app.config.cacheDir);
    assert.equal(await portIsReachable(port), false, 'the deadline must not leave the owned HTTP endpoint open');
    assert.equal(existsSync(app.config.cacheDir), true, 'an unjoined writer cache must be retained and reported incomplete');
  } finally {
    releaseWriter.resolve();
    if (app) await writerFinished.promise;
    await Promise.all(pending);
    await app?.close().catch(() => {});
    // This test owns the synthetic blocked writer and can join it explicitly.
    if (app) rmSync(app.config.cacheDir, { recursive: true, force: true });
  }
});

test('split scope admits the six reviewed engineering scripts without opening other T02 scripts', () => {
  for (const name of ['consumer-concurrency', 'consumer-vite-server', 'dev-consumer', 'dev-consumer-browser', 'signed-consumer', 'signed-consumer-browser']) {
    assert.equal(isAllowedSplitPath(`scripts/t02/${name}.mjs`), true);
  }
  for (const path of ['scripts/t02/bypass-publication.mjs', 'scripts/t02/consumer-vite-server-extra.mjs', 'scripts/unreviewed.mjs', 'scripts/t02/../unsafe.mjs']) {
    assert.equal(isAllowedSplitPath(path), false);
  }
  for (const path of ['content-pack.lock', 'src/dev/t02-signed-session.js', 'vendor/t02/src/contract.mjs']) assert.equal(isAllowedSplitPath(path), false);
});

test('every live consumer owns an optimizer namespace, including two instances of one type', async () => {
  const servers = [];
  try {
    const factories = [
      () => startDevelopmentConsumer({ enabled: true }),
      () => startDevelopmentConsumer({ enabled: true }),
      () => startSignedConsumer({ enabled: true, gatewayURL: 'http://127.0.0.1:1', versions: ['signed-test-1', 'signed-test-2'], candidateVersion: 'signed-test-2' }),
      () => startSignedConsumer({ enabled: true, gatewayURL: 'http://127.0.0.1:1', versions: ['signed-test-1', 'signed-test-2'], candidateVersion: 'signed-test-2' }),
    ];
    for (const factory of factories) servers.push(await factory());
    const directories = servers.map(server => server.app.config.cacheDir);
    const ports = servers.map(server => server.app.httpServer.address().port);
    assert.equal(new Set(directories).size, 4, 'an optimizer cannot delete another live server cache');
    assert.ok(directories.every(directory => existsSync(directory)));
    await Promise.all(servers.flatMap(server => [server.app.close(), server.app.close()]));
    assert.ok(directories.every(directory => !existsSync(directory)), 'closing servers removes only their owned caches');
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(directories.every(directory => !existsSync(directory)), 'optimizer cancellation must not recreate a cache in the observed cleanup window');
    for (const port of ports) assert.equal(await portIsReachable(port), false, 'owned server must remain closed after the settle window');
  } finally { await Promise.all(servers.map(server => server.app.close())); }
});

test('bounded matrix rejects unbounded or incomplete inputs before creating resources', async () => {
  for (const rounds of [0, 6, 1.5, Infinity]) await assert.rejects(runConcurrencyMatrix({ producerRoot: '/fictional', evidenceDir: '/fictional', rounds }), { code: 'T02_PROBE_ARGUMENT_INVALID' });
  await assert.rejects(runConcurrencyMatrix({ producerRoot: 'relative', evidenceDir: '/fictional' }), { code: 'T02_PROBE_ARGUMENT_INVALID' });
  await assert.rejects(probeConsumer({ kind: 'production' }), { code: 'T02_PROBE_KIND_INVALID' });
});

test('signed browser closes its Vite, gateway and checkpoint on Playwright import failure', async () => {
  const producer = mkdtempSync(join(tmpdir(), 'symgene-t02-cleanup-producer-'));
  const base = resolve(ROOT, '../../.t02-evidence/m4-m5-gated-2026-10-15/website');
  mkdirSync(base, { recursive: true });
  const evidence = mkdtempSync(join(base, 'cleanup-regression-'));
  const marker = join(producer, 'closed.jsonl');
  mkdirSync(join(producer, 'src'));
  // Real loopback sockets make this a lifecycle regression, not a mock close assertion.
  writeFileSync(join(producer, 'src/loopback.mjs'), `
    import { createServer } from 'node:http';
    import { appendFileSync } from 'node:fs';
    export async function resource(name) {
      const server = createServer((request, response) => { response.statusCode = 503; response.end('{}'); });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const port = server.address().port;
      return { url: 'http://127.0.0.1:' + port,
        close: async () => { await new Promise(resolve => server.close(resolve)); appendFileSync(${JSON.stringify(marker)}, JSON.stringify({ name, port, listening: server.listening }) + '\\n'); } };
    }
  `);
  writeFileSync(join(producer, 'src/release-test-fixture.mjs'), `
    import { resource } from './loopback.mjs';
    export async function createReleaseTestFixture({ failClose = false } = {}) { const checkpoint = await resource('checkpoint'); return {
      runtime: { snapshot() {} }, versions: ['signed-test-1', 'signed-test-2'], candidateVersion: 'signed-test-2',
      close: async () => { await checkpoint.close(); if (failClose) throw new Error('FICTIONAL_CLOSE_FAILURE'); }
    }; }
  `);
  writeFileSync(join(producer, 'src/release-gateway.mjs'), `import { resource } from './loopback.mjs'; export const startReleaseGateway = () => resource('gateway');`);
  writeFileSync(join(producer, 'src/pack.mjs'), `export const verifyPack = () => { throw new Error('must not reach package verification'); };`);
  const events = [];
  try {
    await assert.rejects(runSignedBrowser({ producerRoot: producer, evidenceDir: evidence,
      playwrightModule: join(producer, 'missing-playwright.mjs'), onStage: event => events.push(event) }), { code: 'ERR_MODULE_NOT_FOUND' });
    const rows = readFileSync(marker, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(new Set(rows.map(row => row.name)), new Set(['checkpoint', 'gateway']));
    assert.ok(rows.every(row => row.listening === false));
    const vite = events.find(event => event.stage === 'ready');
    assert.ok(vite, 'the failure must happen after Vite actually started');
    assert.ok(events.some(event => event.stage === 'closed' && event.serverClosed === true));
    const ports = [...rows.map(row => row.port), Number(new URL(vite.origin).port)];
    for (const port of ports) {
      const reachable = await portIsReachable(port);
      assert.equal(reachable, false, `owned port ${port} must be closed`);
    }
    writeFileSync(join(evidence, 'signed-browser-report.json'), 'STALE_PASS');
    await assert.rejects(runSignedBrowser({ producerRoot: producer, evidenceDir: evidence,
      playwrightModule: join(producer, 'missing-playwright.mjs'), fixtureOptions: { failClose: true } }),
      { name: 'AggregateError', message: 'SIGNED_BROWSER_CLEANUP_FAILED' });
    assert.equal(existsSync(join(evidence, 'signed-browser-report.json')), false, 'cleanup failure must not leave a PASS report');
    assert.equal(JSON.parse(readFileSync(join(evidence, 'signed-browser-failure.json'))).code, 'SIGNED_BROWSER_CLEANUP_FAILED');
    assert.deepEqual(JSON.parse(readFileSync(join(evidence, 'signed-browser-failure.json'))).cleanupErrors,
      [{ code: 'FICTIONAL_CLOSE_FAILURE', cleanupIncomplete: false }]);
  } finally { rmSync(producer, { recursive: true, force: true }); rmSync(evidence, { recursive: true, force: true }); }
});
