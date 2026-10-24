#!/usr/bin/env bash
# NEG-03 — an approval from the LAST PUSHER must not satisfy the merge gate
# (require_last_push_approval=true).
#
# Identity binding and evidence:
#   - A pushes via A's OWN authenticated URL (A is provably the last pusher);
#   - the last commit's platform-side committer/author login is fetched from
#     the API and asserted equal to GH_A_USER before any approval;
#   - positive control: B (NOT the last pusher) approves -> merge ACCEPTED.
# Attribution: blocked-with-only-A's-approval + accepted-with-B's-approval
# isolates the last-pusher rule.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-03" "last-pusher self-approval" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0
require_identity A B

BRANCH="neg03-$RANDOM"
MERGE_PAT='not mergeable|required review|MERGE_STATE_STATUS|protected branch|merge is blocked'
plan "B authors the PR; A pushes one more commit via A's authed URL (A = last pusher)"
plan "evidence: last commit author.login == GH_A_USER (API)"
plan "A approves -> expect_protected_rejection: merge blocked"
plan "positive control: B approves -> expect_accepted: merge succeeds"

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
  expect_protected_rejection "merge with approval only from the last pusher" "$MERGE_PAT" \
    gh_as A pr merge "$N" --repo "$TEST_REPO" --merge
  gh_as B api "repos/${TEST_REPO}/pulls/${N}/reviews" -f event=APPROVE >/dev/null
  expect_accepted "merge after B (not the last pusher) approves (differential control)" \
    gh_as A pr merge "$N" --repo "$TEST_REPO" --merge
  echo "cleanup: PR merged by the positive control; git push origin --delete ${BRANCH}"
fi
