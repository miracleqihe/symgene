#!/usr/bin/env bash
# NEG-04 — an approval tied to an old head SHA must not survive a new push.
#
# B approves at head1; A pushes head2 with dismiss_stale_reviews_on_push=true.
# Expected: B's approval is automatically dismissed AND the merge stays
# blocked even though head1's check runs were green (checks attach to the
# commit that produced them).
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-04" "stale approval on old SHA" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0

BRANCH="neg04-$RANDOM"
plan "precondition: dismiss_stale_reviews_on_push=true in the main ruleset"
plan "B approves at head1; record the review id"
plan "A pushes head2"
plan "verify: GET /pulls/<N>/reviews shows B's review state=DISMISSED"
plan "expect_rejection: merge at head2 -> BLOCKED"
plan "control: without dismiss_stale the approval would survive -> this is exactly the behavior change under test"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  git -C "$LAB_DIR" push origin "HEAD:refs/heads/${BRANCH}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-04 stale approval" --body "negative test"
  N=$(gh_as A pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  gh_as B api "repos/${TEST_REPO}/pulls/${N}/reviews" -f event=APPROVE >/dev/null
  git -C "$LAB_DIR" commit --allow-empty -m "NEG-04: invalidate approval" && git -C "$LAB_DIR" push origin "HEAD:refs/heads/${BRANCH}"
  state=$(gh api "repos/${TEST_REPO}/pulls/${N}/reviews" --jq '.[0].state')
  [[ "$state" == "DISMISSED" ]] && echo "OK: stale review auto-dismissed (${state})" \
    || { echo "RESULT: UNEXPECTED — review state after push is ${state}, expected DISMISSED" >&2; exit 1; }
  expect_rejection "merge with dismissed stale approval" \
    gh_as A pr merge "$N" --repo "$TEST_REPO" --merge
  echo "cleanup: gh pr close ${N} --repo ${TEST_REPO}; git push origin --delete ${BRANCH}"
fi
