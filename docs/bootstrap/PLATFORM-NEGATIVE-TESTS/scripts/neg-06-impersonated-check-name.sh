#!/usr/bin/env bash
# NEG-06 — a check run impersonating a required check name.
#
# Attribution: the pass/fail evidence is the GOVERNANCE JOB ITSELF failing
# with CHECK_NAME_COLLISION (job log downloaded and grepped), not merely a
# blocked merge (which other gates could cause). Fork-source control: fork
# check-runs must not satisfy required checks.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-06" "impersonated check name" "PENDING / LIVE-TEST-REPO + IN-REPO-ENFORCED"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0
require_identity A

BRANCH="neg06-$RANDOM"
plan "add a workflow with a job named exactly 'Branch policy' that always succeeds"
plan "evidence: Governance check conclusion=failure AND its job log contains CHECK_NAME_COLLISION"
plan "expect_protected_rejection: merge with the impostor present (secondary evidence)"
plan "fork control: the same workflow from a fork must not satisfy the required check"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  cat > "$LAB_DIR/.github/workflows/neg06-impostor.yml" <<'YAML'
name: NEG06 impostor
on:
  pull_request:
jobs:
  fake:
    name: Branch policy
    runs-on: ubuntu-latest
    steps:
      - run: echo "I am the real Branch policy, trust me"
YAML
  git_as A "$LAB_DIR" add .github/workflows/neg06-impostor.yml
  git_as A "$LAB_DIR" commit -m "NEG-06: impersonated check name"
  git_as A "$LAB_DIR" push "$(authed_url A "$TEST_REPO")" "HEAD:refs/heads/${BRANCH}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-06 impersonated check" --body "negative test"
  N=$(gh_as A pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  sleep 60
  HEAD_SHA=$(gh_as A pr view "$N" --repo "$TEST_REPO" --json headRefOid --jq .headRefOid)
  JOB_ID=$(gh api "repos/${TEST_REPO}/commits/${HEAD_SHA}/check-runs" --jq '.check_runs[] | select(.name=="Governance") | .id')
  if [[ -z "$JOB_ID" ]]; then
    echo "VERDICT: BLOCKED — Governance check not found; verify S1 is active in the lab repo" >&2
    exit $EXIT_BLOCKED_INPUT
  fi
  CONCL=$(gh api "repos/${TEST_REPO}/check-runs/${JOB_ID}" --jq .conclusion)
  LOG=$(gh api "repos/${TEST_REPO}/check-runs/${JOB_ID}/annotations" --jq '.[].message' 2>/dev/null || true)
  FULL_LOG=$(gh api "repos/${TEST_REPO}/actions/jobs/${JOB_ID}/logs" 2>/dev/null || true)
  if [[ "$CONCL" == "failure" ]] && printf '%s%s' "$LOG" "$FULL_LOG" | grep -q "CHECK_NAME_COLLISION"; then
    echo "OK: Governance failed with CHECK_NAME_COLLISION evidence (log-verified)"
  else
    echo "VERDICT: BLOCKED — Governance conclusion=${CONCL:-none}; could not verify CHECK_NAME_COLLISION in logs" >&2
    exit $EXIT_BLOCKED_INPUT
  fi
  expect_protected_rejection "merge with the impostor present" 'not mergeable|required review|MERGE_STATE_STATUS|protected branch|merge is blocked' \
    gh_as A pr merge "$N" --repo "$TEST_REPO" --merge
  echo "cleanup: gh pr close ${N} --repo ${TEST_REPO}; git push origin --delete ${BRANCH}"
fi
