#!/usr/bin/env bash
# NEG-03 — with require_last_push_approval enabled, an approval from the
# account that made the most recent push must not satisfy the merge gate.
#
# Setup: PR authored by B; A pushes an extra commit (A is now the last
# pusher and NOT the author, isolating this rule from author self-approval);
# A approves; the merge must stay blocked.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-03" "last-pusher self-approval" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0
require_identity A B

BRANCH="neg03-$RANDOM"
plan "precondition: main-full ruleset with pull_request.require_last_push_approval=true active in the lab repo"
plan "PR authored by B; A pushes one more commit to the PR branch (A = last pusher, not author)"
plan "A approves the PR"
plan "expect_protected_rejection: merge attempt -> blocked (last pusher's approval does not count)"
plan "control case: B (not the last pusher) approves -> merge allowed"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  git -C "$LAB_DIR" push origin "HEAD:refs/heads/${BRANCH}"
  gh_as B pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-03 last-pusher approval" --body "negative test"
  N=$(gh_as B pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  git -C "$LAB_DIR" commit --allow-empty -m "NEG-03: push by A" && git -C "$LAB_DIR" push origin "HEAD:refs/heads/${BRANCH}"
  gh_as A api "repos/${TEST_REPO}/pulls/${N}/reviews" -f event=APPROVE >/dev/null
  expect_protected_rejection "merge with approval only from the last pusher" 'not mergeable|required review|MERGE_STATE_STATUS|protected branch|merge is blocked' \
    gh_as A pr merge "$N" --repo "$TEST_REPO" --merge
  echo "cleanup: gh pr close ${N} --repo ${TEST_REPO}; git push origin --delete ${BRANCH}"
fi
