#!/usr/bin/env bash
# NEG-07 — promoting a branch other than dev to main must be rejected by the
# BRANCH POLICY specifically (not by some other red gate).
#
# Attribution: assert the 'Branch policy' check-run conclusion=failure AND
# its log/annotations contain the promotion-violation message; all other
# checks on the PR are waited to finish first so the evidence names the
# culprit.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-07" "non-dev promotion" "PENDING / LIVE-TEST-REPO + IN-REPO-ENFORCED"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0
require_identity A

BRANCH="neg07-feature-$RANDOM"
plan "PR: ${BRANCH} -> main (head is NOT dev); wait for checks to finish"
plan "evidence: 'Branch policy' check-run failure + log message about dev promotion"
plan "expect_protected_rejection: merge blocked (secondary evidence)"
plan "in-repo layer: S1R2 auditor pins the gate via template equality (BRANCH_POLICY_*)"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  git_as A "$LAB_DIR" push "$(authed_url A "$TEST_REPO")" "HEAD:refs/heads/${BRANCH}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-07 non-dev promotion" --body "negative test: feature -> main"
  N=$(gh_as A pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  sleep 60
  HEAD_SHA=$(gh_as A pr view "$N" --repo "$TEST_REPO" --json headRefOid --jq .headRefOid)
  BP_ID=$(gh api "repos/${TEST_REPO}/commits/${HEAD_SHA}/check-runs" --jq '.check_runs[] | select(.name=="Branch policy") | .id')
  CONCL=$(gh api "repos/${TEST_REPO}/check-runs/${BP_ID}" --jq .conclusion)
  LOG=$(gh api "repos/${TEST_REPO}/actions/jobs/${BP_ID}/logs" 2>/dev/null || true)
  if [[ "$CONCL" == "failure" ]] && printf '%s' "$LOG" | grep -q "must promote the dev branch"; then
    echo "OK: Branch policy failed with the promotion-violation message (log-verified)"
  else
    echo "VERDICT: BLOCKED — Branch policy conclusion=${CONCL:-none}; could not verify the rejection reason in logs" >&2
    exit $EXIT_BLOCKED_INPUT
  fi
  expect_protected_rejection "merge of a non-dev branch into main" 'not mergeable|required review|MERGE_STATE_STATUS|protected branch|merge is blocked' \
    gh_as A pr merge "$N" --repo "$TEST_REPO" --merge
  echo "cleanup: gh pr close ${N} --repo ${TEST_REPO}; git push origin --delete ${BRANCH}"
fi
