#!/usr/bin/env bash
# NEG-03 — an approval from the LAST PUSHER must not satisfy the merge gate
# (require_last_push_approval=true).
#
# Identity binding (R2/R3 retained): A/B/C all assert_identity-bound; pushes
# via authed URLs; last-pusher evidence from the API. Positive control uses
# the THIRD identity C (not the author B, not the last pusher A) — R3 fix.
# R4 fix (P1-22): attribution via GraphQL MergeStateStatus — the last
# pusher's approval must leave the PR BLOCKED; C's approval must make it
# CLEAN. Transient states are retried, never judged immediately. No merge.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-03" "last-pusher self-approval" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0
require_identity A B C

BRANCH="neg03-$RANDOM"
plan "B authors the PR; A pushes one more commit via A's authed URL (A = last pusher)"
plan "evidence: last commit author.login == GH_A_USER (API)"
plan "A approves -> await_merge_state BLOCKED (last pusher's approval does not count)"
plan "positive control: C (not author, not last pusher) approves -> await_merge_state CLEAN"
plan "no merge is performed; cleanup closes the PR"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  git_as B "$LAB_DIR" push "$(authed_url B "$TEST_REPO")" "HEAD:refs/heads/${BRANCH}"
  gh_as B pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-03 last-pusher approval" --body "negative test"
  N=$(gh_as B pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  git_as A "$LAB_DIR" commit --allow-empty -m "NEG-03: push by A"
  git_as A "$LAB_DIR" push "$(authed_url A "$TEST_REPO")" "HEAD:refs/heads/${BRANCH}"
  LAST=$(gh api "repos/${TEST_REPO}/pulls/${N}/commits" --jq '.[-1].author.login')
  if [[ "$LAST" != "$(identity_var A USER)" ]]; then
    echo "VERDICT: BLOCKED — last commit author is ${LAST}, expected GH_A_USER; last-pusher binding unproven" >&2
    exit $EXIT_BLOCKED_INPUT
  fi
  echo "[live] evidence: last pusher on PR ${N} is ${LAST} (== GH_A_USER)"
  gh_as A api "repos/${TEST_REPO}/pulls/${N}/reviews" -f event=APPROVE >/dev/null
  await_merge_state "$N" "BLOCKED" || exit $?
  gh_as C api "repos/${TEST_REPO}/pulls/${N}/reviews" -f event=APPROVE >/dev/null
  await_merge_state "$N" "CLEAN" || exit $?
  echo "cleanup (no merge performed): gh pr close ${N} --repo ${TEST_REPO}; git push origin --delete ${BRANCH}"
fi
