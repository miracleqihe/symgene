import { execFileSync, fork } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
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
export async function probeConsumer({ kind, producerRoot, cacheDir, port = 0, onEvent = () => {}, beforeNavigate, fixtureMode = 'producer' } = {}) {
  if (!['development', 'signed'].includes(kind)) fail('T02_PROBE_KIND_INVALID');
  const started = performance.now();
  const timeline = [];
  const event = (stage, detail = {}) => {
    const row = { kind, stage, elapsedMs: Math.round(performance.now() - started), ...detail };
    timeline.push(row); onEvent(row);
  };
  let browser, server, gateway, fixture, runtimeRoot;
  const ownedPorts = [];
  const result = { kind, status: 'FAIL', complete: false, pid: process.pid, cachePolicy: cacheDir === undefined ? 'per-instance-owned' : 'explicit-caller-owned', externalRequests: 0, pageErrors: [], consoleErrors: [], requestFailures: [], httpErrors: [], http504Count: 0, timeline };
  const interrupted = () => { void browser?.close(); };
  process.once('SIGTERM', interrupted);
  try {
    event('start', { pid: process.pid, loadavg: loadavg(), freeMemory: freemem() });
    if (kind === 'signed') {
      if (!isAbsolute(producerRoot ?? '')) fail('T02_PROBE_PRODUCER_REQUIRED');
      if (!['producer', 'website-synthetic'].includes(fixtureMode)) fail('T02_PROBE_FIXTURE_INVALID');
      const { createReleaseTestFixture } = await import(fixtureMode === 'website-synthetic'
        ? new URL('../../tests/helpers/concurrency-gateway.mjs', import.meta.url) : pathToFileURL(join(producerRoot, 'src/release-test-fixture.mjs')));
      const { startReleaseGateway } = await import(fixtureMode === 'website-synthetic'
        ? new URL('../../tests/helpers/concurrency-gateway.mjs', import.meta.url) : pathToFileURL(join(producerRoot, 'src/release-gateway.mjs')));
      runtimeRoot = mkdtempSync(join(tmpdir(), 'symgene-t02-probe-'));
      fixture = await createReleaseTestFixture({ root: runtimeRoot });
      gateway = await startReleaseGateway({ runtime: fixture.runtime });
      // This matrix measures startup with an already adopted fixture. Exercise
      // the real gateway's existing adoption contract before browser reads;
      // rejection/withdrawal/rollback drills remain in signed-consumer-browser.
      const target = new URL('/snapshot', gateway.url);
      target.search = new URLSearchParams({ version: fixture.candidateVersion, action: 'adopt' }).toString();
      const preparation = await fetch(target, { signal: AbortSignal.timeout(3000) });
      if (!preparation.ok || (await preparation.json()).available !== true) fail('T02_PROBE_FIXTURE_ADOPTION_FAILED');
      event('fixture-adopted', { fixtureMode });
      ownedPorts.push(Number(new URL(gateway.url).port));
      if (fixture.checkpointURL) ownedPorts.push(Number(new URL(fixture.checkpointURL).port));
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
    observeProbePage(page, result, event);
    await beforeNavigate?.({ page, origin });
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    event('domcontentloaded');
    const testId = kind === 'signed' ? 'signed-consumer-state' : 'consumer-state';
    await page.getByTestId(testId).waitFor({ state: 'attached', timeout: 15000 });
    event('react-mount');
    if (kind === 'signed') {
      await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid=signed-consumer-state]').textContent).fresh === true, undefined, { timeout: 15000 });
      await page.getByRole('button', { name: '签名采用所选测试版本', exact: true }).click();
      await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid=signed-consumer-state]').textContent).fresh === true, undefined, { timeout: 15000 });
    } else await page.getByRole('button', { name: '注入虚构可信状态', exact: true }).click();
    const state = JSON.parse(await page.getByTestId(testId).textContent());
    if (!state.fresh || state.counts.disorders !== 1) fail('T02_PROBE_SNAPSHOT_INVALID');
    event('snapshot', { fresh: state.fresh, sequence: state.sequence });
    if (hasBrowserErrors(result)) fail('T02_PROBE_BROWSER_ERROR');
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
    if (hasBrowserErrors(result)) result.status = 'FAIL';
    result.complete = true;
    result.durationMs = Math.round(performance.now() - started);
  }
  return result;
}

/** Startup probes have no expected HTTP failures. Fault-drill runners own their
 * separate, explicit 503 assertions; optimizer/module errors are never exempt. */
