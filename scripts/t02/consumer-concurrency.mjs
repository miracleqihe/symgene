import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { freemem, loadavg, tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { startDevelopmentConsumer } from './dev-consumer.mjs';
import { startSignedConsumer } from './signed-consumer.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const fail = (code) => { throw Object.assign(new Error(code), { code }); };

/** Bounded Chromium probe. All content and publisher identities are synthetic. */
export async function probeConsumer({ kind, producerRoot, cacheDir, port = 0, onEvent = () => {} } = {}) {
  if (!['development', 'signed'].includes(kind)) fail('T02_PROBE_KIND_INVALID');
  const started = performance.now();
  const timeline = [];
  const event = (stage, detail = {}) => {
    const row = { kind, stage, elapsedMs: Math.round(performance.now() - started), ...detail };
    timeline.push(row); onEvent(row);
  };
  let browser, server, gateway, fixture, runtimeRoot;
  const ownedPorts = [];
  const result = { kind, status: 'FAIL', cachePolicy: cacheDir === undefined ? 'per-instance-owned' : 'explicit-caller-owned', externalRequests: 0, pageErrors: [], timeline };
  const interrupted = () => { void browser?.close(); };
  process.once('SIGTERM', interrupted);
  try {
    event('start', { pid: process.pid, loadavg: loadavg(), freeMemory: freemem() });
    if (kind === 'signed') {
      if (!isAbsolute(producerRoot ?? '')) fail('T02_PROBE_PRODUCER_REQUIRED');
      const { createReleaseTestFixture } = await import(pathToFileURL(join(producerRoot, 'src/release-test-fixture.mjs')));
      const { startReleaseGateway } = await import(pathToFileURL(join(producerRoot, 'src/release-gateway.mjs')));
      runtimeRoot = mkdtempSync(join(tmpdir(), 'symgene-t02-probe-'));
      fixture = await createReleaseTestFixture({ root: runtimeRoot });
      gateway = await startReleaseGateway({ runtime: fixture.runtime });
      ownedPorts.push(Number(new URL(gateway.url).port), Number(new URL(fixture.checkpointURL).port));
      server = await startSignedConsumer({ enabled: true, port, cacheDir, gatewayURL: gateway.url,
        versions: fixture.versions, candidateVersion: fixture.candidateVersion });
    } else server = await startDevelopmentConsumer({ enabled: true, port, cacheDir });
    ownedPorts.push(server.app.httpServer.address().port);
    event('ready', { port: server.app.httpServer.address().port, cacheDir: server.app.config.cacheDir });
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
    const origin = new URL(server.url).origin;
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== origin) { result.externalRequests++; return route.abort('blockedbyclient'); }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => { result.pageErrors.push(error.message); event('pageerror', { message: error.message }); });
    page.on('console', message => { if (message.type() === 'error') event('console-error', { message: message.text() }); });
    page.on('requestfailed', request => event('requestfailed', { path: new URL(request.url()).pathname, message: request.failure()?.errorText }));
    page.on('response', response => {
      const pathname = new URL(response.url()).pathname;
      if (response.status() >= 400 || /\/(?:configuration|bootstrap|snapshot)$/.test(pathname)) event('response', { path: pathname, status: response.status() });
    });
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    event('domcontentloaded');
    const testId = kind === 'signed' ? 'signed-consumer-state' : 'consumer-state';
    await page.getByTestId(testId).waitFor({ state: 'attached', timeout: 15000 });
    event('react-mount');
    if (kind === 'signed') {
      await page.getByRole('button', { name: '签名采用所选测试版本', exact: true }).click();
      await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid=signed-consumer-state]').textContent).fresh === true, undefined, { timeout: 15000 });
    } else await page.getByRole('button', { name: '注入虚构可信状态', exact: true }).click();
    const state = JSON.parse(await page.getByTestId(testId).textContent());
    if (!state.fresh || state.counts.disorders !== 1) fail('T02_PROBE_SNAPSHOT_INVALID');
    if (result.externalRequests || result.pageErrors.length) fail('T02_PROBE_BROWSER_ERROR');
    event('snapshot', { fresh: state.fresh, sequence: state.sequence });
    result.status = 'PASS';
  } catch (error) {
    result.error = { name: error.name, code: error.code, message: error.message };
    event('failure', result.error);
  } finally {
    // Always close every resource, even when an earlier close rejects.
    const closing = [() => browser?.close(), () => server?.app.close(), () => gateway?.close(), () => fixture?.close()];
    result.cleanupErrors = [];
    for (const close of closing) try { await close(); } catch (error) { result.cleanupErrors.push(error.message); }
    process.off('SIGTERM', interrupted);
    result.serverClosed = !server || !server.app.httpServer.listening;
    result.browserClosed = !browser || !browser.isConnected();
    result.closedPorts = await Promise.all(ownedPorts.map(port => new Promise(resolve => {
      const socket = createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve({ port, reachable: true }); });
      socket.once('error', () => resolve({ port, reachable: false }));
      socket.setTimeout(1000, () => { socket.destroy(); resolve({ port, reachable: true }); });
    })));
    try { if (runtimeRoot) rmSync(runtimeRoot, { recursive: true, force: true }); }
    catch (error) { result.cleanupErrors.push(error.message); }
    result.ownedCacheRemoved = cacheDir !== undefined || !server ? null : !existsSync(server.app.config.cacheDir);
    if (!result.serverClosed || !result.browserClosed || result.ownedCacheRemoved === false || result.cleanupErrors.length || result.closedPorts.some(port => port.reachable)) result.status = 'FAIL';
    event('closed', { serverClosed: result.serverClosed, browserClosed: result.browserClosed, ownedCacheRemoved: result.ownedCacheRemoved, ports: result.closedPorts, cleanupErrors: result.cleanupErrors });
    result.durationMs = Math.round(performance.now() - started);
  }
  return result;
}

