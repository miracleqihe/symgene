#!/usr/bin/env bash
# NEG-11 — after reviews are dismissed, the merge must stay blocked even
# though head1's checks were green.
#
# Attribution: head2's required checks are waited to GREEN first, then every
# remaining APPROVED review is dismissed (dismissal API), so the only missing
# gate is the review requirement. Official semantics note: skipped/neutral
# would SATISFY required checks (docs) — this scenario waits for genuinely
# green (successful) checks to exclude that ambiguity.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-11" "dismissed review + stale green checks" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0
require_identity A B

BRANCH="neg11-$RANDOM"
MERGE_PAT='not mergeable|required review|MERGE_STATE_STATUS|protected branch|merge is blocked'
plan "B approves at head1; wait for head1 checks green"
plan "A pushes head2 (authed URL); wait for head2 checks green"
plan "dismiss any remaining APPROVED reviews (dismissal API, needs dismissal rights)"
plan "expect_protected_rejection: merge blocked with genuinely green checks at head2"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  git_as A "$LAB_DIR" push "$(authed_url A "$TEST_REPO")" "HEAD:refs/heads/${BRANCH}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-11 dismissed review stale checks" --body "negative test"
  N=$(gh_as A pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  gh_as B api "repos/${TEST_REPO}/pulls/${N}/reviews" -f event=APPROVE >/dev/null
  echo "[live] waiting for head1 checks..."
  gh_as A pr checks "$N" --repo "$TEST_REPO" --watch --fail-fast || true
  git_as A "$LAB_DIR" commit --allow-empty -m "NEG-11: new head"
  git_as A "$LAB_DIR" push "$(authed_url A "$TEST_REPO")" "HEAD:refs/heads/${BRANCH}"
  echo "[live] waiting for head2 checks to be green..."
  gh_as A pr checks "$N" --repo "$TEST_REPO" --watch || true
  for id in $(gh api "repos/${TEST_REPO}/pulls/${N}/reviews" --jq '.[] | select(.state=="APPROVED") | .id'); do
    gh api -X PUT "repos/${TEST_REPO}/pulls/${N}/reviews/${id}/dismissals" -f message="NEG-11 dismissal" >/dev/null
  done
  REMAINING=$(gh api "repos/${TEST_REPO}/pulls/${N}/reviews" --jq '[.[] | select(.state=="APPROVED")] | length')
  [[ "$REMAINING" == "0" ]] && echo "OK: no approvals remain" \
    || { echo "VERDICT: BLOCKED — ${REMAINING} approval(s) survived dismissal (needs dismissal rights)" >&2; exit $EXIT_BLOCKED_AUTH; }
  expect_protected_rejection "merge after review dismissal with green head2 checks" "$MERGE_PAT" \
    gh_as A pr merge "$N" --repo "$TEST_REPO" --merge
  echo "cleanup: gh pr close ${N} --repo ${TEST_REPO}; git push origin --delete ${BRANCH}"
fi
