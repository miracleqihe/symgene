#!/usr/bin/env bash
# NEG-01 — merging without approval must be rejected BY THE REVIEW GATE.
#
# R3 fix retained: attribution is read-only (mergeStateStatus), the PR is
# never merged. R4 fix (P1-22): the satisfied state is GraphQL's CLEAN
# (no MERGEABLE value exists in MergeStateStatus); transient states
# (UNSTABLE/UNKNOWN/...) are retried, never judged immediately.
#   (1) checks green, zero approvals   -> mergeStateStatus = BLOCKED
#   (2) B approves                     -> mergeStateStatus = CLEAN
#       (positive control: the approval was the only missing gate)
#   (3) B re-reviews CHANGES_REQUESTED -> mergeStateStatus = BLOCKED
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-01" "unapproved merge" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0
require_identity A B

BRANCH="neg01-$RANDOM"
plan "git_as A push (authed URL) -> open PR base main, wait for required checks GREEN"
plan "(1) await_merge_state BLOCKED with zero approvals (read-only)"
plan "(2) B approves -> await_merge_state CLEAN (positive control, no merge performed)"
plan "(3) B re-reviews CHANGES_REQUESTED -> await_merge_state BLOCKED"
plan "the PR is never merged; cleanup closes it"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  git_as A "$LAB_DIR" push "$(authed_url A "$TEST_REPO")" "HEAD:refs/heads/${BRANCH}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-01 unapproved merge" --body "negative test"
  N=$(gh_as A pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  echo "[live] waiting for required checks to finish..."
  gh_as A pr checks "$N" --repo "$TEST_REPO" --watch --fail-fast || true
  await_merge_state "$N" "BLOCKED" || exit $?
  gh_as B api "repos/${TEST_REPO}/pulls/${N}/reviews" -f event=APPROVE >/dev/null
  await_merge_state "$N" "CLEAN" || exit $?
  gh_as B api "repos/${TEST_REPO}/pulls/${N}/reviews" -f event=REQUEST_CHANGES >/dev/null
  await_merge_state "$N" "BLOCKED" || exit $?
  echo "cleanup (no merge ever performed): gh pr close ${N} --repo ${TEST_REPO}; git push origin --delete ${BRANCH}"
fi
