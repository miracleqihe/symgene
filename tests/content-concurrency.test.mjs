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
    await new Promise(resolve => setTimeout(resolve, 150));
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

test('worker supervision rejects signals, report-before-failure, absent and mismatched reports', { timeout: 15000 }, async () => {
  const { superviseWorker, isWorkerSuccess } = await import('../scripts/t02/consumer-concurrency.mjs');
  const directory = mkdtempSync(join(tmpdir(), 'symgene-worker-negatives-'));
  const modulePath = join(directory, 'worker.mjs');
  writeFileSync(modulePath, `
    const options = JSON.parse(process.env.SYM_T02_PROBE_OPTIONS);
    if (options.scenario === 'orphan-pipe') {
      const { spawn } = await import('node:child_process');
      const descendant = spawn(process.execPath, ['-e', "const s=require('node:net').createServer();process.on('SIGTERM',()=>{});s.listen(0,'127.0.0.1',()=>process.send({port:s.address().port}));"], { stdio: ['ignore','inherit','inherit','ipc'] });
      await new Promise(resolve => descendant.once('message', message => { console.log(JSON.stringify({ descendantPort: message.port })); resolve(); }));
      process.disconnect(); process.exit(0);
    }
    const row = { kind: options.kind, pid: process.pid, status: 'PASS', complete: true, externalRequests: 0,
      pageErrors: [], consoleErrors: [], requestFailures: [], httpErrors: [], http504Count: 0,
      cachePolicy: 'per-instance-owned', serverClosed: true, browserClosed: true, ownedCacheRemoved: true, cleanupErrors: [],
      closedPorts: [{port: 1, reachable: false}],
      timeline: ['start','ready','domcontentloaded','react-mount','snapshot','closed'].map(stage => ({stage})) };
    if (options.scenario === 'wrong-kind') row.kind = 'signed';
    const report = { type: 'complete', version: 1, mode: 'probe', pid: process.pid,
      executionId: options.scenario === 'wrong-execution' ? 'fictional-other-execution' : process.env.SYM_T02_EXECUTION_ID, result: row };
    if (options.scenario === 'timeout') { process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); }
    else if (options.scenario.startsWith('SIG')) { process.kill(process.pid, options.scenario); }
    else if (options.scenario === 'missing') process.disconnect();
    else await new Promise(resolve => process.send(report, resolve));
    if (options.scenario === 'report-fail') process.exitCode = 7;
    if (process.connected && options.scenario !== 'timeout') process.disconnect();
  `);
  try {
    for (const scenario of ['SIGTERM', 'SIGKILL', 'report-fail', 'missing', 'wrong-kind', 'wrong-execution', 'timeout', 'valid']) {
      const row = await superviseWorker({ mode: 'probe', options: { kind: 'development', scenario }, modulePath,
        timeoutMs: scenario === 'timeout' ? 300 : 2000, graceMs: 200 });
      assert.equal(isWorkerSuccess(row), scenario === 'valid', scenario);
      if (scenario.startsWith('SIG')) { assert.equal(row.exitCode, null); assert.equal(row.signal, scenario); }
      if (scenario === 'report-fail') { assert.equal(row.reportReceived, true); assert.equal(row.exitCode, 7); }
      if (scenario === 'missing') assert.equal(row.reportReceived, false);
      if (scenario === 'timeout') { assert.equal(row.timedOut, true); assert.equal(row.signal, 'SIGKILL'); }
    }
    const shared = await superviseWorker({ mode: 'case', options: { consumers: ['development', 'signed'], scenario: 'timeout' }, modulePath, timeoutMs: 300, graceMs: 200 });
    assert.equal(shared.status, 'FAIL');
    assert.equal(shared.timedOut, true);
    assert.equal(shared.signal, 'SIGKILL', 'shared-process work is also supervised outside its event loop');
    const orphan = await superviseWorker({ mode: 'probe', options: { kind: 'development', scenario: 'orphan-pipe' }, modulePath, timeoutMs: 300, graceMs: 200 });
    assert.equal(orphan.status, 'FAIL');
    assert.equal(orphan.exitCode, 0, 'the leader exits successfully before its descendant');
    assert.equal(orphan.timedOut, true, 'inherited pipes must remain subject to the parent deadline');
    const { descendantPort } = JSON.parse(orphan.output.trim());
    assert.equal(await portIsReachable(descendantPort), false, 'the parent kills descendants even after the leader exits');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('network evidence rejects dependency HTTP errors, failed requests and startup console errors', async () => {
  const { EventEmitter } = await import('node:events');
  const { observeProbePage, isProbeSuccess } = await import('../scripts/t02/consumer-concurrency.mjs');
  for (const [name, payload] of [
    ['response', { url: () => 'http://127.0.0.1/node_modules/.vite/deps/react.js', status: () => 504, request: () => ({ method: () => 'GET' }) }],
    ['response', { url: () => 'http://127.0.0.1/src/entry.js', status: () => 500, request: () => ({ method: () => 'GET' }) }],
    ['response', { url: () => 'http://127.0.0.1/symgene/t02-signed/snapshot', status: () => 503, request: () => ({ method: () => 'GET' }) }],
    ['requestfailed', { url: () => 'http://127.0.0.1/src/entry.js', failure: () => ({ errorText: 'net::ERR_CONNECTION_RESET' }) }],
    ['pageerror', new Error('FICTIONAL_UNCAUGHT')],
    ['console', { type: () => 'error', text: () => 'FICTIONAL_STARTUP_ERROR', location: () => ({ url: 'http://127.0.0.1/src/entry.js' }) }],
  ]) {
    const page = new EventEmitter();
    const row = { status: 'PASS', complete: true, pid: process.pid, externalRequests: 0, pageErrors: [], consoleErrors: [], requestFailures: [], httpErrors: [], http504Count: 0,
      cachePolicy: 'per-instance-owned', serverClosed: true, browserClosed: true, ownedCacheRemoved: true, cleanupErrors: [], closedPorts: [{ port: 1, reachable: false }],
      timeline: ['start', 'ready', 'domcontentloaded', 'react-mount', 'snapshot', 'closed'].map(stage => ({ stage })) };
    observeProbePage(page, row); page.emit(name, payload);
    assert.equal(isProbeSuccess(row), false, name);
  }
});
