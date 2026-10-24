import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClosure, validateClosure, checkLegacyRuntime, checkLegacyRuntimeExecution } from '../scripts/security/legacy-runtime.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const closure = loadClosure(root);

const module = path => ({ path, imports: [], external: false });
const fakeGraph = rows => rows.sort((a, b) => a.path.localeCompare(b.path));

// R3: the reviewed closure is the primary production boundary. Relocation, re-export and
// alias attacks all surface as an unlisted first-party module; a swapped dependency
// surfaces as an unlisted package root.
test('closure rejects relocated, re-exported, aliased or renamed T02 capability modules', () => {
  for (const path of ['src/session-constants.js', 'src/gateway/session.js', 'lib/t02.js',
    'src/dev/t02-signed-session.js', 'vendor/t02/src/gateway.mjs', 'content-packs/x.mjs',
    'src/content/adapter.js']) {
    assert.throws(() => validateClosure(fakeGraph([module('src/main.jsx'), module(path)]), closure),
      { code: 'PRODUCTION_MODULE_OUTSIDE_REVIEWED_CLOSURE' }, path);
  }
});

test('closure rejects unlisted third-party packages and unknown virtual modules', () => {
  assert.throws(() => validateClosure(fakeGraph([module('src/main.jsx'), module('node_modules/attacker-pack/index.mjs')]), closure),
    { code: 'PRODUCTION_MODULE_OUTSIDE_REVIEWED_CLOSURE' });
  assert.throws(() => validateClosure(fakeGraph([module('src/main.jsx'), module('node_modules/lucide-react/dist/esm/deep/icon.mjs'),
    module('node_modules/@scope/newpkg/index.mjs')]), closure),
    { code: 'PRODUCTION_MODULE_OUTSIDE_REVIEWED_CLOSURE' });
  assert.throws(() => validateClosure(fakeGraph([module('src/main.jsx'), module('virtual:evil/inject.js')]), closure),
    { code: 'PRODUCTION_MODULE_OUTSIDE_REVIEWED_CLOSURE' });
  assert.doesNotThrow(() => validateClosure(fakeGraph([module('src/main.jsx'), module('node_modules/react/index.js')]), closure));
});

test('closure requires exact set equality: removing or renaming a legitimate module needs a reviewed update', () => {
  const real = closure.firstPartyModules;
  assert.throws(() => validateClosure(fakeGraph(real.filter(p => p !== 'src/search.js').map(module)), closure),
    { code: 'PRODUCTION_CLOSURE_MEMBER_MISSING' });
  const renamed = real.map(p => p === 'src/search.js' ? 'src/search-renamed.js' : p);
  assert.throws(() => validateClosure(fakeGraph(renamed.map(module)), closure),
    { code: 'PRODUCTION_MODULE_OUTSIDE_REVIEWED_CLOSURE' });
  assert.doesNotThrow(() => validateClosure(fakeGraph(real.map(module)), closure));
});

// The capability marker list must track the real T02 session contracts, not a stale copy:
// the constants are read from src/dev and required to be covered by the reviewed closure.
test('capability markers track the live T02 contract constants', () => {
  const session = readFileSync(join(root, 'src/dev/t02-signed-session.js'), 'utf8');
  const dev = readFileSync(join(root, 'src/dev/t02-session.js'), 'utf8');
  const live = [session.match(/export const SIGNED_MARKER = '([^']+)'/)?.[1],
    session.match(/export const SIGNED_PATH = '([^']+)'/)?.[1],
    session.match(/export const SIGNED_STORAGE_PREFIX = '([^']+)'/)?.[1],
    dev.match(/export const DEVELOPMENT_MARKER = '([^']+)'/)?.[1],
    dev.match(/export const DEVELOPMENT_PATH = '([^']+)'/)?.[1]];
  for (const marker of live) {
    assert.ok(marker, 'T02 contract constant not found in src/dev');
    assert.ok(closure.forbiddenCapabilityMarkers.includes(marker), `closure must forbid live marker ${marker}`);
  }
});

test('closure drift between build evidence and the current closure file is rejected', () => {
  const copy = mkdtempSync(join(tmpdir(), 'symgen-closure-'));
  try {
    for (const entry of ['scripts', 'src', 'vendor', 'package.json', 'package-lock.json', 'legacy-content.lock',
      'content-pack.lock', 'index.html', 'vite.config.js']) {
      cpSync(join(root, entry), join(copy, entry), { recursive: true });
    }
    // Simulate evidence produced against a different closure: edit the closure file now
    // without rebuilding. source drift and closure drift must both fail.
    const closurePath = join(copy, 'scripts/security/production-closure.json');
    const parsed = JSON.parse(readFileSync(closurePath, 'utf8'));
    writeFileSync(closurePath, JSON.stringify({ ...parsed, allowedPackages: [...parsed.allowedPackages, 'attacker-pack'] }));
    assert.throws(() => checkLegacyRuntime(copy, { distDir: join(root, 'dist') }),
      error => ['PRODUCTION_CLOSURE_DRIFT', 'PRODUCTION_SOURCE_DRIFT'].includes(error.code));
  } finally { rmSync(copy, { recursive: true, force: true }); }
});

// R6: a forged browser receipt that carries the correct digests can satisfy
// checkLegacyRuntimeExecution in isolation, but no CI or deployment path consumes it:
// verify-production-runtime always deletes and regenerates the receipt BEFORE
// production-gate reads it, and a receipt bound to a foreign digest is rejected outright.
test('forged receipts cannot reach the deployment gate: verify always precedes and regenerates', () => {
  const receiptPath = join(root, 'dist/.symgene-runtime-browser.json');
  const original = readFileSync(receiptPath, 'utf8');
  try {
    // A receipt bound to a foreign build digest is rejected outright:
    const forged = { ...JSON.parse(original), artifactDigest: '0'.repeat(64), status: 'LEGACY_RUNTIME_EXECUTED' };
    writeFileSync(receiptPath, JSON.stringify(forged));
    assert.throws(() => checkLegacyRuntimeExecution(root), { code: 'PRODUCTION_RUNTIME_EXECUTION_REJECTED' });
    // A receipt with fully forged FIELD values (claims of zero errors, unauthorized deploy etc.) too:
    const claimed = { ...JSON.parse(original), productionDeployment: 'authorized', medicalApproval: 'approved', t02Requests: 5 };
    writeFileSync(receiptPath, JSON.stringify(claimed));
    assert.throws(() => checkLegacyRuntimeExecution(root), { code: 'PRODUCTION_RUNTIME_EXECUTION_REJECTED' });
    // The remaining risk — a byte-perfect forgery with correct digests — is closed by
    // ordering: the gate is only ever reachable after verify-production-runtime deleted
    // and regenerated the receipt in the same job. Lock the ordering contract:
    writeFileSync(receiptPath, JSON.stringify(JSON.parse(original)));
    const deploy = readFileSync(join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
    const verify = deploy.indexOf('node scripts/security/verify-production-runtime.mjs');
    const gateStep = deploy.indexOf('node scripts/security/production-gate.mjs');
    const rmFirst = readFileSync(join(root, 'scripts/security/verify-production-runtime.mjs'), 'utf8')
      .indexOf("rmSync(resolve(distDir, '.symgene-runtime-browser.json')");
    assert.ok(verify >= 0 && gateStep > verify, 'production-gate must run after verify-production-runtime');
    assert.ok(rmFirst >= 0, 'verify-production-runtime must delete any pre-existing receipt before executing');
  } finally { writeFileSync(receiptPath, original); }
});
