import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, cpSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { ACTIONS_APP_ID, CI_JOBS, prIdentity, independentReview, trustedChecks, successfulNeeds,
  deploymentIdentity, deploymentArtifact, publicationAuthority } from '../scripts/security/policy.mjs';
import { productionGate } from '../scripts/security/production-gate.mjs';
import { allowedT03Path } from '../scripts/security/check-t03-scope.mjs';
import { publicationDecision } from '../scripts/local-content/check-publication.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const clone = value => structuredClone(value);
const H = 'a'.repeat(40), B = 'b'.repeat(40), M = 'c'.repeat(40);
const repo = { id: 1315877631, full_name: 'miracleqihe/symgene' };
const pull = { number: 7, user: { login: 'example-author' },
  base: { ref: 'main', sha: B, repo }, head: { ref: 'dev', sha: H, repo }, merge_commit_sha: M };
const identity = () => ({ pull: clone(pull), eventPr: clone(pull), currentBaseSha: B,
  checkoutSha: M, merge: { sha: M, parents: [{ sha: B }, { sha: H }] } });
const reviews = () => ({ pull: clone(pull), permissions: { miracleqihe: 'admin' }, threads: [{ isResolved: true }],
  reviews: [{ id: 1, state: 'APPROVED', commit_id: H, user: { login: 'miracleqihe', type: 'User' } }] });
const ci = () => ({ pull: clone(pull), baseWorkflowBlob: B, headWorkflowBlob: B,
  run: { id: 42, repository: repo, event: 'pull_request', path: '.github/workflows/ci.yml',
    head_sha: H, status: 'completed', conclusion: 'success', check_suite_id: 70 },
  jobs: CI_JOBS.map((name, i) => ({ id: 100 + i, name, run_id: 42, status: 'completed', conclusion: 'success' })),
  checks: CI_JOBS.map((name, i) => ({ id: 100 + i, name, head_sha: H, app: { id: ACTIONS_APP_ID },
    check_suite: { id: 70 }, status: 'completed', conclusion: 'success' })) });
const context = () => ({ repository: repo.full_name, eventName: 'workflow_dispatch', ref: 'refs/heads/main',
  environment: 'github-pages', workflowRef: repo.full_name + '/.github/workflows/deploy-pages.yml@refs/heads/main',
  sha: H, checkoutSha: H, currentMainSha: H, runId: 42, runAttempt: 2 });
const artifact = () => ({ context: context(), expectedId: 500, expectedDigest: 'sha256:' + 'd'.repeat(64),
  run: { id: 42, run_attempt: 2, head_sha: H, head_branch: 'main', event: 'workflow_dispatch',
    path: '.github/workflows/deploy-pages.yml', repository: repo },
  artifact: { id: 500, name: 'github-pages-42-2', expired: false, digest: 'sha256:' + 'd'.repeat(64),
    workflow_run: { id: 42, head_sha: H, head_branch: 'main' } } });
const rejects = (fn, code) => assert.throws(fn, error => error.code === code);

test('1: missing, self, unqualified and bot approvals do not authorize merging', () => {
  assert.equal(independentReview(reviews()).status, 'PASS');
  for (const mutate of [r => r.reviews = [], r => r.pull.user.login = 'miracleqihe',
    r => r.reviews[0].user.type = 'Bot', r => r.permissions.miracleqihe = 'read',
    r => r.reviews[0].state = 'DISMISSED']) {
    const r = reviews(); mutate(r);
    rejects(() => independentReview(r), 'INDEPENDENT_CURRENT_REVIEW_REQUIRED');
  }
});

test('2: an old SHA review and a later withdrawal do not authorize a new head', () => {
  const r = reviews(); r.reviews[0].commit_id = B;
  rejects(() => independentReview(r), 'INDEPENDENT_CURRENT_REVIEW_REQUIRED');
  const revoked = reviews(); revoked.reviews.push({ ...revoked.reviews[0], id: 2, state: 'DISMISSED' });
  rejects(() => independentReview(revoked), 'INDEPENDENT_CURRENT_REVIEW_REQUIRED');
  const thread = reviews(); thread.threads[0].isResolved = false;
  rejects(() => independentReview(thread), 'REVIEW_THREAD_UNRESOLVED');
});