export async function runProbeChild(options) {
  const child = fork(fileURLToPath(import.meta.url), ['--worker'], { execArgv: [],
    env: { ...process.env, SYM_T02_PROBE_OPTIONS: JSON.stringify(options) }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let report;
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-16000); });
  child.on('message', message => { report = message; });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 55000);
  const escalation = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 59000);
  const [exitCode, signal] = await once(child, 'exit');
  clearTimeout(timer); clearTimeout(escalation);
  return { ...(report ?? { kind: options.kind, status: 'FAIL', error: { code: 'T02_PROBE_CHILD_NO_REPORT' } }), childPid: child.pid, exitCode, signal, timedOut, output };
}

/** Bounded cold/warm and per-instance comparisons. Never touches production. */
export async function runConcurrencyMatrix({ producerRoot, evidenceDir, rounds = 2 } = {}) {
  if (process.versions.node.split('.')[0] !== '22') fail('T02_PROBE_NODE22_REQUIRED');
  if (!isAbsolute(producerRoot ?? '') || !isAbsolute(evidenceDir ?? '') || !Number.isInteger(rounds) || rounds < 1 || rounds > 5) fail('T02_PROBE_ARGUMENT_INVALID');
  mkdirSync(evidenceDir, { recursive: true });
  const ownedCacheRoot = mkdtempSync(join(evidenceDir, 'vite-cache-'));
  const configurations = [
    { order: 'sequential', processes: 'shared', cache: 'isolated', ports: 'ephemeral' },
    { order: 'parallel', processes: 'shared', cache: 'isolated', ports: 'ephemeral' },
    { order: 'parallel', processes: 'shared', cache: 'default', ports: 'ephemeral' },
    { order: 'parallel', processes: 'separate', cache: 'isolated', ports: 'ephemeral' },
    { order: 'parallel', processes: 'separate', cache: 'default', ports: 'fixed' },
    { order: 'parallel', processes: 'shared', cache: 'default', ports: 'ephemeral', consumers: ['signed', 'signed'] },
    { order: 'parallel', processes: 'shared', cache: 'default', ports: 'ephemeral', consumers: ['development', 'development'] },
  ];
  const cases = [];
  for (const [index, configuration] of configurations.entries()) for (let round = 0; round < rounds; round++) {
    // A new directory is genuinely cold. The second run reuses those bytes.
    const cacheBase = join(ownedCacheRoot, String(index), String(round));
    for (const temperature of configuration.cache === 'default' ? ['fresh-instance'] : ['cold', 'warm']) {
      const id = `${index}-${round}-${temperature}`;
      const optionsFor = kind => ({ kind, producerRoot,
        cacheDir: configuration.cache === 'default' ? undefined : join(cacheBase, kind),
        port: configuration.ports === 'fixed' ? (kind === 'development' ? 43181 : 43182) : 0 });
      const execute = kind => configuration.processes === 'separate' ? runProbeChild(optionsFor(kind)) : probeConsumer(optionsFor(kind));
      const results = [];
      const consumers = configuration.consumers ?? ['development', 'signed'];
      if (configuration.order === 'sequential') for (const kind of consumers) results.push(await execute(kind));
      else results.push(...await Promise.all(consumers.map(execute)));
      const record = { id, configuration, temperature, round, results, status: results.every(row => row.status === 'PASS' && !row.timedOut && (row.exitCode ?? 0) === 0) ? 'PASS' : 'FAIL' };
      cases.push(record);
      writeFileSync(join(evidenceDir, `case-${id}.json`), JSON.stringify(record, null, 2) + '\n');
      console.log(JSON.stringify({ id, ...configuration, temperature, status: record.status, durations: results.map(row => row.durationMs) }));
    }
  }
  const report = { status: cases.every(row => row.status === 'PASS') ? 'LOCAL TEST PASS' : 'FAIL', node: process.version,
    root: ROOT, production: 'BLOCKED', scope: 'synthetic-loopback-only',
    implementation: ['scripts/t02/consumer-concurrency.mjs', 'scripts/t02/consumer-vite-server.mjs', 'scripts/t02/dev-consumer.mjs', 'scripts/t02/signed-consumer.mjs', 'package-lock.json']
      .map(file => ({ file, sha256: createHash('sha256').update(readFileSync(join(ROOT, file))).digest('hex') })), cases };
  writeFileSync(join(evidenceDir, 'matrix.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--worker') {
    const result = await probeConsumer(JSON.parse(process.env.SYM_T02_PROBE_OPTIONS));
    process.send?.(result);
    process.disconnect?.();
    process.exitCode = result.status === 'PASS' ? 0 : 1;
  } else {
    try {
      const args = process.argv.slice(2);
      if (args.length !== 4 || args[0] !== '--producer-root' || args[2] !== '--evidence-dir') fail('T02_PROBE_ARGUMENT_INVALID');
      const report = await runConcurrencyMatrix({ producerRoot: args[1], evidenceDir: args[3] });
      process.exitCode = report.status === 'LOCAL TEST PASS' ? 0 : 1;
    } catch (error) { console.error(JSON.stringify({ status: 'FAIL', code: error.code ?? error.name })); process.exitCode = 1; }
  }
}
