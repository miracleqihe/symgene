#!/usr/bin/env bash
# NEG-05 — skipped / neutral results and required checks.
#
# OFFICIAL PLATFORM SEMANTICS (docs.github.com "Status checks" reference):
#   "A job that is skipped will report its status as 'Success'. It will not
#    prevent a pull request from merging, even if it is a required check."
#   "About protected branches": required status checks are satisfied by
#   'successful', 'skipped' OR 'neutral' status.
# => The PLATFORM ALLOWS skipped/neutral to satisfy a required check. This
#    scenario therefore MEASURES the platform behavior; it is NOT a pass/fail
#    protection test. The project's SECURITY REQUIREMENT is different: gate
#    jobs must be unable to skip — enforced in-repo by the S1R2 auditor
#    (unconditional gate steps, no continue-on-error, template-equality) and
#    by only ever requiring unconditional jobs (REQUIRED-CHECKS-MATRIX §1.4).
#
# Verdict scheme (R2): case results are recorded as MEASURED evidence with
# the platform behavior stated; only deviations from the documented behavior
# produce a FAIL. No simulated success is ever claimed as platform evidence.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-05" "skipped / neutral required check (platform measurement)" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0
require_identity A

BRANCH="neg05-$RANDOM"
plan "case A (job-level if:false): check-run 'Branch policy' should appear with conclusion=skipped and MERGE SHOULD PROCEED (platform-documented)"
plan "  merge proceeding = MEASURED (matches official docs); merge blocked = MEASURED-DIFFERENT (report to platform)"
plan "  project control (not this script): the auditor rejects conditional/continue-on-error gate steps"
plan "case B (workflow path/branch filter): no check-run for the ref -> per docs this leaves the required check pending -> merge blocked"
plan "case C (API-created conclusion=neutral): treated as success per docs -> merge proceeds"
plan "verdict: record observed behavior; FAIL only if the platform contradicts its own documentation"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  mkdir -p "$LAB_DIR/.github/workflows"
  cat > "$LAB_DIR/.github/workflows/neg05-skipped.yml" <<'YAML'
name: NEG05 skipped
on:
  pull_request:
jobs:
  branch-policy:
    name: Branch policy
    if: false
    runs-on: ubuntu-latest
    steps:
      - run: echo "never runs"
YAML
  git_as A "$LAB_DIR" add .github/workflows/neg05-skipped.yml
  git_as A "$LAB_DIR" commit -m "NEG-05: skipped gate job"
  git_as A "$LAB_DIR" push "$(authed_url A "$TEST_REPO")" "HEAD:refs/heads/${BRANCH}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-05 skipped required check" --body "platform behavior measurement"
  N=$(gh_as A pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  HEAD_SHA=$(gh_as A pr view "$N" --repo "$TEST_REPO" --json headRefOid --jq .headRefOid)
  echo "[live] case A: check runs at head:"
  gh api "repos/${TEST_REPO}/commits/${HEAD_SHA}/check-runs" --jq '.check_runs[] | {name, conclusion}'
  if gh_as A pr merge "$N" --repo "$TEST_REPO" --merge 2>/dev/null; then
    echo "MEASURED: merge PROCEEDED with a skipped required check — matches docs.github.com (skipped satisfies required checks)"
  else
    echo "MEASURED-DIFFERENT: merge was BLOCKED despite a skipped required check — platform deviates from its documented semantics; report"
  fi
  echo "cleanup: git push origin --delete ${BRANCH} (PR merged or closed)"
fi