export function observeProbePage(page, result, event = () => {}) {
  page.on('pageerror', error => { result.pageErrors.push(error.message); event('pageerror', { message: error.message }); });
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const row = { message: message.text(), location: message.location() };
    result.consoleErrors.push(row); event('console-error', row);
  });
  page.on('requestfailed', request => {
    const row = { path: new URL(request.url()).pathname, message: request.failure()?.errorText };
    result.requestFailures.push(row); event('requestfailed', row);
  });
  page.on('response', response => {
    const row = { path: new URL(response.url()).pathname, status: response.status() };
    if (row.status >= 400) result.httpErrors.push(row);
    if (row.status === 504) result.http504Count++;
    if (row.status >= 400 || /\/(?:configuration|bootstrap|snapshot)$/.test(row.path)) event('response', row);
  });
}
const hasBrowserErrors = row => row.externalRequests !== 0 || row.http504Count !== 0
  || ['pageErrors', 'consoleErrors', 'requestFailures', 'httpErrors'].some(key => row[key]?.length !== 0);
export const isProbeSuccess = row => row?.status === 'PASS' && row.complete === true
  && Number.isInteger(row.pid) && !hasBrowserErrors(row)
  && row.serverClosed === true && row.browserClosed === true
  && (row.cachePolicy === 'per-instance-owned' && row.ownedCacheRemoved === true || row.cachePolicy === 'explicit-caller-owned' && row.ownedCacheRemoved === null)
  && Array.isArray(row.cleanupErrors) && row.cleanupErrors.length === 0
  && Array.isArray(row.closedPorts) && row.closedPorts.length > 0 && row.closedPorts.every(port => port.reachable === false)
  && ['start', 'ready', 'domcontentloaded', 'react-mount', 'snapshot', 'closed'].every(stage => row.timeline?.some(event => event.stage === stage));
export const isWorkerSuccess = row => row?.exitCode === 0 && row.signal === null && row.timedOut === false
  && row.reportReceived === true && row.reportValid === true && row.status === 'PASS';

/** The parent owns the deadline, even when Vite/Chromium/fixture cleanup hangs.
 * A process group includes descendants on the supported Linux/macOS runners. */
export async function superviseWorker({ mode, options, modulePath = fileURLToPath(import.meta.url), timeoutMs = 55000, graceMs = 4000 } = {}) {
  if (!['probe', 'case'].includes(mode) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000
    || !Number.isInteger(graceMs) || graceMs < 1 || graceMs > 5000) fail('T02_PROBE_ARGUMENT_INVALID');
  const executionId = randomUUID();
  const child = fork(modulePath, [mode === 'case' ? '--case-worker' : '--worker'], { execArgv: [], detached: true,
    env: { ...process.env, SYM_T02_PROBE_OPTIONS: JSON.stringify(options), SYM_T02_EXECUTION_ID: executionId }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let report, reports = 0, output = '', timedOut = false, spawnError;
  let exitObserved = false, closeObserved = false, supervisorDeadlineExceeded = false;
  let observedExitCode = null, observedSignal = null;
  const progress = [];
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-16000); });
  child.on('message', message => {
    if (message?.type === 'progress' && message.executionId === executionId && message.pid === child.pid) progress.push(message.event);
    else { reports++; report = message; }
  });
  const killGroup = signal => {
    if (!Number.isInteger(child.pid)) return;
    try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') child.kill(signal); }
  };
  const timer = setTimeout(() => { timedOut = true; killGroup('SIGTERM'); }, timeoutMs);
  const escalation = setTimeout(() => killGroup('SIGKILL'), timeoutMs + graceMs);
  let absoluteDeadline;
  const [exitCode, signal] = await new Promise(resolve => {
    child.once('error', error => { spawnError = error.message; });
    child.once('exit', (code, signal) => { exitObserved = true; observedExitCode = code; observedSignal = signal; });
    child.once('close', (code, signal) => { closeObserved = true; resolve([code, signal]); });
    // An exited leader can leave inherited pipes/IPC open in descendants. The
    // deadline supervises the entire group and parent handles, not exitCode.
    absoluteDeadline = setTimeout(() => {
      supervisorDeadlineExceeded = true; timedOut = true; killGroup('SIGKILL');
      child.stdout.destroy(); child.stderr.destroy();
      if (child.connected) child.disconnect();
      child.unref();
      resolve([observedExitCode, observedSignal]);
    }, timeoutMs + graceMs + 1000);
  });
  clearTimeout(timer); clearTimeout(escalation); clearTimeout(absoluteDeadline);
  // A worker that exits before cleanup may have live descendants. Terminate its
  // group and retain the incomplete report; never turn that cleanup into PASS.
  if (exitCode !== 0 || signal !== null || timedOut) killGroup('SIGKILL');
  const result = report?.result;
  const expected = mode === 'probe' ? [options.kind] : options.consumers;
  const rows = mode === 'probe' ? [result] : result?.results;
  const reportValid = reports === 1 && report?.type === 'complete' && report.version === 1
    && report.executionId === executionId && report.pid === child.pid && report.mode === mode
    && Array.isArray(rows) && rows.length === expected.length
    && rows.every((row, index) => row?.kind === expected[index] && row.pid === child.pid && isProbeSuccess(row));
  if (!reportValid) killGroup('SIGKILL');
  const lifecycle = { executionId, childPid: child.pid, exitCode, signal, timedOut, exitObserved, closeObserved, supervisorDeadlineExceeded, reportReceived: reports > 0,
    reportValid, reportCount: reports, output, progress };
  const answer = { ...(result ?? {}), ...lifecycle, status: 'PASS' };
  if (!isWorkerSuccess(answer)) {
    answer.status = 'FAIL';
    answer.error ??= { code: timedOut ? 'T02_PROBE_CHILD_TIMEOUT' : !reports ? 'T02_PROBE_CHILD_NO_REPORT' : !reportValid ? 'T02_PROBE_CHILD_REPORT_INVALID' : 'T02_PROBE_CHILD_EXIT_FAILED', ...(spawnError ? { message: spawnError } : {}) };
  }
  return answer;
}
export const runProbeChild = options => superviseWorker({ mode: 'probe', options });

