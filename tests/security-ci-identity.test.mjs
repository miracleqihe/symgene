import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { recordCiEvidence } from '../scripts/security/record-ci-evidence.mjs';

const H = 'a'.repeat(40), B = 'b'.repeat(40), M = 'c'.repeat(40);
const repo = { id: 1315877631, full_name: 'miracleqihe/symgene' };
function fixture(eventName = 'pull_request', reportedMerge = null) {
  const dir = mkdtempSync(join(tmpdir(), 'symgene-ci-identity-'));
  const eventPath = join(dir, 'event.json');
  writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 7,
    base: { ref: 'dev', sha: B, repo }, head: { ref: 'feature/example', sha: H, repo },
    merge_commit_sha: reportedMerge } }));
  return { dir, env: { GITHUB_REPOSITORY: repo.full_name, GITHUB_REPOSITORY_ID: String(repo.id), GITHUB_EVENT_PATH: eventPath,
    GITHUB_SHA: M, GITHUB_EVENT_NAME: eventName, GITHUB_REF: 'refs/heads/feature/example',
    GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '1' } };
}
const git = (...args) => args[0] === 'rev-parse' ? M : `${B} ${H}`;

test('local diagnostics record actual checkout and ordered parents despite null or stale webhook metadata', () => {
  for (const reportedMerge of [null, B, M]) {
    const f = fixture('pull_request', reportedMerge);
    try {
      const result = recordCiEvidence(f.env, git);
      assert.equal(result.checkoutSha, M); assert.equal(result.mergeSha, M);
      assert.equal(result.headSha, H); assert.equal(result.baseSha, B);
    } finally { rmSync(f.dir, { recursive: true, force: true }); }
  }
});

test('wrong checkout or wrong ordered parents still fail even if webhook merge metadata looks valid', () => {
  const f = fixture('pull_request', M);
  try {
    assert.throws(() => recordCiEvidence(f.env, () => B), e => e.code === 'CI_CHECKOUT_SHA_MISMATCH');
    assert.throws(() => recordCiEvidence(f.env, (...args) => args[0] === 'rev-parse' ? M : `${H} ${B}`),
      e => e.code === 'PR_MERGE_MISMATCH');
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('read-only engineering dispatch on a topic branch remains usable and never becomes PR approval', () => {
  const f = fixture('workflow_dispatch');
  try {
    const result = recordCiEvidence(f.env, git);
    assert.equal(result.headSha, M); assert.equal(result.baseSha, null); assert.equal(result.mergeSha, null);
    assert.equal(result.eventName, 'workflow_dispatch');
    assert.equal(result.authority, 'untrusted-diagnostic-only-not-independent-ci-proof-or-content-approval');
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});


test('local diagnostic rejects absent or wrong numeric repository identity', () => {
  const f = fixture();
  try {
    for (const id of [undefined, '1', 'NaN']) {
      assert.throws(() => recordCiEvidence({ ...f.env, GITHUB_REPOSITORY_ID: id }, git), { code: 'CI_REPOSITORY_REJECTED' });
    }
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});
