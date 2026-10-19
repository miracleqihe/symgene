import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicationDecision } from '../scripts/local-content/check-publication.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));

test('legacy adoption, valid integrity and templates cannot approve public output', () => {
  const decision = publicationDecision();
  assert.equal(decision.status, 'BLOCKED');
  assert.equal(decision.code, 'LEGACY_PUBLICATION_APPROVAL_NOT_BOUND');
  assert.equal(decision.entries.drugs, 114);
  assert.ok(decision.scope.some(item => item.includes('Prompt')));
  const copy = mkdtempSync(join(tmpdir(), 'symgen-publication-'));
  try {
    const lock = JSON.parse(readFileSync(join(root, 'legacy-content.lock')));
    for (const row of lock.files) {
      const target = join(copy, row.path); mkdirSync(join(target, '..'), { recursive: true });
      cpSync(join(root, row.path), target);
    }
    mkdirSync(join(copy, 'vendor/local-content'), { recursive: true });
    cpSync(join(root, 'vendor/local-content/legacy-snapshot.mjs'), join(copy, 'vendor/local-content/legacy-snapshot.mjs'));
    cpSync(join(root, 'content-pack.lock'), join(copy, 'content-pack.lock'));
    writeFileSync(join(copy, 'legacy-content.lock'), JSON.stringify({ ...lock,
      publication: 'approved', medicalApproval: 'approved', rightsApproval: 'approved', approved: true }));
    assert.equal(publicationDecision(copy).status, 'BLOCKED');
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
