// Engineering policy only. This module does not define a content signature contract.
export const REPOSITORY = 'miracleqihe/symgene';
export const ACTIONS_APP_ID = 15368;
export const CI_PATH = '.github/workflows/ci.yml';
export const CI_JOBS = ['Commit identity', 'Branch policy', 'Verify', 'Content integration', 'Engineering gate'];
export const fail = code => { throw Object.assign(new Error(code), { code }); };
const requireThat = (value, code) => { if (!value) fail(code); };
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

export function successfulNeeds(needs, expected) {
  requireThat(needs && expected.length > 0, 'UPSTREAM_RESULTS_MISSING');
  for (const name of expected) requireThat(needs[name]?.result === 'success', 'UPSTREAM_NOT_SUCCESS');
  return { status: 'PASS', jobs: expected };
}

export function prIdentity({ eventPr, pull, merge, currentBaseSha, checkoutSha }) {
  requireThat(pull?.base?.repo?.full_name === REPOSITORY, 'PR_REPOSITORY_MISMATCH');
  requireThat(Number.isSafeInteger(pull.base.repo.id) && pull.base.repo.id > 0
    && Number.isSafeInteger(pull.head?.repo?.id) && pull.head.repo.id > 0
    && eventPr?.base?.repo?.id === pull.base.repo.id && eventPr?.head?.repo?.id === pull.head.repo.id,
  'PR_REPOSITORY_ID_MISMATCH');
  requireThat(['dev', 'main'].includes(pull.base.ref), 'PR_BASE_REJECTED');
  requireThat(sha(pull.head?.sha) && sha(pull.base.sha) && sha(pull.merge_commit_sha), 'PR_SHA_MISSING');
  requireThat(eventPr?.number === pull.number && eventPr.head?.sha === pull.head.sha
    && eventPr.base?.sha === pull.base.sha, 'PR_EVENT_STALE');
  requireThat(currentBaseSha === pull.base.sha, 'PR_BASE_STALE');
  requireThat(merge?.sha === pull.merge_commit_sha && merge.parents?.length === 2
    && merge.parents[0].sha === pull.base.sha && merge.parents[1].sha === pull.head.sha, 'PR_MERGE_MISMATCH');
  if (checkoutSha !== undefined) requireThat(checkoutSha === merge.sha, 'PR_CHECKOUT_MISMATCH');
  if (pull.base.ref === 'main') requireThat(pull.head.ref === 'dev'
    && pull.head.repo?.full_name === REPOSITORY && pull.head.repo.id === pull.base.repo.id, 'MAIN_PROMOTION_SOURCE_REJECTED');
  return { repository: REPOSITORY, number: pull.number, headSha: pull.head.sha,
    baseSha: pull.base.sha, mergeSha: merge.sha, baseRef: pull.base.ref };
}

// Inputs must be collected from GitHub by the trusted base workflow, not PR JSON.
export function independentReview({ pull, reviews, permissions, threads }) {
  requireThat(Array.isArray(reviews) && Array.isArray(threads), 'REVIEW_EVIDENCE_MISSING');
  requireThat(threads.every(thread => thread.isResolved === true), 'REVIEW_THREAD_UNRESOLVED');
  const latest = new Map();
  for (const review of [...reviews].sort((a, b) => a.id - b.id)) {
    // COMMENTED does not dismiss an earlier decision. DISMISSED does.
    if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)) latest.set(review.user?.login, review);
  }
  requireThat(![...latest.values()].some(r => r.state === 'CHANGES_REQUESTED' && r.user?.type === 'User'
    && ['write', 'maintain', 'admin'].includes(permissions?.[r.user.login])), 'REVIEW_CHANGES_REQUESTED');
  const qualified = [...latest.values()].filter(review => review.state === 'APPROVED'
    && review.commit_id === pull.head.sha && review.user?.type === 'User'
    && review.user.login !== pull.user?.login
    && ['write', 'maintain', 'admin'].includes(permissions?.[review.user.login]));
  requireThat(qualified.length > 0, 'INDEPENDENT_CURRENT_REVIEW_REQUIRED');
  // Existing CODEOWNERS designates this real owner. Do not invent another person.
  if (pull.base.ref === 'main') requireThat(qualified.some(r => r.user.login === 'miracleqihe'), 'MAIN_OWNER_REVIEW_REQUIRED');
  return { status: 'PASS', reviewIds: qualified.map(r => r.id), headSha: pull.head.sha };
}

