import { REPOSITORY, prIdentity, independentReview, trustedChecks, publicationAuthority, fail } from './policy.mjs';

// Invoked only by github-script after checking out the trusted base commit.
// Never check out, import, install dependencies from, or run the PR head here.
export async function inspectTrustedPr({ github, context, number }) {
  if (context.repo.owner + '/' + context.repo.repo !== REPOSITORY || !Number.isSafeInteger(number) || number < 1) fail('PR_REQUEST_REJECTED');
  const repo = context.repo;
  const { data: pull } = await github.rest.pulls.get({ ...repo, pull_number: number });
  const eventPr = context.payload.pull_request;
  if (context.eventName !== 'pull_request_target' || !eventPr || pull.state !== 'open'
    || pull.base.ref !== 'main') fail('TRUSTED_PR_EVENT_REJECTED');
  const [{ data: branch }, { data: merge }] = await Promise.all([
    github.rest.repos.getBranch({ ...repo, branch: pull.base.ref }),
    github.rest.repos.getCommit({ ...repo, ref: pull.merge_commit_sha }),
  ]);
  const identity = prIdentity({ eventPr, pull, merge, currentBaseSha: branch.commit.sha });
  const reviews = await github.paginate(github.rest.pulls.listReviews, { ...repo, pull_number: number, per_page: 100 });
  const permissions = {};
  for (const login of new Set(reviews.filter(r => r.user?.type === 'User').map(r => r.user.login))) {
    const { data } = await github.rest.repos.getCollaboratorPermissionLevel({ ...repo, username: login });
    permissions[login] = data.permission;
  }
  const threads = []; let cursor = null;
  do {
    const result = await github.graphql(`query($owner:String!,$name:String!,$number:Int!,$cursor:String){
      repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$cursor){
        nodes{isResolved} pageInfo{hasNextPage endCursor}}}}}`, { owner: repo.owner, name: repo.repo, number, cursor });
    const page = result.repository.pullRequest.reviewThreads;
    threads.push(...page.nodes); cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  const review = independentReview({ pull, reviews, permissions, threads });
  const runs = await github.paginate(github.rest.actions.listWorkflowRuns, { ...repo, workflow_id: 'ci.yml', event: 'pull_request', head_sha: pull.head.sha, per_page: 100 });
  const run = runs.filter(r => r.head_sha === pull.head.sha).sort((a, b) => b.id - a.id)[0];
  if (!run) fail('CI_RUN_MISSING');
  const [jobs, checks, baseWorkflow, headWorkflow] = await Promise.all([
    github.paginate(github.rest.actions.listJobsForWorkflowRun, { ...repo, run_id: run.id, filter: 'latest', per_page: 100 }),
    github.paginate(github.rest.checks.listForRef, { ...repo, ref: pull.head.sha, filter: 'latest', per_page: 100 }),
    github.rest.repos.getContent({ ...repo, path: '.github/workflows/ci.yml', ref: pull.base.sha }),
    github.rest.repos.getContent({ ...repo, path: '.github/workflows/ci.yml', ref: pull.head.sha }),
  ]);
  const ci = trustedChecks({ pull, run, jobs, checks, baseWorkflowBlob: baseWorkflow.data.sha, headWorkflowBlob: headWorkflow.data.sha });
  // Re-read after collection so a concurrent update cannot reuse this snapshot.
  const { data: current } = await github.rest.pulls.get({ ...repo, pull_number: number });
  if (current.head.sha !== pull.head.sha || current.base.sha !== pull.base.sha
    || current.merge_commit_sha !== pull.merge_commit_sha) fail('PR_CHANGED_DURING_CHECK');
  return { identity, review, ci, publication: publicationAuthority() };
}
