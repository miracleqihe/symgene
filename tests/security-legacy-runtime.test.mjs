import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, cpSync, mkdirSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { checkLegacyRuntime } from '../scripts/security/legacy-runtime.mjs';
import { legacyReleaseEligibility, formalT02AdoptionAuthority } from '../scripts/security/policy.mjs';
import { productionGate } from '../scripts/security/production-gate.mjs';
import { assertLegacyProductionRuntime } from '../src/production-runtime.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const temp = realpathSync(mkdtempSync(join(tmpdir(), 'symgene-legacy-runtime-')));
const artifact = join(temp, 'built'), fixture = join(temp, 'fixture');
const context = () => ({ repository: 'miracleqihe/symgene', eventName: 'workflow_dispatch', ref: 'refs/heads/main',
  environment: 'github-pages', workflowRef: 'miracleqihe/symgene/.github/workflows/deploy-pages.yml@refs/heads/main',
  sha: 'a'.repeat(40), checkoutSha: 'a'.repeat(40), currentMainSha: 'a'.repeat(40), runId: 42, runAttempt: 2 });
const rejected = (fn, code) => assert.throws(fn, { code });
function mutate(path, change, check) {
  const target = resolve(fixture, path), original = readFileSync(target);
  try { writeFileSync(target, change(original.toString())); check(); }
  finally { writeFileSync(target, original); }
}
function build(root, outDir) {
  return spawnSync(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--base=./', '--outDir', outDir],
    { cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
}
before(() => {
  const result = build(ROOT, artifact); assert.ifError(result.error); assert.equal(result.status, 0, result.stdout + result.stderr);
  const evidence = JSON.parse(readFileSync(join(artifact, '.symgene-runtime.json')));
  const lock = JSON.parse(readFileSync(join(ROOT, 'legacy-content.lock')));
  const paths = new Set([...Object.keys(evidence.sources).filter(path => !path.startsWith('node_modules/')),
    ...lock.files.map(row => row.path), 'scripts/security/policy.mjs', 'scripts/security/production-gate.mjs',
    'src/dev/t02-signed-session.js', 'src/dev/t02-session.js', 'src/dev/t02-storage.js', 'src/content/adapter.js']);
  for (const path of paths) {
    const target = resolve(fixture, path); mkdirSync(dirname(target), { recursive: true }); cpSync(resolve(ROOT, path), target);
  }
  for (const path of ['vendor/t02', 'src', 'scripts/t02']) cpSync(resolve(ROOT, path), resolve(fixture, path), { recursive: true });
  symlinkSync(resolve(ROOT, 'node_modules'), resolve(fixture, 'node_modules'), 'dir');
  cpSync(artifact, resolve(fixture, 'dist'), { recursive: true });
});
after(() => rmSync(temp, { recursive: true, force: true }));

test('real legacy build verifies bytes and opt-in consumers but needs actual browser execution before eligibility', () => {
  const runtime = checkLegacyRuntime(fixture);
  assert.equal(runtime.status, 'LEGACY_RUNTIME_BUILD_VERIFIED');
  assert.equal(runtime.medicalApproval, 'not_asserted'); assert.equal(runtime.rightsApproval, 'not_asserted');
  rejected(() => legacyReleaseEligibility({ root: fixture }), 'PRODUCTION_RUNTIME_EXECUTION_MISSING');
  rejected(() => productionGate(context(), { root: fixture }), 'PRODUCTION_RUNTIME_EXECUTION_MISSING');
  for (const evidence of [null, { approved: true }, runtime, { formalT02Adoption: true, medicalApproval: 'approved' }]) {
    assert.equal(formalT02AdoptionAuthority(evidence).status, 'T02_FORMAL_ADOPTION_BLOCKED');
  }
});

test('fixed content and the locked verifier cannot drift', () => {
  mutate('src/content/knowledge.json', value => value + '\n', () => rejected(() => legacyReleaseEligibility({ root: fixture }), 'LEGACY_VENDOR_DRIFT'));
  mutate('vendor/local-content/legacy-snapshot.mjs', value => value + '\n', () => rejected(() => legacyReleaseEligibility({ root: fixture }), 'LEGACY_VERIFIER_DRIFT'));
  mutate('scripts/local-content/check-legacy.mjs', value => value + '\n', () => rejected(() => legacyReleaseEligibility({ root: fixture }), 'PRODUCTION_SOURCE_DRIFT'));
});

test('changing the lock cannot enable T02, and keeping the old lock cannot hide production entry adoption', () => {
  mutate('content-pack.lock', value => JSON.stringify({ ...JSON.parse(value), adoption: 'formal', scope: 'production' }),
    () => rejected(() => legacyReleaseEligibility({ root: fixture }), 'LEGACY_ADOPTION_CHANGED'));
  mutate('src/main.jsx', value => "import './dev/t02-signed-session.js';\n" + value,
    () => rejected(() => legacyReleaseEligibility({ root: fixture }), 'PRODUCTION_SOURCE_DRIFT'));
  mutate('src/production-runtime.json', value => JSON.stringify({ ...JSON.parse(value), signedGateway: 'http://127.0.0.1:4000/snapshot', formalT02Adoption: true }),
    () => rejected(() => legacyReleaseEligibility({ root: fixture }), 'PRODUCTION_RUNTIME_NOT_LEGACY'));
});

test('the actual production bundler rejects signed consumer imports and missing startup assertion', () => {
  mutate('src/main.jsx', value => "import './dev/t02-signed-session.js';\n" + value, () => {
    const result = build(fixture, join(temp, 'forbidden-build'));
    assert.notEqual(result.status, 0); assert.match(result.stdout + result.stderr, /PRODUCTION_T02_CAPABILITY_REJECTED/);
  });
  mutate('src/main.jsx', value => value.replace('if (import.meta.env.PROD) assertLegacyProductionRuntime();', ''), () => {
    const result = build(fixture, join(temp, 'no-startup-build'));
    assert.notEqual(result.status, 0); assert.match(result.stdout + result.stderr, /PRODUCTION_STARTUP_ASSERTION_MISSING/);
  });
});

test('changing production HTML entry, build output, output set or runtime evidence is rejected', () => {
  mutate('index.html', value => value.replace('/src/main.jsx', '/src/dev/t02-signed-consumer.jsx'),
    () => rejected(() => checkLegacyRuntime(fixture), 'PRODUCTION_ENTRY_REJECTED'));
  mutate('dist/index.html', value => value + '<!-- changed -->', () => rejected(() => checkLegacyRuntime(fixture), 'PRODUCTION_OUTPUT_DRIFT'));
  const extra = join(fixture, 'dist', 'unauthorized.js');
  try { writeFileSync(extra, 'throw new Error("fictional")'); rejected(() => checkLegacyRuntime(fixture), 'PRODUCTION_OUTPUT_SET_DRIFT'); }
  finally { rmSync(extra); }
  mutate('dist/.symgene-runtime.json', value => JSON.stringify({ ...JSON.parse(value), medicalApproval: 'approved' }),
    () => rejected(() => checkLegacyRuntime(fixture), 'PRODUCTION_RUNTIME_EVIDENCE_REJECTED'));
});

test('the executed startup assertion rejects all T02 runtime switches', () => {
  const config = JSON.parse(readFileSync(join(ROOT, 'src/production-runtime.json')));
  assert.equal(Object.isFrozen(assertLegacyProductionRuntime(config)), true);
  for (const override of [{ contentMode: 'formal' }, { signedGateway: 'http://127.0.0.1:4000' },
    { formalT02Adoption: true }, { legacySeed: 'content-packs/sim-4' }, { developmentConsumers: 'automatic' }]) {
    rejected(() => assertLegacyProductionRuntime({ ...config, ...override }), 'PRODUCTION_RUNTIME_NOT_LEGACY');
  }
});

test('production identity and CLI failures never become exit zero or successful outputs', () => {
  for (const override of [{ environment: 'alternate' }, { runId: 0 }, { runAttempt: 0 },
    { checkoutSha: 'b'.repeat(40) }, { ref: 'refs/heads/dev' }]) {
    assert.throws(() => productionGate({ ...context(), ...override }, { root: fixture }));
  }
  // The executable cases below use real Git checkouts rather than GIT_DIR
  // overrides, which must never redirect the deployed checkout verification.
});

test('production CLI rejects tracked/untracked dirt and cannot be redirected by cwd or Git environment', () => {
  const repository = join(temp, 'git-fixture'), caller = join(temp, 'clean-caller');
  const modulePaths = ['scripts/security/production-gate.mjs', 'scripts/security/policy.mjs',
    'scripts/security/legacy-runtime.mjs', 'scripts/local-content/check-legacy.mjs', 'vendor/local-content/legacy-snapshot.mjs'];
  const git = (directory, ...args) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'Fictional Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.org',
      GIT_COMMITTER_NAME: 'Fictional Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.org' } });
  for (const directory of [repository, caller]) {
    mkdirSync(directory, { recursive: true }); git(directory, 'init', '-q', '--initial-branch=fixture');
    writeFileSync(join(directory, '.gitignore'), 'dist/\npublic/teaching/\n');
    writeFileSync(join(directory, 'tracked.txt'), 'fictional baseline\n');
    if (directory === repository) for (const path of modulePaths) {
      const target = join(directory, path); mkdirSync(dirname(target), { recursive: true }); cpSync(join(ROOT, path), target);
    }
    git(directory, 'add', '--', '.gitignore', 'tracked.txt', ...(directory === repository ? modulePaths : []));
    git(directory, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'Fictional runtime gate fixture');
  }
  const head = git(repository, 'rev-parse', 'HEAD').trim(), output = join(temp, 'git-outputs');
  const env = { PATH: process.env.PATH, GITHUB_REPOSITORY: 'miracleqihe/symgene', GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main', EXPECTED_ENVIRONMENT: 'github-pages',
    GITHUB_WORKFLOW_REF: 'miracleqihe/symgene/.github/workflows/deploy-pages.yml@refs/heads/main',
    GITHUB_SHA: head, CURRENT_MAIN_SHA: head, GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '2', GITHUB_OUTPUT: output,
    GIT_DIR: join(caller, '.git'), GIT_WORK_TREE: caller, GIT_INDEX_FILE: join(caller, '.git/index') };
  const execute = (overrides = {}) => {
    writeFileSync(output, '');
    const result = spawnSync(process.execPath, [join(repository, 'scripts/security/production-gate.mjs')],
      { cwd: caller, env: { ...env, ...overrides }, encoding: 'utf8', timeout: 10_000 });
    assert.ifError(result.error); assert.equal(result.status, 1); assert.equal(readFileSync(output, 'utf8'), '');
    return JSON.parse(result.stderr.trim());
  };
  // A clean fixture reaches the next content check, proving ignored build files
  // and the unrelated caller checkout do not trigger or redirect the Git gate.
  mkdirSync(join(repository, 'dist'), { recursive: true }); writeFileSync(join(repository, 'dist/generated.txt'), 'fictional output');
  assert.equal(execute().code, 'ENOENT', 'the clean bound checkout reaches its intentionally absent legacy lock');
  for (const [override, code] of [[{ GITHUB_RUN_ATTEMPT: '0' }, 'DEPLOY_RUN_REJECTED'],
    [{ EXPECTED_ENVIRONMENT: 'alternate' }, 'DEPLOY_ENVIRONMENT_REJECTED'],
    [{ CURRENT_MAIN_SHA: 'b'.repeat(40) }, 'DEPLOY_SHA_MISMATCH']]) assert.equal(execute(override).code, code);
  writeFileSync(join(repository, 'tracked.txt'), 'fictional tracked drift\n');
  assert.equal(execute().code, 'PRODUCTION_CHECKOUT_DIRTY');
  assert.equal(execute({ GITHUB_RUN_ATTEMPT: '0' }).code, 'DEPLOY_RUN_REJECTED');
  git(repository, 'add', '--', 'tracked.txt');
  assert.equal(execute().code, 'PRODUCTION_CHECKOUT_DIRTY', 'staged source drift also rejects');
  git(repository, 'reset', '-q', 'HEAD', '--', 'tracked.txt');
  writeFileSync(join(repository, 'tracked.txt'), 'fictional baseline\n');
  writeFileSync(join(repository, 'untracked.txt'), 'fictional untracked drift\n');
  assert.equal(execute().code, 'PRODUCTION_CHECKOUT_DIRTY');
});
