# Engineering checks and production authorization

The Owner has accepted the existing legacy publication policy risk and restored
ordinary topic → dev → main engineering updates. Legacy eligibility requires
verified content integrity and a real production build using the legacy runtime.
It creates no medical or rights approval. Formal T02 package adoption remains
**T02_FORMAL_ADOPTION_BLOCKED**. A local engineering PASS does not authorize
production deployment; no deployment is performed during this remediation.

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

## Trusted engineering audit

`publication-policy.yml` now reports `Trusted engineering audit`. It retains
main promotion `pull_request_target` events and a main-only manual entry. The
ineffective 15-minute failure polling is paused. Its first fixed inline step
rejects an unexpected repository, event or workflow ref before loading any
repository code. The workflow SHA must still equal current main and, for a
target event, the event's base SHA. Only that trusted base SHA is checked out. PR scripts,
dependencies, caches and artifacts never execute in that audit job.

The collector retains fresh PR/base/head/merge-parent identity checks; current
independent qualified human approval, main Owner review and fully paginated
resolved threads; exact workflow blob equality across base/head/merge; and the
latest CI run selected before checking success. Every required CI job and check
must have the expected IDs, GitHub Actions App, suite, head SHA, run and attempt.
An identical name, skipped result or an older green run cannot substitute for
this evidence. The isolated `Commit identity` job log must bind the exact PR,
repository IDs, refs, base/head/merge/workflow SHAs and run/attempt. Missing or
ambiguous evidence fails closed. A final fresh collection rejects changes to
reviews, permissions, PR identity and the newest CI attempt.

The audit reports `TRUSTED_ENGINEERING_AUDIT_PASS` only after these checks. It
separately reports `T02_FORMAL_ADOPTION_BLOCKED` and
`productionDeployment: not_authorized`. No fixed medical/rights certification
failure is used to reject otherwise valid engineering evidence. The collector
does not infer legacy runtime eligibility by inspecting the trusted base's own
content; the current candidate's `Content integration` and full build remain
required engineering evidence.

The native last-reviewable-push requirement is unchanged. Commit author,
committer, PR author and workflow actor do not prove who made the last reviewable
push. The collector requires observed native protection with
`require_last_push_approval`, at least one required approval, admin enforcement
and no bypass users, teams or Apps. Missing or insufficient protection fails.
`getBranchProtection()` requires Administration read, which ordinary
`GITHUB_TOKEN` cannot request. An unreadable rule returns
`LAST_PUSH_NATIVE_PROTECTION_UNVERIFIABLE`; it never reports a review PASS.
Ruleset-only enforcement is not accepted without an independently reviewed
inspection proving equivalent native guarantees.

The ordinary audit workflow deliberately has only contents, pull-requests,
actions and checks read permissions. It contains neither a fictional
`administration` permission nor a high-privilege secret. Consequently its real
platform result may remain BLOCKED until the Owner provides independently
operated trusted verification. The minimal App design and Owner acceptance tasks
are in [trusted audit platform](security/trusted-audit-platform.md). This work
does not install that App or change protection settings.

The policy must first enter the trusted base through independent engineering
review. A PR changing the CI workflow cannot certify itself against that changed
workflow. The base policy is not active merely because it exists in PR #37.
Do not require its `pull_request_target` check as an authoritative HEAD check
without proving GitHub attaches and enforces the intended source for the exact
candidate. Native current reviews, last-push approval and conversation resolution
remain necessary at merge time; a final read alone does not close the merge race.

## Deployment boundary

`Main workflow identity` first validates the exact repository, main ref,
workflow path, immutable event SHA, current main SHA, run ID and attempt without
checking out code. `Production verification` checks out that exact SHA, runs the
checked-in `check:publication`, then full `npm run verify`. The production gate
follows a bounded locked-Chromium install and actual production-entry execution;
it checks source, built runtime and matching execution evidence and emits
`LEGACY_ENGINEERING_ELIGIBLE` only on success. It continues rejecting a wrong
checkout/main SHA, workflow, event, run or attempt. Its CLI exits zero only for
that engineering eligibility; exceptions and failed identities exit nonzero.
The CLI reads Git from its own checkout and rejects tracked or untracked source
changes, even when caller cwd or Git environment variables point elsewhere.

The actual browser command is
`node scripts/security/verify-production-runtime.mjs`, executed after the build
and locked Chromium installation. It serves the real `dist` entry on loopback,
verifies the immutable legacy runtime configuration, current legacy collection
counts and production read-only UI, and rejects browser errors or T02 requests.
Its `.symgene-runtime-browser.json` receipt binds the artifact digest and source
evidence digest before the production gate reads it. Missing execution evidence
or a receipt for different bytes fails. This generated engineering receipt
asserts neither medical nor rights approval and is never committed as content
authorization.