export function trustedChecks({ pull, run, jobs, checks, baseWorkflowBlob, headWorkflowBlob }) {
  requireThat(sha(baseWorkflowBlob) && baseWorkflowBlob === headWorkflowBlob, 'CI_WORKFLOW_NOT_FROM_TRUSTED_BASE');
  requireThat(run?.repository?.full_name === REPOSITORY && run.event === 'pull_request'
    && run.path === CI_PATH && run.head_sha === pull.head.sha && run.status === 'completed'
    && run.conclusion === 'success' && Number.isSafeInteger(run.id), 'CI_RUN_IDENTITY_REJECTED');
  for (const name of CI_JOBS) {
    const matching = jobs?.filter(job => job.name === name) ?? [];
    requireThat(matching.length === 1 && matching[0].run_id === run.id
      && matching[0].status === 'completed' && matching[0].conclusion === 'success', 'CI_JOB_NOT_SUCCESS');
    const matchingChecks = checks?.filter(check => check.id === matching[0].id) ?? [];
    requireThat(matchingChecks.length === 1 && matchingChecks[0].name === name
      && matchingChecks[0].head_sha === pull.head.sha && matchingChecks[0].app?.id === ACTIONS_APP_ID
      && matchingChecks[0].check_suite?.id === run.check_suite_id
      && matchingChecks[0].status === 'completed' && matchingChecks[0].conclusion === 'success', 'CI_CHECK_SOURCE_REJECTED');
  }
  return { status: 'PASS', runId: run.id, headSha: run.head_sha, workflowBlob: baseWorkflowBlob };
}

export function deploymentIdentity(context) {
  requireThat(context.repository === REPOSITORY, 'DEPLOY_REPOSITORY_REJECTED');
  requireThat(['push', 'workflow_dispatch'].includes(context.eventName), 'DEPLOY_EVENT_REJECTED');
  requireThat(context.ref === 'refs/heads/main', 'DEPLOY_REF_REJECTED');
  requireThat(context.environment === 'github-pages', 'DEPLOY_ENVIRONMENT_REJECTED');
  requireThat(context.workflowRef === `${REPOSITORY}/.github/workflows/deploy-pages.yml@refs/heads/main`, 'DEPLOY_WORKFLOW_REJECTED');
  requireThat(sha(context.sha) && context.checkoutSha === context.sha && context.currentMainSha === context.sha, 'DEPLOY_SHA_MISMATCH');
  requireThat(Number.isSafeInteger(context.runId) && context.runId > 0
    && Number.isSafeInteger(context.runAttempt) && context.runAttempt > 0, 'DEPLOY_RUN_REJECTED');
  return { status: 'PASS', sha: context.sha, runId: context.runId, runAttempt: context.runAttempt };
}

export function deploymentArtifact({ context, run, artifact, expectedId, expectedDigest }) {
  deploymentIdentity(context);
  requireThat(run?.id === context.runId && run.run_attempt === context.runAttempt
    && run.head_sha === context.sha && run.head_branch === 'main' && run.event === context.eventName
    && run.path === '.github/workflows/deploy-pages.yml'
    && run.repository?.full_name === REPOSITORY, 'ARTIFACT_RUN_MISMATCH');
  requireThat(Number.isSafeInteger(expectedId) && expectedId > 0 && artifact?.id === expectedId
    && artifact.name === `github-pages-${context.runId}-${context.runAttempt}`
    && artifact.expired === false && artifact.workflow_run?.id === context.runId
    && artifact.workflow_run?.head_sha === context.sha && artifact.workflow_run?.head_branch === 'main', 'ARTIFACT_IDENTITY_REJECTED');
  requireThat(typeof expectedDigest === 'string' && /^sha256:[a-f0-9]{64}$/.test(expectedDigest)
    && artifact.digest === expectedDigest, 'ARTIFACT_DIGEST_MISMATCH');
  return { status: 'PASS', artifactId: artifact.id, digest: artifact.digest };
}

// No existing authenticated approval source covers these exact public outputs.
// Deliberately accept no flag, local approval template, new signature, or bypass.
export function publicationAuthority() {
  return { status: 'BLOCKED', code: 'PUBLICATION_AUTHORITY_NOT_CONFIGURED',
    reason: 'Existing authenticated content contracts are unchanged; exact-output medical, rights, public-language, privacy and G2-G5 approval is not configured.' };
}