test('3: failure, skipped, neutral, cancellation and missing upstream results fail the terminal gate', () => {
  assert.equal(successfulNeeds({ a: { result: 'success' } }, ['a']).status, 'PASS');
  for (const result of ['failure', 'skipped', 'neutral', 'cancelled', undefined]) {
    rejects(() => successfulNeeds({ a: { result } }, ['a']), 'UPSTREAM_NOT_SUCCESS');
  }
  rejects(() => successfulNeeds({}, ['a']), 'UPSTREAM_NOT_SUCCESS');
});

test('actual inline terminal workflow decisions reject every non-success upstream result', () => {
  for (const [workflow, names] of [
    ['ci.yml', ['identity', 'branch-policy', 'verify', 'content-integration']],
    ['deploy-pages.yml', ['authorization', 'verify']],
  ]) {
    const yaml = readFileSync(join(root, '.github/workflows', workflow), 'utf8');
    const blocks = [...yaml.matchAll(/script: \|\n((?: {12}[^\n]*\n)+)/g)];
    const block = blocks.map(m => m[1]).find(s => s.includes('const needs = JSON.parse'));
    assert.ok(block, workflow);
    const script = block.replace(/^ {12}/gm, '');
    const execute = needs => {
      let failed = false;
      runInNewContext(script, { process: { env: { NEEDS_JSON: JSON.stringify(needs) } },
        core: { setFailed: () => { failed = true; } } }, { timeout: 500 });
      return failed;
    };
    const passing = Object.fromEntries(names.map(name => [name, { result: 'success' }]));
    assert.equal(execute(passing), false);
    for (const name of names) for (const result of ['failure', 'skipped', 'neutral', 'cancelled', undefined]) {
      assert.equal(execute({ ...passing, [name]: { result } }), true, `${workflow}:${name}:${result}`);
    }
    assert.equal(execute({}), true);
  }
});

test('4: matching check names cannot replace exact trusted workflow, run, job, suite, App and HEAD identities', () => {
  assert.equal(trustedChecks(ci()).status, 'PASS');
  for (const mutate of [r => r.checks[0].app.id = 1, r => r.checks[0].id = 999,
    r => r.checks[0].head_sha = B, r => r.checks[0].check_suite.id++,
    r => r.checks[0].conclusion = 'skipped']) {
    const r = ci(); mutate(r); rejects(() => trustedChecks(r), 'CI_CHECK_SOURCE_REJECTED');
  }
  const spoof = ci(); spoof.headWorkflowBlob = M;
  rejects(() => trustedChecks(spoof), 'CI_WORKFLOW_NOT_FROM_TRUSTED_BASE');
  for (const mutate of [r => r.run.path = '.github/workflows/forged.yml', r => r.run.event = 'workflow_dispatch',
    r => r.run.head_sha = B, r => r.run.repository = { full_name: 'example/fork' }]) {
    const r = ci(); mutate(r); rejects(() => trustedChecks(r), 'CI_RUN_IDENTITY_REJECTED');
  }
  const missing = ci(); missing.jobs = missing.jobs.filter(j => j.name !== 'Branch policy');
  rejects(() => trustedChecks(missing), 'CI_JOB_NOT_SUCCESS');
});

test('5: feature, fork dev and same-name different repository ID cannot promote main', () => {
  assert.equal(prIdentity(identity()).mergeSha, M);
  for (const mutate of [r => r.pull.head.ref = 'feat/example',
    r => r.pull.head.repo = { id: 2, full_name: 'example/fork' },
    r => r.pull.head.repo = { id: 2, full_name: repo.full_name }]) {
    const r = identity(); mutate(r); r.eventPr = clone(r.pull);
    rejects(() => prIdentity(r), 'MAIN_PROMOTION_SOURCE_REJECTED');
  }
  const stale = identity(); stale.eventPr.head.sha = B;
  rejects(() => prIdentity(stale), 'PR_EVENT_STALE');
  const merge = identity(); merge.merge.parents[1].sha = B;
  rejects(() => prIdentity(merge), 'PR_MERGE_MISMATCH');
  const moved = identity(); moved.currentBaseSha = H;
  rejects(() => prIdentity(moved), 'PR_BASE_STALE');
});

