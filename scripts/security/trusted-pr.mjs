import { REPOSITORY, CI_PATH, prIdentity, independentReview, trustedChecks, latestCiRun, parseCiContext, publicationAuthority, fail } from './policy.mjs';

export async function collectReviewThreads({ github, repo, number, maxPages = 100 }) {
  const threads = [], seen = new Set(); let cursor = null;
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    const result = await github.graphql(`query($owner:String!,$name:String!,$number:Int!,$cursor:String){
      repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$cursor){
        nodes{isResolved} pageInfo{hasNextPage endCursor}}}}}`, { owner: repo.owner, name: repo.repo, number, cursor });
    if (result?.errors !== undefined) fail('REVIEW_THREADS_GRAPHQL_ERRORS');
    const page = result?.repository?.pullRequest?.reviewThreads;
    if (!Array.isArray(page?.nodes) || page.nodes.some(node => typeof node?.isResolved !== 'boolean')
      || typeof page.pageInfo?.hasNextPage !== 'boolean') fail('REVIEW_THREADS_INVALID_PAGE');
    threads.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) return threads;
    const next = page.pageInfo.endCursor;
    if (typeof next !== 'string' || !next.trim() || seen.has(next)) fail('REVIEW_THREADS_INVALID_CURSOR');
    seen.add(next); cursor = next;
  }
  fail('REVIEW_THREADS_PAGE_LIMIT');
}

async function reviewSnapshot({ github, repo, pull }) {
  const reviews = await github.paginate(github.rest.pulls.listReviews, { ...repo, pull_number: pull.number, per_page: 100 });
  if (!Array.isArray(reviews)) fail('REVIEW_EVIDENCE_MISSING');
  const permissions = {};
  for (const login of new Set(reviews.filter(r => r.user?.type === 'User').map(r => r.user.login))) {
    const { data } = await github.rest.repos.getCollaboratorPermissionLevel({ ...repo, username: login });
    permissions[login] = data.permission;
  }
  const threads = await collectReviewThreads({ github, repo, number: pull.number });
  // Only an observed enforced native rule can cover GitHub's concept of a
  // "reviewable push". Do not substitute commit attribution or run actor.
  let protection;
  try { ({ data: protection } = await github.rest.repos.getBranchProtection({ ...repo, branch: pull.base.ref })); }
  catch { fail('LAST_PUSH_NATIVE_PROTECTION_UNVERIFIABLE'); }
  const rule = protection?.required_pull_request_reviews;
  const bypass = rule?.bypass_pull_request_allowances;
  const lastPushProtection = rule?.require_last_push_approval === true && rule.required_approving_review_count >= 1
    && protection.enforce_admins?.enabled === true
    && ['users', 'teams', 'apps'].every(key => Array.isArray(bypass?.[key]) && bypass[key].length === 0);
  const decision = independentReview({ pull, reviews, permissions, threads, lastPushProtection });
  return { reviews, permissions, threads, lastPushProtection, decision };
}

const requestRuns = async (github, repo, pull) => latestCiRun(await github.paginate(github.rest.actions.listWorkflowRuns,
  { ...repo, workflow_id: 'ci.yml', event: 'pull_request', head_sha: pull.head.sha, exclude_pull_requests: false, per_page: 100 }), pull);

