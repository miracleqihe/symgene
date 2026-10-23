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

const forgedApprovalEnvironment = {
  ...process.env,
  PUBLICATION_APPROVED: 'true', LEGACY_PUBLICATION_APPROVED: 'true',
  MEDICAL_APPROVAL: 'approved', PUBLIC_LANGUAGE_APPROVAL: 'approved', RIGHTS_APPROVAL: 'approved',
  SKIP_PUBLICATION_CHECK: 'true', NODE_ENV: 'production',
};

function runPublicationCli(copy, env = forgedApprovalEnvironment) {
  return spawnSync(process.execPath, ['scripts/local-content/check-publication.mjs'], {
    cwd: copy, env, encoding: 'utf8', timeout: 30_000,
  });
}

function assertBlocked(result, code = 'LEGACY_PUBLICATION_APPROVAL_NOT_BOUND') {
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const decision = JSON.parse(result.stderr);
  assert.equal(decision.status, 'BLOCKED');
  assert.equal(decision.code, code);
  return decision;
}

test('legacy adoption, valid integrity and templates cannot approve public output', () => {
  const decision = publicationDecision();
  assert.equal(decision.status, 'BLOCKED');
  assert.equal(decision.code, 'LEGACY_PUBLICATION_APPROVAL_NOT_BOUND');
  assert.equal(decision.entries.drugs, 114);
  assert.ok(decision.scope.some(item => item.includes('Prompt')));
  assert.deepEqual(decision.requiredReviews, ['medical', 'public-language', 'rights']);
  const copy = publicationFixture();
  try {
    const lock = JSON.parse(readFileSync(join(root, 'legacy-content.lock')));
    writeFileSync(join(copy, 'legacy-content.lock'), JSON.stringify({ ...lock,
      publication: 'approved', medicalApproval: 'approved', publicLanguageApproval: 'approved',
      rightsApproval: 'approved', approved: true }));
    mkdirSync(join(copy, 'docs/acceptance'), { recursive: true });
    writeFileSync(join(copy, 'docs/acceptance/content-review-register.template.json'),
      JSON.stringify({ approved: true, reviewer: 'Fictional Example Reviewer',
        medical: 'approved', publicLanguage: 'approved', rights: 'approved', digest: lock.digest }));
    assert.equal(publicationDecision(copy).status, 'BLOCKED');
    const rejected = assertBlocked(runPublicationCli(copy));
    assert.equal(rejected.qualifiedApprovalRecords, 'not_bound_to_current_output');
    assert.equal(rejected.snapshotDigest, lock.digest);
  } finally { rmSync(copy, { recursive: true, force: true }); }
});

test('real publication CLI refuses main push and manual-event spoofing despite approval environment flags', () => {
  for (const event of ['push', 'workflow_dispatch']) {
    const decision = assertBlocked(runPublicationCli(root, { ...forgedApprovalEnvironment,
      GITHUB_REF: 'refs/heads/main', GITHUB_REF_NAME: 'main', GITHUB_BASE_REF: 'main',
      GITHUB_HEAD_REF: 'dev', GITHUB_EVENT_NAME: event, CI: 'true', GITHUB_ACTIONS: 'true' }));
    assert.deepEqual(decision.scope, ['runtime pages and bundled medical text',
      'teaching Markdown and entry Prompts', 'global/module Agent guides',
      'portable Skill', 'llms.txt and manifests']);
  }
});

test('real release build refuses unapproved content before generating or bundling any output', () => {
  const copy = publicationFixture();
  try {
    const npmArgs = ['run', 'build:release'];
    const npmCli = process.env.npm_execpath;
    const result = spawnSync(npmCli ? process.execPath : 'npm', npmCli ? [npmCli, ...npmArgs] : npmArgs, {
      cwd: copy, env: forgedApprovalEnvironment, encoding: 'utf8', timeout: 30_000,
      shell: !npmCli && process.platform === 'win32',
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /> npm run check:publication && npm run build/);
    assert.match(result.stderr, /"status": "BLOCKED"/);
    assert.match(result.stderr, /LEGACY_PUBLICATION_APPROVAL_NOT_BOUND/);
    assert.doesNotMatch(result.stdout, /> npm run check:content|> node scripts\/build-teaching-materials|vite build/);
    for (const output of ['dist', 'public/teaching', 'public/agent', 'public/skills', 'public/llms.txt']) {
      assert.equal(existsSync(join(copy, output)), false, `release generated ${output}`);
    }
  } finally { rmSync(copy, { recursive: true, force: true }); }
});

test('publication CLI fails closed for content drift and changed T02 adoption', () => {
  const copy = publicationFixture();
  try {
    const seedPath = join(copy, 'src/content/knowledge.json');
    const seed = readFileSync(seedPath);
    writeFileSync(seedPath, Buffer.concat([seed, Buffer.from('\n')]));
    assertBlocked(runPublicationCli(copy), 'LEGACY_VENDOR_DRIFT');
    writeFileSync(seedPath, seed);
    const adoptionPath = join(copy, 'content-pack.lock');
    const adoption = JSON.parse(readFileSync(adoptionPath));
    writeFileSync(adoptionPath, JSON.stringify({ ...adoption, adoption: 'approved', scope: 'production' }));
    assertBlocked(runPublicationCli(copy), 'LEGACY_ADOPTION_CHANGED');
  } finally { rmSync(copy, { recursive: true, force: true }); }
});

test('deployment gates both push and manual builds before upload, while preview builds remain usable', () => {
  const workflow = readFileSync(join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
  const gate = workflow.indexOf('npm run check:publication');
  assert.ok(gate > workflow.indexOf('npm ci'));
  assert.ok(gate < workflow.indexOf('actions/upload-artifact'));
  assert.doesNotMatch(workflow.slice(gate - 40, gate + 100), /continue-on-error|if:/);
  const manifest = JSON.parse(readFileSync(join(root, 'package.json')));
  assert.match(manifest.scripts['build:release'], /^npm run check:publication && npm run build$/);
  assert.doesNotMatch(manifest.scripts.build, /check:publication/);
});
