# Engineering checks and production authorization

Production remains **BLOCKED**. No authenticated approval source currently covers
the exact public website, Markdown, Prompts and guides. This change creates no new
signature contract and gives no local template, environment variable, CI result,
or bot review the ability to approve that content.

## Stable engineering checks

`CI` runs `Commit identity`, `Branch policy`, `Verify`, and `Content integration`
for every PR to dev/main. `Engineering gate` runs with `if: always()` and fails
unless all four upstream results are exactly `success`. Missing, skipped,
neutral, failed and cancelled work cannot satisfy that terminal decision. No
historical topic branch name exempts a future PR from content integration.

Commit identity records the PR HEAD, base SHA, platform synthetic merge SHA,
run ID, attempt and workflow ref in an isolated inline job. A PR merge must have
the expected base and head as its two parents. The separate local checkout report
is diagnostic evidence and cannot independently authorize a trusted decision.
`Verify` retains browser evidence at four viewport widths, including its separate
sourceHead and checkoutHead fields.

The first T03 PR run exposed a runner dependency-download failure: Ubuntu's Azure
HTTP mirror spent over ten minutes on Playwright dependencies and another eight
minutes on the CJK font, cancelling the 20-minute Verify job before browser review.
The terminal Engineering gate correctly failed on that cancelled upstream.
Verify now selects Ubuntu 24.04 explicitly and switches only its mirror list to
Ubuntu's official HTTPS archive, retaining signed package verification. Apt has
finite transport/lock waits and two retries; dependency and font installation
have separate bounded step budgets within the unchanged 20-minute job budget.
The locked Playwright installation, Chinese font installation, actual Chinese
glyph assertion and all four-viewport browser checks remain mandatory. Local
static tests cannot prove remote mirror availability; the next real PR run must
verify this infrastructure change.

