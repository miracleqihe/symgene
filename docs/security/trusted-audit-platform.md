# Trusted audit platform prerequisites

The checked-in engineering collector verifies current PR/base/merge identity,
latest trusted CI, independent current approval, resolved threads and native
last-push protection. It cannot attest to a rule it cannot read. GitHub's
[Get branch protection API](https://docs.github.com/en/rest/branches/branch-protection#get-branch-protection)
requires repository Administration read. The documented
[GITHUB_TOKEN permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)
do not include Administration. A 403, 404 or other failed read remains
`LAST_PUSH_NATIVE_PROTECTION_UNVERIFIABLE`, never a passing review condition.

## Minimal independent GitHub App design

An Owner-controlled installation scoped only to `miracleqihe/symgene` needs:

| Repository permission | Level | Purpose |
| --- | --- | --- |
| Metadata | Read | Repository and collaborator permission identity |
| Administration | Read | Observe native branch protection and bypass rules |
| Contents | Read | Immutable trusted policy/workflow blobs and merge parents |
| Pull requests | Read | PRs, reviews and GraphQL review threads |
| Actions | Read | Runs, attempts, jobs and isolated identity logs |
| Checks | Read | Exact check-run, suite and issuing App evidence |

GitHub documents Metadata read for
[Get repository permissions for a user](https://docs.github.com/en/rest/collaborators/collaborators#get-repository-permissions-for-a-user),
the collaborator-permission endpoint used by this collector.

If the independent App becomes a native required check issuer, only then add
Checks write to publish its own distinct audit result bound to the exact current
HEAD. It needs no contents write, Administration write, pull-request write,
Pages, deployment, environment or Actions write permission. It must not approve,
resolve or merge PRs.

Run the App on an independent Owner-controlled service using reviewed policy
pinned to an immutable trusted commit. Installation tokens remain in that
service. Do not inject them into PR jobs, execute PR HEAD code, install PR
dependencies or trust PR-generated approval files. Verify webhook signatures,
installation/repository identity and replay handling. Review, thread, push and CI
changes must trigger a new fresh audit; permission/protection changes also need
supported invalidation and fresh verification. An invalidation or API failure
must replace earlier success with a distinct blocked/failing check. Native
current review and last-push requirements still enforce the race at merge time.

The current workflow does not provision this App or claim its issuer exists.
A service adapter and platform acceptance are separate independently reviewed
work; an App installation alone is not sufficient evidence.

## Owner acceptance tasks

1. Independently review #37, the #39 patch and #38 in the documented order, then
   bring their trusted workflow/policy into the base through ordinary PRs.
2. Inspect real `dev` and `main` protection, current independent reviewer
   eligibility, latest-push approval, conversation resolution, admin enforcement
   and bypass lists. Keep the collector blocked if equivalent enforcement cannot
   be demonstrated. Do not remove independent latest-push review to pass CI.
3. If required, create/install the minimal independent App and review its service
   adapter. Test its issuer, exact HEAD binding and invalidation after new pushes,
   dismissed approvals, reopened threads, permission loss and protection changes.
4. Configure native required checks only after observing their actual issuers and
   behavior on current candidates. A same-name check, skipped workflow or older
   success must not satisfy acceptance. Do not treat the existing
   `pull_request_target` audit job as a verified required HEAD check.
5. Review `github-pages` main-only Environment restrictions, independent required
   human approval, admin bypass restrictions, write actors and credential
   inventory before considering any production run. This remediation does not
   enable Pages or dispatch a deployment.

An engineering audit PASS and `LEGACY_ENGINEERING_ELIGIBLE` create no medical or
rights approval. Formal signed T02 adoption remains
`T02_FORMAL_ADOPTION_BLOCKED`. Production execution remains outside this round's
authorization.
