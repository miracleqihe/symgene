#!/usr/bin/env node
// B9 deletion-failure drills - independently executable evidence driver.
//
// Target: PR #38 final, commit 9dfc403f89cfe539eb7584c87eddcbda6efe0a89,
// file scripts/t02/consumer-vite-server.mjs
// (sha256 c8110b64f4d081564ff8fbe0b3d8e91a9acd2e2ef42d9024f95fe7e5d0c000f4).
// The driver verifies BOTH the checkout commit and the module hash before
// running, so it cannot silently measure different code.
//
// Usage:
//   node b9-delete-failure-drill.mjs --root /path/to/symgene-checkout [--drill all|b9r1|b9r2a|b9r2b]
//
// Requirements:
//   - Node >= 22 (the product gate); the checkout must have `npm ci` done.
//   - macOS (darwin) for b9r2a/b9r2b: they use the APFS user-immutable flag
//     (`chflags uchg`), whose unlink(2) denial is a REAL kernel EPERM that
//     Node's fs.rm() retries (EPERM is in Node's retry set; EACCES is not).
//   - b9r1 is portable (read-only directory, EACCES on every POSIX system).
//
// What each drill proves (expectations are assertions, not decoration):
//   b9r1  A deletion failure outside Node's retry set surfaces immediately:
//         close() rejects with EACCES, cleanupIncomplete stays false (the
//         deadline-wrapped work succeeded), the endpoint is closed, the cache
//         is retained with deps/ already deleted (removal progressed, then
//         failed). No false "clean".
//   b9r2a A transient deletion failure is recovered by rm() retries: the flag
//         is cleared at +80ms while Node's linear backoff (10/20/30/40/50ms)
//         is still running; close() must RESOLVE and the cache must be FULLY
//         removed. Success requires at least one retry attempt after +80ms.
//   b9r2b A permanent deletion failure exhausts the retries: close() rejects
//         with EPERM, the cache is retained, the endpoint is closed.
//
// The EPERM in b9r2a/b9r2b comes from the kernel denying unlink(2) on a
// user-immutable file - a real filesystem failure, not a simulated JS error.
// What is scenario-simulated is only the flag timing, never the error itself.
//
// Exit code: 0 iff every selected drill matches its expectation; otherwise 1
// with a JSON mismatch report on stdout.
import { execFile, execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const MODULE_REL = 'scripts/t02/consumer-vite-server.mjs';
const MODULE_SHA256 = 'c8110b64f4d081564ff8fbe0b3d8e91a9acd2e2ef42d9024f95fe7e5d0c000f4';
const EXPECTED_COMMIT = '9dfc403f89cfe539eb7584c87eddcbda6efe0a89';

const args = process.argv.slice(2);
const rootArg = args.indexOf('--root');
const drillArg = args.indexOf('--drill');
if (rootArg === -1 || !args[rootArg + 1]) {
  console.error('usage: node b9-delete-failure-drill.mjs --root <symgene-checkout-at-9dfc403> [--drill all|b9r1|b9r2a|b9r2b]');
  process.exit(2);
}
const root = resolve(args[rootArg + 1]);
const drill = drillArg === -1 ? 'all' : args[drillArg + 1];

// --- preflight: pin the code under test -------------------------------------
let head = null;
try { head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
const modulePath = join(root, MODULE_REL);
let moduleSha = null;
try { moduleSha = createHash('sha256').update(execFileSync('cat', [modulePath])).digest('hex'); } catch {}
if (head !== EXPECTED_COMMIT || moduleSha !== MODULE_SHA256) {
  console.log(JSON.stringify({ status: 'PREFLIGHT-FAILED', expectedCommit: EXPECTED_COMMIT, actualCommit: head,
    expectedModuleSha256: MODULE_SHA256, actualModuleSha256: moduleSha,
    hint: 'check out 9dfc403f89cfe539eb7584c87eddcbda6efe0a89 and run npm ci in it' }));
  process.exit(1);
}
const { createConsumerViteServer } = await import(pathToFileURL(modulePath).href);
const chflags = (flag, file) => new Promise((resolvePromise, rejectPromise) =>
  execFile('chflags', [flag, file], { timeout: 5000 }, error => error ? rejectPromise(error) : resolvePromise()));
const reachable = port => new Promise(resolvePromise => {
  const socket = createConnection({ host: '127.0.0.1', port });
  socket.once('connect', () => { socket.destroy(); resolvePromise(true); });
  socket.once('error', () => resolvePromise(false));
  socket.setTimeout(1000, () => { socket.destroy(); resolvePromise(true); });
});
const listenEphemeral = app => new Promise((resolvePromise, rejectPromise) => {
  app.httpServer.once('error', rejectPromise);
  app.httpServer.listen(0, '127.0.0.1', resolvePromise);
});

// Start one product Vite server with its owned cache; optimizeDeps.include
// makes the optimizer do real work at startup (no browser needed), the same
// pattern as the repository's own tests/content-concurrency.test.mjs.
async function startServer() {
  const app = await createConsumerViteServer({ root, server: { host: '127.0.0.1', hmr: false },
    optimizeDeps: { holdUntilCrawlEnd: false, include: ['react'] } });
  await listenEphemeral(app);
  const cache = app.config.cacheDir;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const depsDir = join(cache, 'deps');
    if (existsSync(depsDir) && readdirSync(depsDir).some(row => { try { return statSync(join(depsDir, row)).isFile(); } catch { return false; } })) break;
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
  }
  return { app, cache, port: app.httpServer.address().port };
}
const pickDepsFile = cache => {
  const depsDir = join(cache, 'deps');
  const rows = readdirSync(depsDir).filter(row => { try { return statSync(join(depsDir, row)).isFile(); } catch { return false; } });
  return rows.length ? join(depsDir, rows[0]) : null;
};

async function drillB9r1() {
  const { app, cache, port } = await startServer();
  const locked = join(cache, 'faultlab-locked');
  mkdirSync(locked);
  writeFileSync(join(locked, 'x'), 'locked');
  chmodSync(locked, 0o555);
  let rejected = null;
  const started = performance.now();
  try { await app.close(); } catch (error) { rejected = { code: error.code ?? null, cleanupIncomplete: error.cleanupIncomplete === true }; }
  const closeMs = Math.round(performance.now() - started);
  const endpointOpen = await reachable(port);
  const cacheRetained = existsSync(cache);
  const depsStillPresent = existsSync(join(cache, 'deps'));
  try { chmodSync(locked, 0o755); } catch {}
  rmSync(cache, { recursive: true, force: true });
  const assertions = {
    closeRejectedWithNonRetryableError: rejected !== null && rejected.code === 'EACCES',
    notTheShutdownDeadlinePath: rejected !== null && !rejected.cleanupIncomplete,
    endpointClosed: !endpointOpen,
    cacheRetained: cacheRetained,
    removalProgressedBeforeFailing: cacheRetained && !depsStillPresent,
    fastFailure: closeMs < 5000,
  };
  return { drill: 'b9r1', assertions, closeMs, rejected, pass: Object.values(assertions).every(Boolean) };
}

async function drillFlagged(transient) {
  if (process.platform !== 'darwin') return { drill: transient ? 'b9r2a' : 'b9r2b', pass: false,
    skipped: 'requires darwin (APFS user-immutable flag via chflags)', platform: process.platform };
  const { app, cache, port } = await startServer();
  const target = pickDepsFile(cache);
  if (!target) { await app.close().catch(() => {}); return { drill: transient ? 'b9r2a' : 'b9r2b', pass: false, error: 'no optimized deps file found' }; }
  await chflags('uchg', target);
  if (transient) setTimeout(() => { chflags('nouchg', target).catch(() => {}); }, 80);
  let rejected = null;
  const started = performance.now();
  try { await app.close(); } catch (error) { rejected = { code: error.code ?? null, cleanupIncomplete: error.cleanupIncomplete === true }; }
  const closeMs = Math.round(performance.now() - started);
  const endpointOpen = await reachable(port);
  const cacheRetained = existsSync(cache);
  let cleanupOk = true;
  try { await chflags('nouchg', target); } catch {}
  try { rmSync(cache, { recursive: true, force: true }); } catch { cleanupOk = false; }
  const assertions = transient ? {
    closeResolved: rejected === null,
    cacheFullyRemoved: !cacheRetained,
    endpointClosed: !endpointOpen,
    retryWindowEvidence: closeMs >= 60, // backoff ~10+20+30+40+50ms; success requires attempts past the +80ms clearance
  } : {
    closeRejectedWithEperm: rejected !== null && rejected.code === 'EPERM',
    notTheShutdownDeadlinePath: rejected !== null && !rejected.cleanupIncomplete,
    endpointClosed: !endpointOpen,
    cacheRetained: cacheRetained,
  };
  return { drill: transient ? 'b9r2a' : 'b9r2b', assertions, closeMs, rejected, cacheRetained, pass: Object.values(assertions).every(Boolean) };
}

const drills = drill === 'all' ? ['b9r1', 'b9r2a', 'b9r2b'] : [drill];
const results = [];
for (const name of drills) {
  if (name === 'b9r1') results.push(await drillB9r1());
  else if (name === 'b9r2a') results.push(await drillFlagged(true));
  else if (name === 'b9r2b') results.push(await drillFlagged(false));
}
const report = { status: results.every(row => row.pass) ? 'ALL-DRILLS-PASS' : 'DRILL-FAILED',
  testedCommit: head, testedModuleSha256: moduleSha, node: process.version, platform: process.platform, results };
console.log(JSON.stringify(report, null, 2));
process.exit(report.status === 'ALL-DRILLS-PASS' ? 0 : 1);
