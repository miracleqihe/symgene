#!/usr/bin/env bash
# NEG-07 — promoting a branch other than dev to main must be rejected.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-07" "non-dev promotion" "PENDING / LIVE-TEST-REPO + IN-REPO-ENFORCED"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0

BRANCH="neg07-feature-$RANDOM"
plan "PR: ${BRANCH} -> main (head is NOT dev)"
plan "expected: 'Branch policy' check fails with 'Pull requests to main must promote the dev branch from this repository.'"
plan "expect_rejection: merge -> BLOCKED by the required failing check"
plan "in-repo layer: S1 audit keeps the branch-policy job intact (BRANCH_POLICY_* codes)"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  git -C "$LAB_DIR" push origin "HEAD:refs/heads/${BRANCH}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-07 non-dev promotion" --body "negative test: feature -> main"
  N=$(gh_as A pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  sleep 60   # let Branch policy run and fail
  expect_rejection "merge of a non-dev branch into main" \
    gh_as A pr merge "$N" --repo "$TEST_REPO" --merge
  echo "cleanup: gh pr close ${N} --repo ${TEST_REPO}; git push origin --delete ${BRANCH}"
fi