// This collector is imported only from the trusted base checkout. PR files,
// scripts, artifacts and dependencies never execute in this authorization job.
export async function inspectTrustedPr({ github, context, number }) {
  if (context.repo.owner + '/' + context.repo.repo !== REPOSITORY || !Number.isSafeInteger(number) || number < 1) fail('PR_REQUEST_REJECTED');
  const repo = context.repo;
  const { data: pull } = await github.rest.pulls.get({ ...repo, pull_number: number });
  if (pull.number !== number || pull.draft !== false) fail('PR_REQUEST_REJECTED');
  const eventPr = context.payload.pull_request;
  const trustedEvent = context.eventName === 'pull_request_target' && eventPr?.number === number
    || ['schedule', 'workflow_dispatch'].includes(context.eventName) && context.ref === 'refs/heads/main';
  if (!trustedEvent || pull.state !== 'open' || pull.base.ref !== 'main') fail('TRUSTED_PR_EVENT_REJECTED');
  const [{ data: branch }, { data: merge }] = await Promise.all([
    github.rest.repos.getBranch({ ...repo, branch: pull.base.ref }),
    github.rest.repos.getCommit({ ...repo, ref: pull.merge_commit_sha }),
  ]);
  const identity = prIdentity({ eventPr: eventPr || pull, pull, merge, currentBaseSha: branch.commit.sha });
  const initialReview = await reviewSnapshot({ github, repo, pull });
  const run = await requestRuns(github, repo, pull);
  const [jobs, checks, { data: suite }, { data: workflow }, ...blobs] = await Promise.all([
    github.paginate(github.rest.actions.listJobsForWorkflowRunAttempt, { ...repo, run_id: run.id, attempt_number: run.run_attempt, per_page: 100 }),
    github.paginate(github.rest.checks.listForRef, { ...repo, ref: pull.head.sha, filter: 'all', per_page: 100 }),
    github.rest.checks.getSuite({ ...repo, check_suite_id: run.check_suite_id }),
    github.rest.actions.getWorkflow({ ...repo, workflow_id: 'ci.yml' }),
    ...[pull.base.sha, pull.head.sha, pull.merge_commit_sha].map(ref => github.rest.repos.getContent({ ...repo, path: CI_PATH, ref })),
  ]);
  const identityJobs = jobs.filter(job => job.name === 'Commit identity');
  if (identityJobs.length !== 1) fail('CI_CONTEXT_JOB_AMBIGUOUS');
  const { data: log } = await github.rest.actions.downloadJobLogsForWorkflowRun({ ...repo, job_id: identityJobs[0].id });
  const platformContext = parseCiContext(log);
  const inputs = { pull, run, jobs, checks, suite, workflow, platformContext,
    baseWorkflowBlob: blobs[0].data.sha, headWorkflowBlob: blobs[1].data.sha, mergeWorkflowBlob: blobs[2].data.sha };
  const ci = trustedChecks(inputs);
  // Re-evaluate all mutable review and candidate evidence at the final decision.
  // There is still an unavoidable race until merge; native rules must enforce it.
  const { data: current } = await github.rest.pulls.get({ ...repo, pull_number: number });
  if (current.number !== number || current.draft !== false || current.state !== 'open' || current.head.sha !== pull.head.sha || current.base.sha !== pull.base.sha
    || current.head.ref !== pull.head.ref || current.base.ref !== pull.base.ref
    || current.head.repo?.id !== pull.head.repo.id || current.base.repo?.id !== pull.base.repo.id
    || current.merge_commit_sha !== pull.merge_commit_sha) fail('PR_CHANGED_DURING_CHECK');
  const [{ data: currentBranch }, { data: currentMerge }] = await Promise.all([
    github.rest.repos.getBranch({ ...repo, branch: current.base.ref }),
    github.rest.repos.getCommit({ ...repo, ref: current.merge_commit_sha }),
  ]);
  prIdentity({ eventPr: current, pull: current, merge: currentMerge, currentBaseSha: currentBranch.commit.sha });
  const finalReview = await reviewSnapshot({ github, repo, pull: current });
  if (JSON.stringify(finalReview) !== JSON.stringify(initialReview)) fail('REVIEW_CHANGED_DURING_CHECK');
  const latest = await requestRuns(github, repo, current);
  if (latest.id !== run.id || latest.run_attempt !== run.run_attempt || latest.status !== run.status
    || latest.conclusion !== run.conclusion || JSON.stringify(latest.pull_requests) !== JSON.stringify(run.pull_requests)) fail('CI_CHANGED_DURING_CHECK');
  trustedChecks({ ...inputs, pull: current, run: latest });
  return { identity, review: finalReview.decision, ci, publication: publicationAuthority() };
}
