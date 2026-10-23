import { execFileSync } from 'node:child_process';
import { appendFileSync, realpathSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { deploymentIdentity, legacyReleaseEligibility, formalT02AdoptionAuthority } from './policy.mjs';

export function productionGate(context, options = {}) {
  const identity = deploymentIdentity(context);
  return { ...legacyReleaseEligibility(options), identity, formalT02Adoption: formalT02AdoptionAuthority() };
}

if (process.argv[1] && existsSync(process.argv[1]) && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  try {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    // Git must inspect this module's checkout, regardless of the caller's cwd
    // or Git environment overrides. Generated dist/public files stay ignored.
    const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
    const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: gitEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    const context = { repository: process.env.GITHUB_REPOSITORY,
      eventName: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF,
      environment: process.env.EXPECTED_ENVIRONMENT,
      workflowRef: process.env.GITHUB_WORKFLOW_REF,
      sha: process.env.GITHUB_SHA, checkoutSha: git(['rev-parse', 'HEAD']).trim(),
      currentMainSha: process.env.CURRENT_MAIN_SHA,
      runId: Number(process.env.GITHUB_RUN_ID), runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT) };
    deploymentIdentity(context);
    if (realpathSync(git(['rev-parse', '--show-toplevel']).trim()) !== realpathSync(root)) {
      throw Object.assign(new Error('PRODUCTION_CHECKOUT_ROOT_MISMATCH'), { code: 'PRODUCTION_CHECKOUT_ROOT_MISMATCH' });
    }
    let dirty = false;
    try { git(['diff', '--quiet', 'HEAD', '--']); }
    catch (error) { if (error.status !== 1) throw error; dirty = true; }
    if (dirty || git(['ls-files', '--others', '--exclude-standard', '-z']).length > 0) {
      throw Object.assign(new Error('PRODUCTION_CHECKOUT_DIRTY'), { code: 'PRODUCTION_CHECKOUT_DIRTY' });
    }
    const result = productionGate(context);
    if (result.status !== 'LEGACY_ENGINEERING_ELIGIBLE') throw Object.assign(new Error('LEGACY_NOT_ELIGIBLE'), { code: 'LEGACY_NOT_ELIGIBLE' });
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
      `legacy_status=${result.status}\nformal_t02_status=${result.formalT02Adoption.status}\n`);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({ status: 'BLOCKED', code: error.code || 'PRODUCTION_GATE_FAILED' }));
    process.exitCode = 1;
  }
}
