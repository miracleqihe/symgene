import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prIdentity, fail, REPOSITORY } from './policy.mjs';

export function recordCiEvidence(env = process.env, git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()) {
  if (env.GITHUB_REPOSITORY !== REPOSITORY) fail('CI_REPOSITORY_REJECTED');
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  const checkoutSha = git('rev-parse', 'HEAD');
  if (checkoutSha !== env.GITHUB_SHA) fail('CI_CHECKOUT_SHA_MISMATCH');
  let identity;
  if (env.GITHUB_EVENT_NAME === 'pull_request') {
    const pull = event.pull_request;
    const parents = git('show', '-s', '--format=%P', 'HEAD').split(' ').map(sha => ({ sha }));
    // Webhook merge_commit_sha can be null/stale while GitHub computes mergeability.
    // The tested candidate is the actual checkout, not that asynchronous field.
    identity = prIdentity({ eventPr: pull, pull: { ...pull, merge_commit_sha: checkoutSha }, currentBaseSha: pull.base.sha, checkoutSha,
      merge: { sha: checkoutSha, parents } });
  } else {
    const branchRef = /^refs\/heads\/[^\s\x00-\x1f]+$/.test(env.GITHUB_REF ?? '');
    if (!(env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/dev')
      && !(env.GITHUB_EVENT_NAME === 'workflow_dispatch' && branchRef)) fail('CI_EVENT_REJECTED');
    identity = { repository: REPOSITORY, headSha: checkoutSha, baseSha: null, mergeSha: null };
  }
  return { ...identity, checkoutSha, eventName: env.GITHUB_EVENT_NAME,
    workflowRef: env.GITHUB_WORKFLOW_REF, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
    authority: 'engineering-evidence-only-not-content-approval' };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const evidence = recordCiEvidence();
    const target = resolve('work/security/ci-identity.json');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify(evidence));
  } catch (error) { console.error(JSON.stringify({ status: 'FAIL', code: error.code || 'CI_IDENTITY_FAILED' })); process.exitCode = 1; }
}
