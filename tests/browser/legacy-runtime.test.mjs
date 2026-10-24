import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync, existsSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { verifyProductionRuntime } from '../../scripts/security/verify-production-runtime.mjs';
import { checkLegacyRuntime, checkLegacyRuntimeExecution } from '../../scripts/security/legacy-runtime.mjs';
import { legacyReleaseEligibility } from '../../scripts/security/policy.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
test('real Chromium verifies the actual production entry before legacy eligibility; T02 and deployment remain unauthorized', async () => {
  const receipt = await verifyProductionRuntime(ROOT);
  assert.equal(receipt.status, 'LEGACY_RUNTIME_EXECUTED');
  const decision = legacyReleaseEligibility({ root: ROOT });
  assert.equal(decision.status, 'LEGACY_ENGINEERING_ELIGIBLE');
  assert.equal(decision.medicalApproval, 'not_asserted'); assert.equal(decision.rightsApproval, 'not_asserted');
  assert.equal(decision.productionDeployment, 'not_authorized');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const temp = mkdtempSync(join(tmpdir(), 'symgene-runtime-cli-')), output = join(temp, 'outputs');
  try {
    writeFileSync(output, '');
    const result = spawnSync(process.execPath, [join(ROOT, 'scripts/security/production-gate.mjs')], { cwd: ROOT,
      encoding: 'utf8', timeout: 30_000, env: { PATH: process.env.PATH,
        GITHUB_REPOSITORY: 'miracleqihe/symgene', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
        EXPECTED_ENVIRONMENT: 'github-pages', GITHUB_WORKFLOW_REF: 'miracleqihe/symgene/.github/workflows/deploy-pages.yml@refs/heads/main',
        GITHUB_SHA: head, CURRENT_MAIN_SHA: head, GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '2', GITHUB_OUTPUT: output } });
    assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(output, 'utf8'), /^legacy_status=LEGACY_ENGINEERING_ELIGIBLE\nformal_t02_status=T02_FORMAL_ADOPTION_BLOCKED\n$/);
    assert.equal(JSON.parse(result.stdout).formalT02Adoption.status, 'T02_FORMAL_ADOPTION_BLOCKED');
    const path = join(ROOT, 'dist/.symgene-runtime-browser.json'), original = readFileSync(path);
    const htmlPath = join(ROOT, 'dist/index.html'), html = readFileSync(htmlPath);
    try {
      writeFileSync(htmlPath, html.toString() + '<!-- drift -->');
      await assert.rejects(verifyProductionRuntime(ROOT), { code: 'PRODUCTION_OUTPUT_DRIFT' });
      assert.equal(existsSync(path), false, 'failed re-verification must remove a stale success receipt');
    } finally { writeFileSync(htmlPath, html); writeFileSync(path, original); }
    for (const override of [{ artifactDigest: '0'.repeat(64) }, { sourceEvidenceDigest: '0'.repeat(64) },
      { medicalApproval: 'approved' }, { rightsApproval: 'approved' }, { t02Requests: 1 }, { readOnly: false },
      { runtimeErrors: 1 }, { unexpectedRequests: 1 }, { counts: {} }, { counts: { ...receipt.counts, drugs: 1 } }]) {
      try {
        writeFileSync(path, JSON.stringify({ ...receipt, ...override }));
        assert.throws(() => legacyReleaseEligibility({ root: ROOT }), { code: 'PRODUCTION_RUNTIME_EXECUTION_REJECTED' });
      } finally { writeFileSync(path, original); }
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('closure drift and forged receipts are rejected against the real built evidence', () => {
  // Runs in the browser CI step after the real build + browser execution above, so the
  // full dist evidence and a genuine receipt exist. Mirrors the two dist-dependent
  // scenarios of tests/security-production-closure.test.mjs with real artifacts.
  const mkdtemp = mkdtempSync(join(tmpdir(), 'symgen-closure-browser-'));
  try {
    const copy = mkdtemp;
    for (const entry of ['scripts', 'src', 'vendor', 'package.json', 'package-lock.json', 'legacy-content.lock',
      'content-pack.lock', 'index.html', 'vite.config.js']) {
      cpSync(join(ROOT, entry), join(copy, entry), { recursive: true });
    }
    const closurePath = join(copy, 'scripts/security/production-closure.json');
    const parsed = JSON.parse(readFileSync(closurePath, 'utf8'));
    writeFileSync(closurePath, JSON.stringify({ ...parsed, allowedPackages: [...parsed.allowedPackages, 'attacker-pack'] }));
    assert.throws(() => checkLegacyRuntime(copy, { distDir: join(ROOT, 'dist') }),
      error => ['PRODUCTION_CLOSURE_DRIFT', 'PRODUCTION_SOURCE_DRIFT'].includes(error.code));

    const receiptPath = join(ROOT, 'dist/.symgene-runtime-browser.json');
    const original = readFileSync(receiptPath, 'utf8');
    try {
      const forged = { ...JSON.parse(original), artifactDigest: '0'.repeat(64), status: 'LEGACY_RUNTIME_EXECUTED' };
      writeFileSync(receiptPath, JSON.stringify(forged));
      assert.throws(() => checkLegacyRuntimeExecution(ROOT), { code: 'PRODUCTION_RUNTIME_EXECUTION_REJECTED' });
      const claimed = { ...JSON.parse(original), productionDeployment: 'authorized', medicalApproval: 'approved', t02Requests: 5 };
      writeFileSync(receiptPath, JSON.stringify(claimed));
      assert.throws(() => checkLegacyRuntimeExecution(ROOT), { code: 'PRODUCTION_RUNTIME_EXECUTION_REJECTED' });
    } finally { writeFileSync(receiptPath, original); }
  } finally { rmSync(mkdtemp, { recursive: true, force: true }); }
});