const CONFIGURATIONS = [
  { order: 'sequential', processes: 'shared', cache: 'isolated', ports: 'ephemeral' },
  { order: 'parallel', processes: 'shared', cache: 'isolated', ports: 'ephemeral' },
  { order: 'parallel', processes: 'shared', cache: 'default', ports: 'ephemeral' },
  { order: 'parallel', processes: 'separate', cache: 'isolated', ports: 'ephemeral' },
  { order: 'parallel', processes: 'separate', cache: 'default', ports: 'fixed' },
  { order: 'parallel', processes: 'shared', cache: 'default', ports: 'ephemeral', consumers: ['signed', 'signed'] },
  { order: 'parallel', processes: 'shared', cache: 'default', ports: 'ephemeral', consumers: ['development', 'development'] },
];

/** Full local cold/warm experiment; CI always runs all three simultaneous pairs. */
export async function runConcurrencyMatrix({ producerRoot, evidenceDir, rounds = 2, profile = 'full' } = {}) {
  if (process.versions.node.split('.')[0] !== '22') fail('T02_PROBE_NODE22_REQUIRED');
  if (!isAbsolute(producerRoot ?? '') || !isAbsolute(evidenceDir ?? '') || !Number.isInteger(rounds) || rounds < 1 || rounds > 5
    || !['full', 'ci'].includes(profile)) fail('T02_PROBE_ARGUMENT_INVALID');
  mkdirSync(evidenceDir, { recursive: true });
  const ownedCacheRoot = mkdtempSync(join(evidenceDir, 'vite-cache-'));
  const configurations = profile === 'ci' ? [CONFIGURATIONS[4],
    { ...CONFIGURATIONS[5], processes: 'separate' }, { ...CONFIGURATIONS[6], processes: 'separate' }] : CONFIGURATIONS;
  const cases = [];
  for (const [index, configuration] of configurations.entries()) for (let round = 0; round < rounds; round++) {
    const cacheBase = join(ownedCacheRoot, String(index), String(round));
    for (const temperature of configuration.cache === 'default' ? ['fresh-instance'] : ['cold', 'warm']) {
      const id = `${index}-${round}-${temperature}`;
      const consumers = configuration.consumers ?? ['development', 'signed'];
      const optionsFor = (kind, instance) => ({ kind, producerRoot, fixtureMode: profile === 'ci' ? 'website-synthetic' : 'producer',
        cacheDir: configuration.cache === 'default' ? undefined : join(cacheBase, `${instance}-${kind}`),
        port: configuration.ports === 'fixed' ? (kind === 'development' ? 43181 : 43182) : 0 });
      const probes = consumers.map(optionsFor);
      let results, workers;
      if (configuration.processes === 'shared') {
        const worker = await superviseWorker({ mode: 'case', options: { consumers, probes, order: configuration.order }, timeoutMs: 110000 });
        results = worker.results ?? []; workers = [worker];
      } else {
        results = await Promise.all(probes.map(runProbeChild)); workers = results;
      }
      const cacheDirs = results.map(row => row.timeline?.find(event => event.stage === 'ready')?.cacheDir);
      const independentCaches = cacheDirs.length === consumers.length && cacheDirs.every(Boolean) && new Set(cacheDirs).size === consumers.length;
      const record = { id, configuration, temperature, round, results, workers, independentCaches,
        status: results.length === consumers.length && results.every(isProbeSuccess) && workers.every(isWorkerSuccess) && independentCaches ? 'PASS' : 'FAIL' };
      cases.push(record);
      writeFileSync(join(evidenceDir, `case-${id}.json`), JSON.stringify(record, null, 2) + '\n');
      console.log(JSON.stringify({ id, ...configuration, temperature, status: record.status, durations: results.map(row => row.durationMs) }));
    }
  }
  const rows = cases.flatMap(row => row.results);
  const errorStatistics = Object.fromEntries(['http504Count', 'httpErrors', 'consoleErrors', 'requestFailures', 'pageErrors', 'externalRequests', 'cleanupErrors']
    .map(key => [key, rows.reduce((sum, row) => sum + (Array.isArray(row[key]) ? row[key].length : row[key] ?? 0), 0)]));
  const cleanup = { probes: rows.length, completed: rows.filter(row => row.complete === true).length,
    closedPorts: rows.flatMap(row => row.closedPorts ?? []), workers: cases.flatMap(row => row.workers).map(({ executionId, childPid, exitCode, signal, timedOut, reportReceived, reportValid, exitObserved, closeObserved, supervisorDeadlineExceeded }) => ({ executionId, childPid, exitCode, signal, timedOut, reportReceived, reportValid, exitObserved, closeObserved, supervisorDeadlineExceeded })) };
  const ci = { runId: process.env.GITHUB_RUN_ID ?? null, runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    sourceHead: process.env.T02_SOURCE_HEAD ?? null, checkoutHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim() };
  const report = { ci, status: cases.length > 0 && cases.every(row => row.status === 'PASS') ? 'LOCAL TEST PASS' : 'FAIL', node: process.version,
    root: ROOT, profile, fixtureMode: profile === 'ci' ? 'website-synthetic-gateway-no-producer-signature-verification' : 'producer-signature-verification', production: 'BLOCKED', scope: 'synthetic-loopback-only', errorStatistics, cleanup,
    implementation: ['scripts/t02/consumer-concurrency.mjs', 'scripts/t02/consumer-vite-server.mjs', 'scripts/t02/dev-consumer.mjs', 'scripts/t02/signed-consumer.mjs', 'package-lock.json']
      .map(file => ({ file, sha256: createHash('sha256').update(readFileSync(join(ROOT, file))).digest('hex') })), cases };
  writeFileSync(join(evidenceDir, 'matrix.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(evidenceDir, 'error-statistics.json'), JSON.stringify(errorStatistics, null, 2) + '\n');
  writeFileSync(join(evidenceDir, 'cleanup.json'), JSON.stringify(cleanup, null, 2) + '\n');
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (['--worker', '--case-worker'].includes(process.argv[2])) {
    const mode = process.argv[2] === '--worker' ? 'probe' : 'case';
    const options = JSON.parse(process.env.SYM_T02_PROBE_OPTIONS);
    const onEvent = event => process.send?.({ type: 'progress', executionId: process.env.SYM_T02_EXECUTION_ID, pid: process.pid, event });
    let result;
    if (mode === 'probe') result = await probeConsumer({ ...options, onEvent });
    else {
      const results = [];
      if (options.order === 'sequential') for (const probe of options.probes) results.push(await probeConsumer({ ...probe, onEvent }));
      else results.push(...await Promise.all(options.probes.map(probe => probeConsumer({ ...probe, onEvent }))));
      result = { results, status: results.every(isProbeSuccess) ? 'PASS' : 'FAIL' };
    }
    await new Promise((resolve, reject) => process.send({ type: 'complete', version: 1, executionId: process.env.SYM_T02_EXECUTION_ID, pid: process.pid, mode, result }, error => error ? reject(error) : resolve()));
    process.disconnect();
    process.exitCode = result.status === 'PASS' ? 0 : 1;
  } else {
    try {
      const args = process.argv.slice(2);
      if (![4, 6].includes(args.length) || args[0] !== '--producer-root' || args[2] !== '--evidence-dir'
        || args.length === 6 && (args[4] !== '--profile' || args[5] !== 'ci')) fail('T02_PROBE_ARGUMENT_INVALID');
      const report = await runConcurrencyMatrix({ producerRoot: args[1], evidenceDir: args[3], ...(args.length === 6 ? { profile: 'ci', rounds: 1 } : {}) });
      process.exitCode = report.status === 'LOCAL TEST PASS' ? 0 : 1;
    } catch (error) { console.error(JSON.stringify({ status: 'FAIL', code: error.code ?? error.name })); process.exitCode = 1; }
  }
}
