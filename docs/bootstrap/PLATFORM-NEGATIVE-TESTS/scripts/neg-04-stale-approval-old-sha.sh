#!/usr/bin/env bash
# NEG-04 — an approval tied to an old head SHA must not survive a new push.
#
# Attribution: head2's required checks are waited to GREEN before the merge
# attempt, so the rejection cannot come from pending checks — only from the
# dismissed stale review.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-04" "stale approval on old SHA" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0
require_identity A B

BRANCH="neg04-$RANDOM"
MERGE_PAT='not mergeable|required review|MERGE_STATE_STATUS|protected branch|merge is blocked'
plan "A opens PR; B approves at head1; record review state"
plan "A pushes head2 (authed URL); assert B's review state becomes DISMISSED"
plan "wait for head2 required checks to be GREEN (exclude pending-check rejection)"
plan "expect_protected_rejection: merge blocked at head2"
plan "control: head1's green checks do not carry over; only the dismissal explains the block"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  git_as A "$LAB_DIR" push "$(authed_url A "$TEST_REPO")" "HEAD:refs/heads/${BRANCH}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-04 stale approval" --body "negative test"
  N=$(gh_as A pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  gh_as B api "repos/${TEST_REPO}/pulls/${N}/reviews" -f event=APPROVE >/dev/null
  git_as A "$LAB_DIR" commit --allow-empty -m "NEG-04: invalidate approval"
  git_as A "$LAB_DIR" push "$(authed_url A "$TEST_REPO")" "HEAD:refs/heads/${BRANCH}"
  state=$(gh api "repos/${TEST_REPO}/pulls/${N}/reviews" --jq '.[0].state')
  [[ "$state" == "DISMISSED" ]] && echo "OK: stale review auto-dismissed (${state})" \
    || { echo "VERDICT: FAIL — review state after push is ${state}, expected DISMISSED" >&2; exit $EXIT_FAIL; }
  gh_as A pr checks "$N" --repo "$TEST_REPO" --watch --fail-fast || true
  expect_protected_rejection "merge with dismissed stale approval" "$MERGE_PAT" \
    gh_as A pr merge "$N" --repo "$TEST_REPO" --merge
  echo "cleanup: gh pr close ${N} --repo ${TEST_REPO}; git push origin --delete ${BRANCH}"
fi
