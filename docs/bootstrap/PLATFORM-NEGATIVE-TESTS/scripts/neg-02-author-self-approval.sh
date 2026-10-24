#!/usr/bin/env bash
# NEG-02 — a pull request author approving their own PR must be rejected.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-02" "author self-approval" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0

BRANCH="neg02-$RANDOM"
plan "create PR authored by identity A (branch ${BRANCH} -> main)"
plan "expect_rejection: gh_as A api repos/\${TEST_REPO}/pulls/<N>/reviews -f event=APPROVE"
plan "expected platform response: HTTP 403 'Can not approve your own pull request' (self-approval is a platform-level rule, independent of any ruleset)"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  git -C "$LAB_DIR" push origin "HEAD:refs/heads/${BRANCH}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-02 author self-approval" --body "negative test"
  N=$(gh_as A pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  expect_rejection "author self-approval" \
    gh_as A api "repos/${TEST_REPO}/pulls/${N}/reviews" -f event=APPROVE
  echo "cleanup: gh pr close ${N} --repo ${TEST_REPO}; git push origin --delete ${BRANCH}"
fi
