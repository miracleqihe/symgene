import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, cpSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { ACTIONS_APP_ID, CI_JOBS, prIdentity, independentReview, trustedChecks, successfulNeeds,
  deploymentIdentity, deploymentArtifact, publicationAuthority, formalT02AdoptionAuthority, latestCiRun, parseCiContext } from '../scripts/security/policy.mjs';
import { inspectTrustedPr, collectReviewThreads } from '../scripts/security/trusted-pr.mjs';
import { productionGate } from '../scripts/security/production-gate.mjs';
import { allowedT03Path } from '../scripts/security/check-t03-scope.mjs';
import { publicationDecision } from '../scripts/local-content/check-publication.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const clone = value => structuredClone(value);
const H = 'a'.repeat(40), B = 'b'.repeat(40), M = 'c'.repeat(40);
const repo = { id: 1315877631, full_name: 'miracleqihe/symgene' };
const pull = { state: 'open', draft: false, number: 7, user: { login: 'example-author' },
  base: { ref: 'main', sha: B, repo }, head: { ref: 'dev', sha: H, repo }, merge_commit_sha: M };
const identity = () => ({ pull: clone(pull), eventPr: clone(pull), currentBaseSha: B,
  checkoutSha: M, merge: { sha: M, parents: [{ sha: B }, { sha: H }] } });
const reviews = () => ({ lastPushProtection: true, pull: clone(pull), permissions: { miracleqihe: 'admin' }, threads: [{ isResolved: true }],
  reviews: [{ id: 1, state: 'APPROVED', commit_id: H, user: { login: 'miracleqihe', type: 'User' } }] });
const ci = () => ({ pull: clone(pull), baseWorkflowBlob: B, headWorkflowBlob: B, mergeWorkflowBlob: B,
  workflow: { id: 10, path: '.github/workflows/ci.yml', state: 'active' },
  run: { id: 42, repository: repo, head_repository: repo, event: 'pull_request', path: '.github/workflows/ci.yml',
    head_sha: H, head_branch: 'dev', status: 'completed', conclusion: 'success', check_suite_id: 70, run_attempt: 2, workflow_id: 10,
    pull_requests: [{ number: 7, base: clone(pull.base), head: clone(pull.head) }] },
  platformContext: { repository: repo.full_name, repositoryId: repo.id, number: 7, headRepositoryId: repo.id,
    headRef: 'dev', baseRef: 'main', headSha: H, baseSha: B, mergeSha: M, workflowSha: M,
    ref: 'refs/pull/7/merge', eventName: 'pull_request', action: 'synchronize',
    workflowRef: `${repo.full_name}/.github/workflows/ci.yml@refs/pull/7/merge`, runId: 42, runAttempt: 2 },
  suite: { id: 70, head_sha: H, head_branch: 'dev', app: { id: ACTIONS_APP_ID }, status: 'completed', conclusion: 'success' },
  jobs: CI_JOBS.map((name, i) => ({ id: 100 + i, name, run_id: 42, run_attempt: 2, head_sha: H,
    check_run_url: `https://api.github.com/repos/${repo.full_name}/check-runs/${100 + i}`, status: 'completed', conclusion: 'success' })),
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
    if (workflow === 'deploy-pages.yml') passing.verify.outputs = { legacy_status: 'LEGACY_ENGINEERING_ELIGIBLE' };
    assert.equal(execute(passing), false);
    for (const name of names) for (const result of ['failure', 'skipped', 'neutral', 'cancelled', undefined]) {
      assert.equal(execute({ ...passing, [name]: { result } }), true, `${workflow}:${name}:${result}`);
    }
    assert.equal(execute({}), true);
    if (workflow === 'deploy-pages.yml') for (const status of [undefined, 'PASS', 'T02_FORMAL_ADOPTION_BLOCKED']) {
      assert.equal(execute({ ...passing, verify: { result: 'success', outputs: { legacy_status: status } } }), true);
    }
  }
});

