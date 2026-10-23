import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicationDecision } from '../scripts/local-content/check-publication.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));

function publicationFixture() {
  const copy = mkdtempSync(join(tmpdir(), 'symgen-publication-'));
  const lock = JSON.parse(readFileSync(join(root, 'legacy-content.lock')));
  for (const path of [...lock.files.map(row => row.path), 'legacy-content.lock',
    'vendor/local-content/legacy-snapshot.mjs', 'content-pack.lock', 'package.json',
    'scripts/local-content/check-legacy.mjs', 'scripts/local-content/check-publication.mjs']) {
    const target = join(copy, path);
    mkdirSync(join(target, '..'), { recursive: true });
    cpSync(join(root, path), target);
  }
  return copy;
}

const fakeApprovalEnvironment = {
  ...process.env,
  PUBLICATION_APPROVED: 'true', LEGACY_PUBLICATION_APPROVED: 'true',
  MEDICAL_APPROVAL: 'approved', PUBLIC_LANGUAGE_APPROVAL: 'approved', RIGHTS_APPROVAL: 'approved',
  SKIP_PUBLICATION_CHECK: 'true', NODE_ENV: 'production',
};

function runPublicationCli(copy, env = process.env) {
  return spawnSync(process.execPath, ['scripts/local-content/check-publication.mjs'], {
    cwd: copy, env, encoding: 'utf8', timeout: 30_000,
  });
}

function assertRejected(result, code) {
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const decision = JSON.parse(result.stderr);
  assert.equal(decision.status, 'REJECTED');
  assert.equal(decision.code, code);
}

test('valid legacy output follows standard releases without claiming clinical approval', () => {
  const decision = publicationDecision();
  assert.equal(decision.status, 'INTEGRITY_VERIFIED');
  assert.equal(decision.code, 'LEGACY_RELEASE_INTEGRITY_VERIFIED');
  assert.equal(decision.entries.drugs, 114);
  assert.ok(decision.scope.some(item => item.includes('Prompt')));
  assert.equal(decision.releasePolicy, 'standard_repository_workflow');
  assert.equal(decision.clinicalApproval, 'not_asserted');
  assert.equal(decision.formalT02Adoption, 'unchanged');
  assert.equal(Object.hasOwn(decision, 'requiredReviews'), false);
  for (const event of ['push', 'workflow_dispatch']) {
    const result = runPublicationCli(root, { ...process.env,
      GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: event });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), decision);
  }
});

test('approval flags and review templates neither claim approval nor bypass integrity', () => {
  const copy = publicationFixture();
  try {
    const expected = publicationDecision(copy);
    const lock = JSON.parse(readFileSync(join(copy, 'legacy-content.lock')));
    writeFileSync(join(copy, 'legacy-content.lock'), JSON.stringify({ ...lock,
      medicalApproval: 'approved', publicLanguageApproval: 'approved', rightsApproval: 'approved' }));
    mkdirSync(join(copy, 'docs/acceptance'), { recursive: true });
    writeFileSync(join(copy, 'docs/acceptance/content-review-register.template.json'),
      JSON.stringify({ approved: true, reviewer: 'Fictional Example Reviewer', digest: lock.digest }));
    const result = runPublicationCli(copy, fakeApprovalEnvironment);
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), expected);
    const seedPath = join(copy, 'src/content/knowledge.json');
    const seed = readFileSync(seedPath);
    writeFileSync(seedPath, '{}');
    assertRejected(runPublicationCli(copy, fakeApprovalEnvironment), 'SNAPSHOT_COUNT_DROP');
    writeFileSync(seedPath, Buffer.concat([seed, Buffer.from('\n')]));
    assertRejected(runPublicationCli(copy, fakeApprovalEnvironment), 'LEGACY_VENDOR_DRIFT');
  } finally { rmSync(copy, { recursive: true, force: true }); }
});

test('release builds still stop content drift before generating or bundling output', () => {
  const copy = publicationFixture();
  try {
    const seedPath = join(copy, 'src/content/knowledge.json');
    writeFileSync(seedPath, Buffer.concat([readFileSync(seedPath), Buffer.from('\n')]));
    const npmArgs = ['run', 'build:release'];
    const npmCli = process.env.npm_execpath;
    const result = spawnSync(npmCli ? process.execPath : 'npm', npmCli ? [npmCli, ...npmArgs] : npmArgs, {
      cwd: copy, env: fakeApprovalEnvironment, encoding: 'utf8', timeout: 30_000,
      shell: !npmCli && process.platform === 'win32',
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /> npm run check:publication && npm run build/);
    assert.match(result.stderr, /LEGACY_VENDOR_DRIFT/);
    assert.doesNotMatch(result.stdout, /> npm run check:content|> node scripts\/build-teaching-materials|vite build/);
    for (const output of ['dist', 'public/teaching', 'public/agent', 'public/skills', 'public/llms.txt']) {
      assert.equal(existsSync(join(copy, output)), false, `release generated ${output}`);
    }
  } finally { rmSync(copy, { recursive: true, force: true }); }
});

test('release CLI rejects verifier drift and unauthorized T02 adoption', () => {
  const copy = publicationFixture();
  try {
    const verifierPath = join(copy, 'vendor/local-content/legacy-snapshot.mjs');
    const verifier = readFileSync(verifierPath);
    writeFileSync(verifierPath, Buffer.concat([verifier, Buffer.from('\n')]));
    assertRejected(runPublicationCli(copy, fakeApprovalEnvironment), 'LEGACY_VERIFIER_DRIFT');
    writeFileSync(verifierPath, verifier);
    const adoptionPath = join(copy, 'content-pack.lock');
    const adoption = JSON.parse(readFileSync(adoptionPath));
    writeFileSync(adoptionPath, JSON.stringify({ ...adoption, adoption: 'approved', scope: 'production' }));
    assertRejected(runPublicationCli(copy, fakeApprovalEnvironment), 'LEGACY_ADOPTION_CHANGED');
  } finally { rmSync(copy, { recursive: true, force: true }); }
});

test('CI and deployment verify integrity without the removed review-approval job', () => {
  const workflow = readFileSync(join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
  const gate = workflow.indexOf('npm run check:publication');
  assert.ok(gate > workflow.indexOf('npm ci'));
  assert.ok(gate < workflow.indexOf('actions/upload-artifact'));
  assert.doesNotMatch(workflow.slice(gate - 40, gate + 100), /continue-on-error|if:/);
  const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
  assert.doesNotMatch(ci, /name: Publication approval/);
  assert.match(ci, /name: Publication integrity/);
  const manifest = JSON.parse(readFileSync(join(root, 'package.json')));
  assert.match(manifest.scripts['build:release'], /^npm run check:publication && npm run build$/);
  assert.doesNotMatch(manifest.scripts.build, /check:publication/);
});
