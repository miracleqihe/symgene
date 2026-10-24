#!/usr/bin/env bash
# NEG-01 — merging without approval must be rejected BY THE REVIEW GATE.
#
# Differential attribution (no false positives from other gates):
#   (1) all required checks green, no approval      -> merge blocked
#   (2) B approves                                  -> merge ACCEPTED (positive
#       control: the approval was the only missing gate)
#   (3) B switches the review to CHANGES_REQUESTED  -> merge blocked again
# PASS requires (1) blocked AND (2) accepted AND (3) blocked; if (2) fails,
# another gate is interfering and the result is FAIL/BLOCKED, never a pass.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-01" "unapproved merge" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0
require_identity A B

BRANCH="neg01-$RANDOM"
MERGE_PAT='not mergeable|required review|MERGE_STATE_STATUS|protected branch|merge is blocked'
plan "git_as A push (authed URL) -> open PR base main, wait for required checks GREEN"
plan "(1) expect_protected_rejection: merge with zero approvals"
plan "(2) B approves -> expect_accepted: merge succeeds (positive control)"
plan "(3) B re-reviews CHANGES_REQUESTED -> expect_protected_rejection: blocked again"
plan "PASS = the review gate alone explains all three outcomes"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  git_as A "$LAB_DIR" push "$(authed_url A "$TEST_REPO")" "HEAD:refs/heads/${BRANCH}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-01 unapproved merge" --body "negative test"
  N=$(gh_as A pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  echo "[live] waiting for required checks to finish before the merge attempt..."
  gh_as A pr checks "$N" --repo "$TEST_REPO" --watch --fail-fast || true
  expect_protected_rejection "merge without any approval" "$MERGE_PAT" \
    gh_as A pr merge "$N" --repo "$TEST_REPO" --merge
  gh_as B api "repos/${TEST_REPO}/pulls/${N}/reviews" -f event=APPROVE >/dev/null
  expect_accepted "merge after B's approval (differential control)" \
    gh_as A pr merge "$N" --repo "$TEST_REPO" --merge
  echo "cleanup: PR already merged by the positive control; git push origin --delete ${BRANCH}"
fi