test('4: matching check names cannot replace exact trusted workflow, run, job, suite, App and HEAD identities', () => {
  assert.equal(trustedChecks(ci()).status, 'PASS');
  for (const mutate of [r => r.checks[0].app.id = 1, r => r.checks[0].id = 999,
    r => r.checks[0].head_sha = B, r => r.checks[0].check_suite.id++,
    r => r.checks[0].conclusion = 'skipped']) {
    const r = clone(ci()); mutate(r); rejects(() => trustedChecks(r), 'CI_CHECK_SOURCE_REJECTED');
  }
  const spoof = ci(); spoof.headWorkflowBlob = M;
  rejects(() => trustedChecks(spoof), 'CI_WORKFLOW_NOT_FROM_TRUSTED_BASE');
  for (const mutate of [r => r.run.path = '.github/workflows/forged.yml', r => r.run.event = 'workflow_dispatch',
    r => r.run.head_sha = B, r => r.run.repository = { full_name: 'example/fork' }]) {
    const r = clone(ci()); mutate(r); rejects(() => trustedChecks(r), 'CI_RUN_IDENTITY_REJECTED');
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

test('6: local flags, fake approvals and templates cannot create formal T02 adoption authority', () => {
  for (const evidence of [null, { approved: true }, { publication: 'approved', medicalApproval: 'approved' },
    { PUBLICATION_APPROVED: 'true', SKIP_PUBLICATION_CHECK: 'true' },
    { signature: 'fictional-example-only', status: 'APPROVED', expires: '2099-01-01' },
    { status: 'APPROVED', revoked: true }, { status: 'APPROVED', expires: '2000-01-01' }]) {
    assert.equal(publicationAuthority(evidence).status, 'T02_FORMAL_ADOPTION_BLOCKED');
    const authority = formalT02AdoptionAuthority(evidence);
    assert.equal(authority.status, 'T02_FORMAL_ADOPTION_BLOCKED');
    assert.equal(authority.code, 'T02_FORMAL_AUTHORITY_NOT_CONFIGURED');
    assert.equal('medicalApproval' in authority, false);
    assert.equal('rightsApproval' in authority, false);
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
  assert.match(trusted, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.sha \}\}/);
  assert.doesNotMatch(trusted, /head\.sha|npm ci|secrets\./);
  assert.ok(trusted.indexOf("throw new Error('TRUSTED_AUDIT_WORKFLOW_REJECTED')") < trusted.indexOf('uses: actions/checkout'));
  assert.match(trusted, /core\.setFailed\('BLOCKED/);
  assert.doesNotMatch(trusted, /^  schedule:|cron:/m);
  assert.doesNotMatch(trusted, /administration:|checks: write|contents: write|pull-requests: write/);
  assert.doesNotMatch(trusted, /core\.setFailed\('BLOCKED: no authenticated/);
  const pages = readFileSync(join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
  const eligibility = pages.match(/      - name: Validate legacy production source and the actual build\n([\s\S]*?)(?=      - uses:)/)?.[1];
  assert.ok(eligibility);
  assert.match(eligibility, /CURRENT_MAIN_SHA: \$\{\{ needs\.authorization\.outputs\.sha \}\}/);
  assert.match(eligibility, /EXPECTED_ENVIRONMENT: github-pages/);
  assert.ok(pages.indexOf('run: npm run verify') < pages.indexOf('run: node scripts/security/production-gate.mjs'));
  assert.match(pages, /timeout-minutes: 8\n        run: npx --no-install playwright install --with-deps chromium/);
  assert.match(pages, /timeout-minutes: 3\n        run: node scripts\/security\/verify-production-runtime\.mjs/);
  assert.ok(pages.indexOf('run: npm run verify') < pages.indexOf('run: node scripts/security/verify-production-runtime.mjs'));
  assert.ok(pages.indexOf('run: node scripts/security/verify-production-runtime.mjs') < pages.indexOf('run: node scripts/security/production-gate.mjs'));
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
  for (const path of ['scripts/security/policy.mjs', '.github/workflows/ci.yml', 'tests/security-gates.test.mjs', 'package-lock.json',
    'scripts/t02/consumer-concurrency.mjs', 'scripts/t02/signed-consumer-browser.mjs',
    'tests/helpers/concurrency-gateway.mjs', 'tests/browser/content-concurrency.test.mjs']) assert.equal(allowedT03Path(path), true);
  for (const path of ['src/content/knowledge.json', 'legacy-content.lock', 'content-pack.lock', 'vendor/t02/src/contract.mjs', '../private.txt', 'scripts/t02/contract.mjs',
    'scripts/t02/consumer-concurrency-extra.mjs', 'tests/helpers/other.mjs',
    'scripts/t02/../consumer-concurrency.mjs']) assert.equal(allowedT03Path(path), false);
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


test('CI rejects cross-PR, stale-base, missing associations, repository IDs and synthetic merge drift', () => {
  for (const mutate of [r => r.run.pull_requests = [], r => delete r.run.pull_requests,
    r => r.run.pull_requests.push(clone(r.run.pull_requests[0]))]) {
    const r = clone(ci()); mutate(r); rejects(() => trustedChecks(r), 'CI_PR_ASSOCIATION_MISSING_OR_AMBIGUOUS');
  }
  for (const mutate of [r => r.run.pull_requests[0].number++, r => r.run.pull_requests[0].base.sha = H,
    r => r.run.pull_requests[0].base.ref = 'dev', r => r.run.pull_requests[0].head.ref = 'other',
    r => r.run.pull_requests[0].base.repo.id++, r => r.run.pull_requests[0].head.repo.id++]) {
    const r = clone(ci()); mutate(r); rejects(() => trustedChecks(r), 'CI_PR_SNAPSHOT_MISMATCH');
  }
  for (const field of ['number', 'repositoryId', 'headRepositoryId', 'headRef', 'baseRef', 'headSha',
    'baseSha', 'mergeSha', 'workflowSha', 'ref', 'eventName', 'action', 'workflowRef', 'runId', 'runAttempt']) {
    const r = ci(); r.platformContext[field] = 'wrong';
    rejects(() => trustedChecks(r), 'CI_TESTED_MERGE_MISMATCH');
  }
  for (const mutate of [r => r.run.run_attempt = 0, r => r.run.repository.id++, r => r.workflow.id++,
    r => r.workflow.state = 'disabled_manually', r => r.run.head_repository.id++, r => r.run.head_branch = 'other']) {
    const r = clone(ci()); mutate(r); rejects(() => trustedChecks(r), 'CI_RUN_IDENTITY_REJECTED');
  }
  for (const mutate of [r => r.jobs[0].run_attempt--, r => r.jobs[0].head_sha = M,
    r => r.jobs[0].check_run_url = 'https://example.invalid/check-runs/100', r => r.jobs.push(clone(r.jobs[0]))]) {
    const r = clone(ci()); mutate(r); rejects(() => trustedChecks(r), 'CI_JOB_NOT_SUCCESS');
  }
  const blob = ci(); blob.mergeWorkflowBlob = M;
  rejects(() => trustedChecks(blob), 'CI_WORKFLOW_NOT_FROM_TRUSTED_BASE');
  const suite = ci(); suite.suite.app.id++;
  rejects(() => trustedChecks(suite), 'CI_SUITE_REJECTED');
});

test('latest run is selected before success or association, so a newer failure cannot reuse green CI', () => {
  const old = ci().run, newer = { ...clone(old), id: 43, conclusion: 'failure', pull_requests: [] };
  assert.equal(latestCiRun([old, newer], pull).id, 43);
  const r = ci(); r.run = latestCiRun([old, newer], pull);
  rejects(() => trustedChecks(r), 'CI_RUN_IDENTITY_REJECTED');
  rejects(() => latestCiRun([old, clone(old)], pull), 'CI_RUN_AMBIGUOUS');
  rejects(() => latestCiRun([], pull), 'CI_RUN_MISSING');
});

const logFor = data => '2026-10-23T12:00:00.000Z SYMGENE_CI_CONTEXT_V1 ' + JSON.stringify(data) + '\n';
test('isolated platform log parser rejects missing, duplicate and malformed context', () => {
  const log = logFor(ci().platformContext);
  assert.deepEqual(parseCiContext(log), ci().platformContext);
  for (const text of ['', '{}', log + log]) rejects(() => parseCiContext(text), 'CI_CONTEXT_LOG_AMBIGUOUS');
  rejects(() => parseCiContext('2026-10-23T12:00:00.000Z SYMGENE_CI_CONTEXT_V1 {'), 'CI_CONTEXT_LOG_INVALID');
  const yaml = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
  const identity = yaml.slice(yaml.indexOf('\n  identity:'), yaml.indexOf('\n  branch-policy:'));
  assert.doesNotMatch(identity.replace(/^\s*#.*$/gm, ''), /actions\/checkout|record-ci-evidence|import\(|npm |run:/);
  assert.match(identity, /mergeSha: context\.sha/);
  assert.match(identity, /workflowSha: process\.env\.GITHUB_WORKFLOW_SHA/);
});

test('last reviewable pusher is not inferred from author, committer or workflow actor', () => {
  for (const value of [undefined, false, 'true']) {
    const r = reviews(); r.lastPushProtection = value;
    r.pull.last_commit = { author: 'example-other', committer: 'example-other' };
    r.pull.pushed_by = 'example-other';
    rejects(() => independentReview(r), 'LAST_PUSH_NATIVE_PROTECTION_REQUIRED');
  }
});

const threadResult = (hasNextPage = false, endCursor = null, nodes = [{ isResolved: true }]) => ({
  repository: { pullRequest: { reviewThreads: { nodes, pageInfo: { hasNextPage, endCursor } } } },
});
test('review thread pagination strictly validates booleans, cursors, page limits and API failures', async () => {
  for (const value of [undefined, null, 'false', 0, 1]) {
    await assert.rejects(collectReviewThreads({ github: { graphql: async () => { const result = threadResult(); result.repository.pullRequest.reviewThreads.pageInfo.hasNextPage = value; return result; } }, repo: {}, number: 7 }), { code: 'REVIEW_THREADS_INVALID_PAGE' });
  }
  for (const cursor of [null, '', ' ', 1]) {
    await assert.rejects(collectReviewThreads({ github: { graphql: async () => threadResult(true, cursor) }, repo: {}, number: 7 }), { code: 'REVIEW_THREADS_INVALID_CURSOR' });
  }
  await assert.rejects(collectReviewThreads({ github: { graphql: async () => threadResult(true, 'duplicate') }, repo: {}, number: 7 }), { code: 'REVIEW_THREADS_INVALID_CURSOR' });
  let page = 0;
  await assert.rejects(collectReviewThreads({ github: { graphql: async () => threadResult(true, String(++page)) }, repo: {}, number: 7, maxPages: 2 }), { code: 'REVIEW_THREADS_PAGE_LIMIT' });
  await assert.rejects(collectReviewThreads({ github: { graphql: async () => { throw new Error('permission denied'); } }, repo: {}, number: 7 }), /permission denied/);
  await assert.rejects(collectReviewThreads({ github: { graphql: async () => ({ ...threadResult(), errors: [{ message: 'denied' }] }) }, repo: {}, number: 7 }), { code: 'REVIEW_THREADS_GRAPHQL_ERRORS' });
  const pages = [threadResult(true, 'second'), threadResult(false)];
  assert.equal((await collectReviewThreads({ github: { graphql: async () => pages.shift() }, repo: {}, number: 7 })).length, 2);
});

function collectorFixture(mutate = () => {}) {
  const r = ci(); let reviewReads = 0, threadReads = 0, runReads = 0, permissionReads = 0, pullReads = 0;
  const state = { r, protection: { required_pull_request_reviews: { require_last_push_approval: true,
    required_approving_review_count: 1, bypass_pull_request_allowances: { users: [], teams: [], apps: [] } }, enforce_admins: { enabled: true } } };
  const method = name => Object.defineProperty(() => {}, 'name', { value: name });
  const github = { rest: { pulls: { get: async () => { const result = clone(pull); mutate('pull', ++pullReads, result, state); return { data: result }; }, listReviews: method('reviews') },
    repos: { getBranch: async () => ({ data: { commit: { sha: B } } }), getCommit: async () => ({ data: identity().merge }),
      getCollaboratorPermissionLevel: async () => { const data = { permission: 'admin' }; mutate('permission', ++permissionReads, data, state); return { data }; },
      getBranchProtection: async () => ({ data: state.protection }), getContent: async () => ({ data: { sha: B } }) },
    actions: { listWorkflowRuns: method('runs'), listJobsForWorkflowRunAttempt: method('jobs'),
      getWorkflow: async () => ({ data: r.workflow }), downloadJobLogsForWorkflowRun: async () => ({ data: logFor(r.platformContext) }) },
    checks: { listForRef: method('checks'), getSuite: async () => ({ data: r.suite }) } },
    paginate: async endpoint => { const type = endpoint.name;
      const result = clone(type === 'reviews' ? reviews().reviews : type === 'runs' ? [r.run] : r[type]);
      mutate(type, type === 'reviews' ? ++reviewReads : type === 'runs' ? ++runReads : 1, result, state); return result; },
    graphql: async () => { const result = threadResult(); mutate('threads', ++threadReads, result, state); return result; } };
  return { github, context: { repo: { owner: 'miracleqihe', repo: 'symgene' }, eventName: 'pull_request_target', payload: { pull_request: clone(pull) } }, number: 7 };
}

test('trusted final collection rechecks dismissal, permission, threads, unchanged-head review changes and CI changes', async () => {
  const audited = await inspectTrustedPr(collectorFixture());
  assert.equal(audited.engineering.status, 'PASS');
  assert.equal(audited.engineering.code, 'TRUSTED_ENGINEERING_AUDIT_PASS');
  assert.equal(audited.formalT02Adoption.status, 'T02_FORMAL_ADOPTION_BLOCKED');
  assert.equal(audited.productionDeployment, 'not_authorized');
  const attacks = [
    ['INDEPENDENT_CURRENT_REVIEW_REQUIRED', (kind, count, data) => { if (kind === 'reviews' && count === 2) data[0].state = 'DISMISSED'; }],
    ['INDEPENDENT_CURRENT_REVIEW_REQUIRED', (kind, count, data) => { if (kind === 'permission' && count === 2) data.permission = 'read'; }],
    ['REVIEW_THREAD_UNRESOLVED', (kind, count, data) => { if (kind === 'threads' && count === 2) data.repository.pullRequest.reviewThreads.nodes[0].isResolved = false; }],
    ['REVIEW_CHANGED_DURING_CHECK', (kind, count, data) => { if (kind === 'reviews' && count === 2) data.push({ id: 5, state: 'COMMENTED' }); }],
    ['CI_CHANGED_DURING_CHECK', (kind, count, data) => { if (kind === 'runs' && count === 2) data[0].run_attempt++; }],
    ['CI_CHANGED_DURING_CHECK', (kind, count, data) => { if (kind === 'runs' && count === 2) data.push({ ...clone(data[0]), id: 43, conclusion: 'failure' }); }],
    ['PR_CHANGED_DURING_CHECK', (kind, count, data) => { if (kind === 'pull' && count === 2) data.state = 'closed'; }],
    ['CI_RUN_IDENTITY_REJECTED', (kind, count, data) => { if (kind === 'runs' && count === 2) data[0].path = '.github/workflows/forged.yml'; }],
    ['PR_REQUEST_REJECTED', (kind, count, data) => { if (kind === 'pull' && count === 1) data.number++; }],
    ['LAST_PUSH_NATIVE_PROTECTION_REQUIRED', (_kind, _count, _data, state) => { state.protection.required_pull_request_reviews.require_last_push_approval = false; }],
  ];
  for (const [code, mutate] of attacks) await assert.rejects(inspectTrustedPr(collectorFixture(mutate)), { code });
});

test('unreadable native protection remains blocked and documents the Administration read requirement', async () => {
  for (const status of [403, 404, 500]) {
    const fixture = collectorFixture();
    fixture.github.rest.repos.getBranchProtection = async () => { throw Object.assign(new Error('not accessible'), { status }); };
    await assert.rejects(inspectTrustedPr(fixture), error => error.code === 'LAST_PUSH_NATIVE_PROTECTION_UNVERIFIABLE'
      && error.status === 'BLOCKED' && error.httpStatus === status && /Administration: read/.test(error.platformRequirement));
  }
  const fixture = collectorFixture(); fixture.context.eventName = 'schedule'; fixture.context.ref = 'refs/heads/main';
  await assert.rejects(inspectTrustedPr(fixture), { code: 'TRUSTED_PR_EVENT_REJECTED' });
});

test('shipped trusted workflow reports engineering audit separately and fails every missing or denied audit', async () => {
  const yaml = readFileSync(join(root, '.github/workflows/publication-policy.yml'), 'utf8');
  const body = [...yaml.matchAll(/script: \|\n((?: {12}[^\n]*\n)+)/g)].map(m => m[1])
    .find(script => script.includes('await inspectTrustedPr'))?.replace(/^ {12}/gm, '');
  assert.ok(body);
  const script = body.replace('const { inspectTrustedPr } = await import(file)', 'const inspectTrustedPr = inspectFixture');
  assert.notEqual(script, body, 'only substitute the remote collector boundary');
  const execute = async inspectFixture => {
    const failures = [], errors = [], info = [];
    await runInNewContext('(async () => {' + script + '})()', {
      require: name => { assert.equal(name, 'node:url'); return { pathToFileURL: path => ({ href: path }) }; },
      process: { cwd: () => '/example' }, inspectFixture, github: {},
      context: { eventName: 'workflow_dispatch', repo: {}, payload: { inputs: { pull_request_number: '7' } } },
      core: { info: text => info.push(text), error: text => errors.push(text), setFailed: text => failures.push(text) },
    }, { timeout: 500 });
    return { failures, errors, info };
  };
  const passing = await execute(async () => ({ engineering: { status: 'PASS', code: 'TRUSTED_ENGINEERING_AUDIT_PASS' },
    formalT02Adoption: { status: 'T02_FORMAL_ADOPTION_BLOCKED' }, productionDeployment: 'not_authorized' }));
  assert.equal(passing.failures.length, 0);
  assert.ok(passing.info.some(text => text.includes('T02_FORMAL_ADOPTION_BLOCKED')));
  for (const engineering of [undefined, { status: 'BLOCKED' }, { status: 'PASS', code: 'wrong' }]) {
    assert.equal((await execute(async () => ({ engineering }))).failures.length, 1);
  }
  for (const code of ['LAST_PUSH_NATIVE_PROTECTION_UNVERIFIABLE', 'CI_CHANGED_DURING_CHECK', 'REVIEW_THREAD_UNRESOLVED']) {
    const rejected = await execute(async () => { throw Object.assign(new Error(code), { code }); });
    assert.equal(rejected.failures.length, 1); assert.ok(rejected.errors[0].includes(code));
  }
});

test('actual workflow guards reject unsafe refs before trusted source or production checkout', async () => {
  for (const [name, marker] of [['publication-policy.yml', 'TRUSTED_AUDIT_WORKFLOW_REJECTED'],
    ['deploy-pages.yml', 'DEPLOY_MAIN_CHANGED']]) {
    const yaml = readFileSync(join(root, '.github/workflows', name), 'utf8');
    const body = [...yaml.matchAll(/script: \|\n((?: {12}[^\n]*\n)+)/g)]
      .map(match => match[1]).find(script => script.includes(marker))?.replace(/^ {12}/gm, '');
    assert.ok(body);
    assert.ok(yaml.indexOf(marker) < yaml.indexOf('uses: actions/checkout'));
    const fixture = () => ({ context: { repo: { owner: 'miracleqihe', repo: 'symgene' },
      ref: 'refs/heads/main', eventName: 'workflow_dispatch', sha: H, runId: 42 },
    env: { GITHUB_WORKFLOW_REF: `${repo.full_name}/.github/workflows/${name}@refs/heads/main`, GITHUB_RUN_ATTEMPT: '2' },
    branch: { commit: { sha: H } } });
    const execute = fixture => runInNewContext('(async () => {' + body + '})()', {
      context: fixture.context, process: { env: fixture.env }, core: { setOutput: () => {} },
      github: { rest: { repos: { getBranch: async () => ({ data: fixture.branch }) } } },
    }, { timeout: 500 });
    await execute(fixture());
    const mutations = [fixture => fixture.context.repo.owner = 'example-other',
      fixture => fixture.context.ref = 'refs/heads/feature/example',
      fixture => fixture.context.eventName = 'pull_request', fixture => fixture.env.GITHUB_WORKFLOW_REF = 'wrong',
      fixture => fixture.branch.commit.sha = B];
    if (name === 'deploy-pages.yml') mutations.push(fixture => fixture.context.runId = 0,
      fixture => fixture.env.GITHUB_RUN_ATTEMPT = '0');
    if (name === 'publication-policy.yml') {
      const target = fixture(); target.context.eventName = 'pull_request_target';
      target.context.payload = { pull_request: { base: { sha: H } } }; await execute(target);
      target.context.payload.pull_request.base.sha = B; await assert.rejects(execute(target), /TRUSTED_AUDIT_BASE_CHANGED/);
    }
    for (const mutate of mutations) { const f = fixture(); mutate(f); await assert.rejects(execute(f)); }
  }
});

// Execute the shipped inline deployment guard, with the same env/API surfaces.
// This deliberately does not substitute the separately tested policy helper.
test('actual deploy-pages inline guard rejects environment, stale artifact, attempt, SHA drift and missing authorization', async () => {
  const yaml = readFileSync(join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
  assert.match(yaml.slice(yaml.indexOf('\n  deploy:')), /environment:\n      name: github-pages/);
  const body = [...yaml.matchAll(/script: \|\n((?: {12}[^\n]*\n)+)/g)].map(m => m[1]).find(s => s.includes('const expectedName'))?.replace(/^ {12}/gm, '');
  assert.ok(body);
  const fixture = () => ({ context: { repo: { owner: 'miracleqihe', repo: 'symgene' }, ref: 'refs/heads/main', eventName: 'workflow_dispatch', sha: H, runId: 42 },
    env: { ARTIFACT_ID: '500', ARTIFACT_DIGEST: artifact().expectedDigest, AUTHORIZED_SHA: H, EXPECTED_ENVIRONMENT: 'github-pages',
      GITHUB_WORKFLOW_REF: `${repo.full_name}/.github/workflows/deploy-pages.yml@refs/heads/main`, GITHUB_RUN_ATTEMPT: '2',
      NEEDS_JSON: JSON.stringify({ authorization: { result: 'success' }, verify: { result: 'success',
        outputs: { legacy_status: 'LEGACY_ENGINEERING_ELIGIBLE' } }, gate: { result: 'success' } }) },
    branch: { commit: { sha: H } }, run: artifact().run, artifact: artifact().artifact });
  const execute = f => runInNewContext('(async () => { ' + body + ' })()', { context: f.context, process: { env: f.env },
    github: { rest: { repos: { getBranch: async () => ({ data: f.branch }) }, actions: {
      getWorkflowRun: async () => ({ data: f.run }), getArtifact: async () => ({ data: f.artifact }), listWorkflowRunArtifacts: () => {},
    } }, paginate: async () => f.artifacts || [f.artifact] } }, { timeout: 500 });
  await execute(fixture());
  for (const mutate of [f => f.env.EXPECTED_ENVIRONMENT = 'alternate', f => f.artifact.name = 'github-pages-42-1',
    f => f.run.run_attempt = 1, f => f.branch.commit.sha = B, f => f.env.AUTHORIZED_SHA = B,
    f => f.env.NEEDS_JSON = '{}', f => f.artifact.expired = null, f => f.context.eventName = 'pull_request',
    f => f.artifact.id++, f => f.artifact.workflow_run.id++, f => f.run.id++,
    f => f.artifact.digest = 'sha256:' + 'e'.repeat(64), f => f.env.ARTIFACT_ID = '-1',
    f => f.env.GITHUB_WORKFLOW_REF = 'wrong', f => f.context.ref = 'refs/heads/dev',
    f => f.run.path = '.github/workflows/ci.yml', f => f.env.GITHUB_RUN_ATTEMPT = '0',
    f => f.artifacts = [f.artifact, clone(f.artifact)],
    f => f.artifacts = [{ ...f.artifact, id: 501 }]]) {
    const f = fixture(); mutate(f); await assert.rejects(execute(f));
  }
  for (const name of ['authorization', 'verify', 'gate']) for (const result of ['skipped', 'failure', 'cancelled', 'neutral', undefined]) {
    const f = fixture(), needs = JSON.parse(f.env.NEEDS_JSON); needs[name].result = result;
    f.env.NEEDS_JSON = JSON.stringify(needs); await assert.rejects(execute(f));
  }
  const noLegacy = fixture(), needs = JSON.parse(noLegacy.env.NEEDS_JSON); delete needs.verify.outputs;
  noLegacy.env.NEEDS_JSON = JSON.stringify(needs); await assert.rejects(execute(noLegacy), /LEGACY_ELIGIBILITY_MISSING/);
  rejects(() => productionGate({ ...context(), ref: 'refs/heads/feature/example' }), 'DEPLOY_REF_REJECTED');
});
