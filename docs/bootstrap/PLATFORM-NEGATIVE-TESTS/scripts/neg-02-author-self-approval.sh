#!/usr/bin/env bash
# NEG-02 — a pull request author approving their own PR must be rejected.
# The 403 self-approval denial IS the protection signature (platform rule,
# independent of rulesets). Identity binding: A's token must authenticate as
# GH_A_USER and be the PR author.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-02" "author self-approval" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0
require_identity A

BRANCH="neg02-$RANDOM"
plan "push as A (authed URL); PR authored by A; assert pr.user.login == GH_A_USER"
plan "expect_protected_rejection: gh_as A api .../reviews -f event=APPROVE"
plan "expected signature: HTTP 403 'Can not approve your own pull request'"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  git_as A "$LAB_DIR" push "$(authed_url A "$TEST_REPO")" "HEAD:refs/heads/${BRANCH}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-02 author self-approval" --body "negative test"
  N=$(gh_as A pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  AUTHOR=$(gh api "repos/${TEST_REPO}/pulls/${N}" --jq .user.login)
  if [[ "$AUTHOR" != "$(identity_var A USER)" ]]; then
    echo "VERDICT: BLOCKED — PR author is ${AUTHOR}, not the configured GH_A identity" >&2
    exit $EXIT_BLOCKED_INPUT
  fi
  expect_protected_rejection "author self-approval" 'Can not approve your own pull request|self-approve' \
    gh_as A api "repos/${TEST_REPO}/pulls/${N}/reviews" -f event=APPROVE
  echo "cleanup: gh pr close ${N} --repo ${TEST_REPO}; git push origin --delete ${BRANCH}"
fi
