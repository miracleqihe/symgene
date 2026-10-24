#!/usr/bin/env bash
# NEG-01 — merging a pull request without any approval must be rejected.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-01" "unapproved merge" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0

BRANCH="neg01-$RANDOM"
plan "git -C \${LAB_DIR} push origin HEAD:refs/heads/${BRANCH}"
plan "gh_as A pr create --repo \${TEST_REPO} --base main --head ${BRANCH} --title 'NEG-01 unapproved merge' --body 'x'"
plan "expect_rejection: gh pr merge <N> --merge (no approving review exists)"
plan "expected platform response: merge refused (GraphQL 'Pull request is not mergeable' / MERGE_STATE_STATUS=BLOCKED; UI: 'Merging is blocked')"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  git -C "$LAB_DIR" push origin "HEAD:refs/heads/${BRANCH}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-01 unapproved merge" --body "negative test: merge without approval"
  N=$(gh_as A pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  expect_rejection "merge without any approval" \
    gh_as A pr merge "$N" --repo "$TEST_REPO" --merge
  cleanup_note="cleanup: gh pr close ${N} --repo ${TEST_REPO}; git push origin --delete ${BRANCH}"
  echo "$cleanup_note"
fi