test('6: local flags, fake approvals and templates cannot create a publication authority', () => {
  for (const evidence of [null, { approved: true }, { publication: 'approved', medicalApproval: 'approved' },
    { PUBLICATION_APPROVED: 'true', SKIP_PUBLICATION_CHECK: 'true' },
    { signature: 'fictional-example-only', status: 'APPROVED', expires: '2099-01-01' },
    { status: 'APPROVED', revoked: true }, { status: 'APPROVED', expires: '2000-01-01' }]) {
    assert.equal(publicationAuthority(evidence).status, 'BLOCKED');
    assert.equal(productionGate({ ...context(), approval: evidence }).code, 'PUBLICATION_AUTHORITY_NOT_CONFIGURED');
  }
});

function snapshotFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'symgene-security-'));
  const lock = JSON.parse(readFileSync(join(root, 'legacy-content.lock')));
  for (const path of [...lock.files.map(row => row.path), 'legacy-content.lock',
    'vendor/local-content/legacy-snapshot.mjs', 'content-pack.lock']) {
    const target = join(dir, path); mkdirSync(join(target, '..'), { recursive: true }); cpSync(join(root, path), target);
  }
  return dir;
}

test('7: changed medical output cannot reuse the old digest', () => {
  const dir = snapshotFixture();
  try {
    const path = join(dir, 'src/content/knowledge.json');
    writeFileSync(path, readFileSync(path, 'utf8') + '\n');
    rejects(() => publicationDecision(dir), 'LEGACY_VENDOR_DRIFT');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('8: changing a locked digest/version or adoption cannot reuse an earlier approval', () => {
  for (const field of ['digest', 'version']) {
    const dir = snapshotFixture();
    try {
      const path = join(dir, 'legacy-content.lock'), lock = JSON.parse(readFileSync(path));
      writeFileSync(path, JSON.stringify({ ...lock, [field]: 'fictional-old-approval' }));
      rejects(() => publicationDecision(dir), 'LEGACY_VENDOR_DRIFT');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('9: manual dispatch from a non-main ref and mismatched checkout/main SHA are rejected', () => {
  const c = context(); c.ref = 'refs/heads/feature/example';
  rejects(() => deploymentIdentity(c), 'DEPLOY_REF_REJECTED');
  for (const field of ['checkoutSha', 'currentMainSha']) {
    const c = context(); c[field] = B;
    rejects(() => deploymentIdentity(c), 'DEPLOY_SHA_MISMATCH');
  }
});

test('10: alternate environments, stale artifacts, wrong runs and replayed attempts are rejected', () => {
  assert.equal(deploymentArtifact(artifact()).status, 'PASS');
  const env = artifact(); env.context.environment = 'alternative';
  rejects(() => deploymentArtifact(env), 'DEPLOY_ENVIRONMENT_REJECTED');
  for (const mutate of [a => a.artifact.id++, a => a.artifact.expired = true,
    a => a.artifact.workflow_run.id++, a => a.artifact.workflow_run.head_sha = B,
    a => a.artifact.name = 'github-pages-42-1']) {
    const a = artifact(); mutate(a); rejects(() => deploymentArtifact(a), 'ARTIFACT_IDENTITY_REJECTED');
  }
  const run = artifact(); run.run.run_attempt--;
  rejects(() => deploymentArtifact(run), 'ARTIFACT_RUN_MISMATCH');
  const digest = artifact(); digest.artifact.digest = 'sha256:' + 'e'.repeat(64);
  rejects(() => deploymentArtifact(digest), 'ARTIFACT_DIGEST_MISMATCH');
});

test('workflow controls keep terminal checks unconditional, trusted source isolated and deployment credentials separate', () => {
  const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
  assert.match(ci, /name: Engineering gate\n    if: always\(\)/);
  assert.doesNotMatch(ci, /head_ref == 'codex\//);
  assert.match(ci, /needs\[name\]\?\.result !== 'success'/);
  const trusted = readFileSync(join(root, '.github/workflows/publication-policy.yml'), 'utf8');
  assert.match(trusted, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.doesNotMatch(trusted, /head\.sha|npm ci|secrets\./);
  assert.match(trusted, /core\.setFailed\('BLOCKED/);
  const pages = readFileSync(join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
  assert.match(pages, /name: Deployment gate\n    if: always\(\)/);
  assert.match(pages, /context\.ref !== 'refs\/heads\/main'/);
  const deploy = pages.slice(pages.indexOf('\n  deploy:'));
  assert.doesNotMatch(deploy, /uses: actions\/checkout|npm ci|run: npm|cache:/);
  assert.match(deploy, /artifact\.workflow_run\?\.id !== context\.runId/);
  assert.match(deploy, /artifact\.digest !== process\.env\.ARTIFACT_DIGEST/);
  for (const name of ['ci.yml', 'deploy-pages.yml', 'publication-policy.yml', 'pr-governance.yml', 't02-verification.yml', 'check-external-links.yml']) {
    const text = readFileSync(join(root, '.github/workflows', name), 'utf8');
    for (const use of text.matchAll(/uses:\s+(\S+)/g)) assert.match(use[1], /^actions\/[a-z-]+@[a-f0-9]{40}$/);
  }
});

test('T03 scope audit permits engineering paths while retaining medical, lock and contract boundaries', () => {
  for (const path of ['scripts/security/policy.mjs', '.github/workflows/ci.yml', 'tests/security-gates.test.mjs', 'package-lock.json']) assert.equal(allowedT03Path(path), true);
  for (const path of ['src/content/knowledge.json', 'legacy-content.lock', 'content-pack.lock', 'vendor/t02/src/contract.mjs', '../private.txt']) assert.equal(allowedT03Path(path), false);
});

test('browser CI retains its font and browser gates with bounded signed Ubuntu downloads', () => {
  const yaml = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
  const verify = yaml.slice(yaml.indexOf('\n  verify:'), yaml.indexOf('\n  content-integration:'));
  assert.match(verify, /runs-on: ubuntu-24\.04/);
  assert.match(verify, /timeout-minutes: 20/);
  assert.match(verify, /https:\/\/archive\.ubuntu\.com\/ubuntu/);
  assert.match(verify, /Acquire::Retries "2";/);
  assert.match(verify, /Acquire::https::Timeout "20";/);
  const configName = verify.match(/\/etc\/apt\/apt\.conf\.d\/([a-z0-9-]+)/)?.[1];
  assert.ok(configName, 'the bounded download settings must have a concrete apt config file');
  // A real runner-images zz-retries file overrides NN-* files in C-locale order.
  assert.equal(['99symgene-ci-downloads', 'zz-retries', configName].sort().at(-1), configName);
  assert.notEqual(configName, 'zz-retries', 'do not replace another owner\'s policy file');
  for (const [key, value] of [['Acquire::Retries', '2'], ['Acquire::http::Timeout', '20'],
    ['Acquire::https::Timeout', '20'], ['DPkg::Lock::Timeout', '30']]) {
    assert.ok(verify.includes(`test "$(sudo apt-config shell VALUE ${key})" = "VALUE='${value}'"`),
      `the actual root apt setting ${key} must be read back and compared`);
  }
  assert.match(verify, /timeout-minutes: 8\n        run: npx --no-install playwright install --with-deps chromium/);
  assert.match(verify, /timeout-minutes: 3\n        run: sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends fonts-noto-cjk/);
  assert.match(verify, /run: npm run review:browser/);
  assert.doesNotMatch(verify, /--allow-unauthenticated|AllowUnauthenticated|trusted=yes|continue-on-error/);
  const browser = readFileSync(join(root, 'scripts/local-content/review-browser.mjs'), 'utf8');
  assert.match(browser, /assert\.ok\(hasChineseGlyph/);
  for (const width of [390, 768, 1366, 1920]) assert.match(browser, new RegExp(String(width)));
});

test('the actual Apt readback shell refuses runner overrides instead of silently accepting written values', () => {
  const yaml = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
  const checks = yaml.split('\n').map(line => line.trim()).filter(line => line.startsWith('test "$(sudo apt-config shell VALUE '));
  assert.equal(checks.length, 4);
  const dir = mkdtempSync(join(tmpdir(), 'symgene-apt-readback-'));
  try {
    const sudo = join(dir, 'sudo');
    writeFileSync(sudo, '#!/bin/sh\ncase "$4" in\n  Acquire::Retries) value="${EXAMPLE_RETRIES:-2}" ;;\n  Acquire::http::Timeout|Acquire::https::Timeout) value=20 ;;\n  DPkg::Lock::Timeout) value=30 ;;\n  *) exit 2 ;;\nesac\nprintf "VALUE=\\047%s\\047\\n" "$value"\n');
    chmodSync(sudo, 0o755);
    for (const [retries, expected] of [['2', 0], ['1', 1], ['3', 1]]) {
      const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', checks.join('\n')], {
        env: { ...process.env, PATH: dir + ':' + process.env.PATH, EXAMPLE_RETRIES: retries }, encoding: 'utf8', timeout: 5000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, expected, result.stdout + result.stderr);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
