#!/usr/bin/env bash
# NEG-01 — merging without approval must be rejected BY THE REVIEW GATE.
#
# R3 fix (P1-14): the positive control no longer MERGES the PR mid-scenario
# (the R2 flow merged at step 2, making step 3 unreachable and polluting the
# lab main). Attribution now uses mergeStateStatus, which is read-only:
#   (1) checks green, zero approvals   -> mergeStateStatus = BLOCKED
#   (2) B approves                     -> mergeStateStatus = MERGEABLE
#       (positive control: the approval was the only missing gate)
#   (3) B re-reviews CHANGES_REQUESTED -> mergeStateStatus = BLOCKED again
# The PR is NEVER merged; cleanup closes it. PASS requires all three states.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-01" "unapproved merge" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0
require_identity A B

BRANCH="neg01-$RANDOM"
MERGE_PAT='not mergeable|required review|MERGE_STATE_STATUS|protected branch|merge is blocked'
plan "git_as A push (authed URL) -> open PR base main, wait for required checks GREEN"
plan "(1) expect_merge_state BLOCKED with zero approvals (read-only: mergeStateStatus)"
plan "(2) B approves -> expect_merge_state MERGEABLE (positive control, no merge performed)"
plan "(3) B re-reviews CHANGES_REQUESTED -> expect_merge_state BLOCKED"
plan "the PR is never merged; cleanup closes it"

expect_merge_state() {
  local desc="$1" n="$2" expected="$3"
  local got
  got=$(gh pr view "$n" --repo "$TEST_REPO" --json mergeStateStatus --jq .mergeStateStatus) || {
    echo "VERDICT: BLOCKED — cannot read mergeStateStatus for PR ${n}" >&2
    exit $EXIT_BLOCKED_AUTH
  }
  if [[ "$got" == "$expected" ]]; then
    echo "VERDICT: PASS — ${desc}: mergeStateStatus=${got}"
  else
    echo "VERDICT: FAIL — ${desc}: expected ${expected}, got ${got}" >&2
    return $EXIT_FAIL
  fi
}

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  git_as A "$LAB_DIR" push "$(authed_url A "$TEST_REPO")" "HEAD:refs/heads/${BRANCH}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-01 unapproved merge" --body "negative test"
  N=$(gh_as A pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  echo "[live] waiting for required checks to finish..."
  gh_as A pr checks "$N" --repo "$TEST_REPO" --watch --fail-fast || true
  expect_merge_state "blocked with zero approvals" "$N" "BLOCKED" || exit $?
  gh_as B api "repos/${TEST_REPO}/pulls/${N}/reviews" -f event=APPROVE >/dev/null
  expect_merge_state "mergeable after B's approval (positive control)" "$N" "MERGEABLE" || exit $?
  gh_as B api "repos/${TEST_REPO}/pulls/${N}/reviews/${REVIEW_ID:-}" -X PUT -f event=REQUEST_CHANGES >/dev/null 2>&1 || \
    gh_as B api "repos/${TEST_REPO}/pulls/${N}/reviews" -f event=REQUEST_CHANGES >/dev/null
  expect_merge_state "blocked again after the review is withdrawn" "$N" "BLOCKED" || exit $?
  echo "cleanup (no merge ever performed): gh pr close ${N} --repo ${TEST_REPO}; git push origin --delete ${BRANCH}"
fi
