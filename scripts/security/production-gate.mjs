import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deploymentIdentity, publicationAuthority } from './policy.mjs';

export function productionGate(context) {
  deploymentIdentity(context);
  return publicationAuthority();
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = productionGate({ repository: process.env.GITHUB_REPOSITORY,
      eventName: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF,
      environment: 'github-pages', workflowRef: process.env.GITHUB_WORKFLOW_REF,
      sha: process.env.GITHUB_SHA, checkoutSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      currentMainSha: process.env.CURRENT_MAIN_SHA,
      runId: Number(process.env.GITHUB_RUN_ID), runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT) });
    console.error(JSON.stringify(result));
  } catch (error) { console.error(JSON.stringify({ status: 'BLOCKED', code: error.code || 'PRODUCTION_GATE_FAILED' })); }
  process.exitCode = 1;
}