On #37's original dev base, `check:publication` still contains the old fixed
block. It is intentionally retained until the reviewed #39 compatibility patch
replaces that policy with legacy integrity. A local test of the new policy helper
is not a claim that this pre-integration release command succeeds. #39 adds its
integrity requirement inside the stable `Content integration` job; no reliance
on a separate historical `Publication integrity` job name remains in the final
candidate. Full combined validation is performed in an isolated worktree before
any real merge.

`Deployment gate` runs with `if: always()` and requires main identity and
verification to be exactly successful plus the exact legacy eligibility output.
The deploy guard repeats those requirements for all three upstream jobs. No
missing, failed, skipped, neutral or cancelled job can authorize an artifact.
Legacy eligibility is an engineering prerequisite; the protected `github-pages`
Environment and Owner's production authorization remain separate prerequisites.

Only the pure deploy job has Pages write and OIDC permissions. It executes no
checkout, npm, cache or repository script. It rechecks repository, workflow,
current main SHA, run ID/attempt, exact artifact ID, unique run/attempt artifact
name, digest and expiry before the SHA-pinned official deploy Action consumes
that name. The upload uses a SHA-pinned direct artifact Action. The build does
not restore PR caches. The job names the exact `github-pages` Environment;
main-only Environment rules, independent human reviewers, disabled bypass and
credential inventory require Owner platform setup. No Pages deployment or real
Environment rejection test is run here.

## Validation and remaining authority

Run Node 22, `npm ci`, `npm run verify`, `npm run check:security`,
`npm run check:t03-scope`, and `git diff --check`. The security suite executes the
shipped inline workflow decisions with mocked GitHub API surfaces, including
wrong run/attempt/artifact/digest, stale current-main SHA, missing legacy
eligibility and skipped upstream jobs. These are local executable workflow
logic tests, not post-merge GitHub CI or platform acceptance.

CODEOWNERS still names the real existing Owner, `@miracleqihe`. If that person
is author or latest pusher, an independent eligible human reviewer is still
required. No fabricated reviewer, approval, medical/rights record, T02 authority,
merge or production deployment is created by this work.

## Integrated legacy release policy (T03 candidate, #37 × #39)

The Owner has restored the standard engineering release flow for legacy content
(#39): `check:publication` returns `LEGACY_RELEASE_INTEGRITY_VERIFIED` for
content whose snapshot, verifier, counts and T02 adoption flags all match the
lock, and exits non-zero on any drift (`LEGACY_VENDOR_DRIFT`,
`LEGACY_VERIFIER_DRIFT`, `LEGACY_ADOPTION_CHANGED`, `SNAPSHOT_COUNT_DROP`).
Approval environment variables, review templates and review registers can
neither claim approval nor bypass integrity. This restores deployability while
keeping three facts separate: local release-engineering verification success
(`LEGACY_ENGINEERING_ELIGIBLE` from a real build plus real Chromium execution),
and an authorized production deployment remain distinct; the `github-pages`
Environment gate and Owner authorization are still required for the latter.
No medical, public-language or rights approval is asserted by any of this
tooling, and formal T02 adoption stays `T02_FORMAL_ADOPTION_BLOCKED`.

## Reviewed production dependency closure (R3)

`scripts/security/production-closure.json` enumerates every first-party module
allowed in the production graph and every third-party package root. The build
plugin and the post-build verifier both enforce exact set equality: an
unlisted first-party module (`PRODUCTION_MODULE_OUTSIDE_REVIEWED_CLOSURE`), a
missing one (`PRODUCTION_CLOSURE_MEMBER_MISSING`), an unlisted package, an
unknown virtual module, or a closure file that differs from the one recorded
in the build evidence (`PRODUCTION_CLOSURE_DRIFT`) all fail. Moving a T02
module to a new path therefore requires a visible reviewed closure edit, and a
capability scan additionally rejects the high-entropy T02 test-session
constants in any emitted chunk (`PRODUCTION_T02_MARKER_IN_BUNDLE`), checked
both at build time and again independently against the emitted `.js` bytes at
verification time. The marker list is required by test to track the live
constants exported from `src/dev/`. These in-repo mechanisms make boundary
changes loud and reviewable; they do not replace the native review and branch
protection that decide what actually merges.

## Time-boxed T03 scope audit (R4)

`node scripts/security/check-t03-scope.mjs` now runs as a mandatory step of
the `Content integration` job (no new job name, so the trusted-audit job
contract in `CI_JOBS` is unchanged). Its applicability is governed by
`scripts/security/t03-scope-state.json`: while `active` is true it audits all
changed paths against T03_BASE `6a3eea2f679fa8979c66edcba2724675ee74aa93` and
fails on protected-byte drift; once the T03 family (#37/#38/#39) has landed,
the Owner retires it with a reviewed flip of `active` to `false`, after which
the audit reports `SCOPE_RETIRED` and stops constraining future engineering
PRs. Retiring is itself a visible, auditable diff, not a silent bypass. This
audit is intentionally NOT a permanent rule: future medical or engineering PRs
after retirement are ordinary reviewed changes.