The second PR run correctly failed that configuration readback: the official
runner image also writes `zz-retries`, which sorts after numeric `99*` files and
overrides their values. The job-specific policy now sorts after that runner file.
It dumps the selected effective root Apt keys and checks each exact value using
`apt-config shell` before installing anything; an unexpected later override still
fails the job. This follows the image's documented last-setting-wins behavior,
not an assumption that writing a configuration file made it effective. See the
[official runner Apt configuration](https://github.com/actions/runner-images/blob/ubuntu24/20261012.334/images/ubuntu/scripts/build/configure-apt.sh).

`Content integration` always runs content-pack and legacy integrity checks plus
the real storage/content test suites. The historical `check:split` and
`scripts/t02/check-repository.mjs` scanners retain their exact migration scopes;
they are not general checks for every future engineering PR. Running them on this
broader T03 change can fail with an outside-scope error. That is recorded as a
failure of that historical scope check, not a passing check or a disabled
assertion. The separately invoked `check:t03-scope` audits this T03 delivery
against its fixed starting commit, verifies protected bytes, scans changed text,
and checks dependency/vendor provenance. It is deliberately not a permanent ban
on future legitimate medical or engineering work.

## Trusted publication decision

`Trusted publication policy` uses `pull_request_target` for main promotion PRs.
It checks out **only the base SHA** and imports its dependency-free policy there.
It never checks out or installs PR dependencies, executes PR scripts, consumes PR
caches, or receives deployment credentials.

The trusted collector reads fresh GitHub PR, base branch, merge parents, reviews,
review threads, collaborator permissions, workflow run, jobs and check runs. It
requires a current independent human approval and the existing main owner review;
an author, a bot, an old SHA, a dismissed approval or unresolved thread cannot
satisfy it. Final fresh reads reject changed PR, branch, CI and review evidence during collection.

It also requires the candidate CI workflow blob to equal the trusted base blob,
the exact expected workflow path and pull_request event, the current HEAD, exact
job/check IDs, check suite and GitHub Actions App ID. A matching check name or App
ID alone is insufficient. PRs changing CI policy therefore cannot use their own
new policy as a trusted production decision. Those changes must first undergo
independent engineering review into the trusted base.

Even when engineering evidence satisfies these checks, the workflow explicitly
fails because real publication authority is unconfigured. It does not treat a
returned BLOCKED JSON object as a green check. Approval expiry, revocation and
exact-output version binding must eventually be integrated through the existing
authenticated contracts; they cannot be implemented by inventing a replacement
approval record here.

The workflow is not trusted or active merely because it exists in an unmerged
PR. The initial security PR needs independent review. It must enter the base
through the authorized engineering process before this base-sourced policy can
operate. main currently lacks it and cannot acquire it by promoting unreviewed
dev content. Keep the old production workflow disabled and use an independently
reviewed minimal safety patch for old main. No deployment is authorized by this
migration.

GitHub native required reviews, stale/last-push review protection, resolved
threads and expected check sources must still be configured by an authorized
owner. No code in this PR claims to enable Rulesets. On a user-owned repository,
the inline Engineering gate in a PR-editable workflow is still candidate CI;
native expected-App settings alone cannot prove an immutable workflow. The
separate base policy and blocked production authority are the current boundary.
A dedicated trusted App/required workflow would be needed for a platform-enforced
standalone head check with a distinct issuer. Do not configure an unobserved
pull_request_target job as a required head check without platform verification.

## Deployment boundary

Both main push and manual dispatch must use the exact main workflow ref and the
immutable event SHA, which must still equal current main. Authorization runs
before any production build/upload and remains unconditionally BLOCKED.
Production verification separately retains `check:publication` before the normal
build. The `Deployment gate` always runs and requires both authorization and
verification to be exactly successful.

Only the pure deploy job has Pages write and OIDC permissions. It runs no
checkout, npm, cache or repository code. It checks the exact current run ID,
attempt, repository, workflow path, main SHA, current-run artifact ID, unique
run/attempt artifact name, digest and expiry before the pinned deploy action
consumes that same artifact name. An earlier attempt, old artifact, different
run, alternate environment or non-main dispatch is rejected. Pages packaging uses
a pinned direct upload Action instead of a composite Action resolving a mutable
nested tag. Production builds do not restore PR caches.

The configured environment is `github-pages`. The actual GitHub environment
main-only policy and independent human reviewers, no admin bypass, restricted
write actors/Apps and complete credential inventory remain owner configuration
tasks. A workflow cannot constrain an administrator who edits its own source or
changes Pages/environment configuration. No production deployment or platform
rejection test is performed by these local fixtures.

## Review and validation

Run Node 22, `npm ci`, `npm run verify`, `npm run check:security`,
`npm run check:t03-scope`, and `git diff --check`. Publication checks must still
exit nonzero. The security suite covers the ten requested attack classes with
fictional approval/run data and temporary copies of existing content integrity
fixtures. A local PASS is not a claim that GitHub protections have been enabled.

CODEOWNERS continues to name the real existing owner, `@miracleqihe`. If that
person is the author or latest pusher, a genuinely independent eligible reviewer
must be arranged; no fictional reviewer or routine bypass is added here. Copilot
can assist review but cannot satisfy the project's independent human requirement.
GitHub now offers opt-in Copilot Approve counting in public preview, so inspect
that setting instead of assuming Copilot can only ever comment. See [GitHub's
current approval documentation](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-code-review).

## T03 independent review remediation (2026-10-23)

The prior CI collector accepted a matching HEAD without proving the PR number,
base snapshot or actual tested merge. Those findings were valid. The collector
now selects the newest CI run for the HEAD **before** testing success or PR
association. It never falls back to an older green run. It requires exactly one
complete `run.pull_requests` association with the requested PR number, numeric
base/head repository IDs, refs and SHAs. Missing, cross-PR, duplicated or stale
association metadata blocks authorization. The current PR and current branch
must still match the synthetic merge's ordered base/head parents.

The actual PR #37 run
[39983468521](https://github.com/miracleqihe/symgene/actions/runs/39983468521)
returned a complete association and its `head_sha` was the PR HEAD, not the
synthetic merge. The [workflow-runs API](https://docs.github.com/en/rest/actions/workflow-runs)
also allows pull requests to be omitted. This field is not assumed universally
complete: absent evidence is an explicit fail-closed platform limitation.

`Commit identity` now executes only a fixed inline pinned `github-script` Action
and a pinned artifact upload, with no checkout, dependency installation or PR
script. It records GitHub's event action, PR number, numeric repository IDs,
head/base refs and SHAs, merge `context.sha`, workflow SHA/ref, run ID and attempt.
The trusted collector reads the **attempt-specific job log**, not the mutable
`record-ci-evidence.mjs` report or its artifact. Exactly one valid context record
is required. Base, head and synthetic-merge workflow blobs must all be identical
before this record can be trusted. GitHub's
[pull_request event semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request)
provide the merge ref/SHA; the recorded merge and workflow SHA must equal the
current candidate. Attempt-specific API jobs, exact job/check IDs and check-run
URLs, suite status and GitHub Actions App, workflow ID/path, and current run
status/conclusion are all bound to that same candidate. This conditional trust
requires the independently reviewed workflow to have entered the trusted base;
it does not bootstrap the current PR into authority.

The last-reviewable-pusher finding was also valid. Commit author, committer,
`run.actor`, `triggering_actor` and PR author are different identities. No reliable
last-reviewable-pusher field is supplied by the PR/review REST evidence, and
[public Events API history](https://docs.github.com/en/rest/activity/events)
is bounded, delayed and not an authoritative mapping to GitHub's reviewable-push
semantics. This implementation does not infer one. It requires an observed
native branch protection rule with `require_last_push_approval`, at least one
approval, admin enforcement and no user/team/App bypass allowances. Missing,
unreadable or insufficient protection blocks the trusted decision. A ruleset-only
configuration is not currently accepted by this collector; an owner must arrange
an independently reviewed supported native protection configuration or extend
its inspection with equivalent verifiable enforcement. No owner settings were
changed. See [native protection semantics](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
and the [rules API field](https://docs.github.com/en/rest/repos/rules).

Before its final decision, the collector re-reads PR state, head/base/merge,
current branch and merge parents, all reviews and effective decisions, every
reviewer's current permissions, fully paginated review threads, and native
last-push protection. Changed reviews fail closed even without HEAD movement.
GraphQL page metadata must contain a boolean `hasNextPage`; a next page requires
a nonempty, unique cursor. Missing data, GraphQL errors, API denial and the page
limit reject collection. A newest run/attempt change during collection also
rejects the result.

Review changes require reevaluation beyond `pull_request_target` synchronize.
The publication workflow adds a 15-minute scheduled reevaluation from trusted
main and main-only manual dispatch. These do not run code from a PR. Direct
`pull_request_review` triggers execute a PR merge workflow, so adding that event
would not establish trusted authorization. Polling can be delayed and does not
provide immediate invalidation on review dismissal, permission loss or reopened
threads. A final re-read also cannot close the race between checking and merging.
Native required independent reviews, latest-push approval, current checks and
conversation resolution at merge time remain mandatory owner prerequisites; an
owner-controlled trusted webhook/required workflow or issuer is needed for
immediate trustworthy reevaluation. None is installed by this PR.

The shipped `deploy-pages.yml` inline guard is now executed directly by negative
tests, alongside its actual environment declaration. Fixtures reject an alternate
environment, old artifact, replayed attempt, current-main or authorized-SHA drift,
nonproduction event, malformed expiry, and missing authorization/verification/gate
success. The production authorization command still returns
`PUBLICATION_AUTHORITY_NOT_CONFIGURED`; the real medical/rights/privacy authority
and production remain **BLOCKED**.
