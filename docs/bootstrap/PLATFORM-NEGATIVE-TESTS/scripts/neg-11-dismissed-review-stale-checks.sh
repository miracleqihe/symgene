#!/usr/bin/env bash
# NEG-11 — after a review is dismissed, old green check-runs from the earlier
# head SHA must not allow the merge.
#
# Expected platform semantics: required checks are evaluated against the
# PR's current head commit. Checks that passed on head1 do not count at
# head2, and with dismiss_stale_reviews_on_push the approval is gone too.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-11" "dismissed review + stale green checks" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0

BRANCH="neg11-$RANDOM"
plan "precondition: dismiss_stale_reviews_on_push=true; at least one required check green at head1"
plan "B approves at head1; wait for required checks to go green at head1"
plan "A pushes head2 (checks go pending/red; B's review becomes DISMISSED)"
plan "explicitly dismiss any remaining review: PUT /pulls/<N>/reviews/<id>/dismissals (needs dismissal rights = owner-side)"
plan "expect_rejection: merge at head2 despite head1's green checks -> BLOCKED"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  git -C "$LAB_DIR" push origin "HEAD:refs/heads/${BRANCH}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-11 dismissed review stale checks" --body "negative test"
  N=$(gh_as A pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  gh_as B api "repos/${TEST_REPO}/pulls/${N}/reviews" -f event=APPROVE >/dev/null
  echo "[live] waiting for head1 checks (timeout 300s)..."
  gh_as A pr checks "$N" --repo "$TEST_REPO" --watch --fail-fast || true
  git -C "$LAB_DIR" commit --allow-empty -m "NEG-11: new head" && git -C "$LAB_DIR" push origin "HEAD:refs/heads/${BRANCH}"
  for id in $(gh api "repos/${TEST_REPO}/pulls/${N}/reviews" --jq '.[] | select(.state=="APPROVED") | .id'); do
    gh api -X PUT "repos/${TEST_REPO}/pulls/${N}/reviews/${id}/dismissals" -f message="NEG-11 dismissal"
  done
  expect_rejection "merge after review dismissal with stale green checks" \
    gh_as A pr merge "$N" --repo "$TEST_REPO" --merge
  echo "cleanup: gh pr close ${N} --repo ${TEST_REPO}; git push origin --delete ${BRANCH}"
fi
