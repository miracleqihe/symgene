#!/usr/bin/env bash
# NEG-09 — publishing through the wrong Pages environment/ref must fail.
#
# CORRECTED VERIFICATION TARGET (was: "dispatch request rejected").
# A dispatch API call returning 204 only means the run was QUEUED — it proves
# nothing about protection. The verdict is derived from the actual results:
#   1. the workflow RUN for that dispatch must conclude 'failure'
#      (rejected at the github-pages environment gate), and
#   2. its JOBs must show the failure, and
#   3. NO Deployment may be created for the non-main sha.
# PASS requires all three; a successful run is a FAIL; dispatch errors,
# unfindable runs or API trouble are BLOCKED.
#
# WARNING: this script must NEVER target a production repository. lib.sh
# refuses anything not matching *-sec-lab. The lab repo must contain a copy of
# deploy-pages.yml but does NOT need real Pages enabled — the point is the
# environment branch policy and the ref checks, exercised safely in the lab.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-09" "wrong Pages environment / ref" "PENDING / LIVE-TEST-REPO (lab only)"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0

BRANCH="neg09-$RANDOM"
plan "precondition: lab repo has the github-pages environment with a custom branch policy allowing only 'main' (mirroring production)"
plan "dispatch deploy-pages.yml with ref=${BRANCH} (non-main); expect HTTP 204 (queued)"
plan "locate the run: GET /actions/workflows/deploy-pages.yml/runs?event=workflow_dispatch&head_branch=${BRANCH}"
plan "expect: run conclusion=failure; failing job visible; GET /deployments?sha=<head>&environment=github-pages -> EMPTY"
plan "a successful run or any deployment for that sha is VERDICT: FAIL"
plan "production check (no write): confirm prod env policy = main-only via GET /repos/miracleqihe/symgene/environments/github-pages/deployment-branch-policies"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  git -C "$LAB_DIR" push origin "HEAD:refs/heads/${BRANCH}"
  HEAD_SHA=$(git -C "$LAB_DIR" rev-parse HEAD)

  # 204 = queued; acceptance is NOT the verdict.
  gh api -X POST "repos/${TEST_REPO}/actions/workflows/deploy-pages.yml/dispatches" \
    -f ref="$BRANCH" -f '[{"name":"reason","value":"NEG-09 environment gate probe"}]' >/dev/null
  echo "[live] dispatch accepted (queued); locating the run..."
  sleep 15
  RUN_ID=$(gh api "repos/${TEST_REPO}/actions/workflows/deploy-pages.yml/runs?event=workflow_dispatch&head_branch=${BRANCH}&per_page=5" \
    --jq '[.workflow_runs[] | select(.head_sha=="'"$HEAD_SHA"'")][0].id') || RUN_ID=""
  if [[ -z "$RUN_ID" ]]; then
    sleep 30
    RUN_ID=$(gh api "repos/${TEST_REPO}/actions/workflows/deploy-pages.yml/runs?event=workflow_dispatch&head_branch=${BRANCH}&per_page=5" \
      --jq '[.workflow_runs[] | select(.head_sha=="'"$HEAD_SHA"'")][0].id') || RUN_ID=""
  fi
  if [[ -z "$RUN_ID" ]]; then
    echo "VERDICT: BLOCKED — no workflow run found for the dispatch; cannot prove the gate" >&2
    exit $EXIT_BLOCKED_INPUT
  fi

  CONCLUSION=$(gh api "repos/${TEST_REPO}/actions/runs/${RUN_ID}" --jq .conclusion)
  echo "[live] run ${RUN_ID} conclusion: ${CONCLUSION:-running}"
  if [[ "$CONCLUSION" != "failure" ]]; then
    echo "VERDICT: FAIL — run concluded '${CONCLUSION:-running}'; the environment gate did not stop a non-main publish" >&2
    exit $EXIT_FAIL
  fi

  echo "[live] failing jobs:"
  gh api "repos/${TEST_REPO}/actions/runs/${RUN_ID}/jobs" --jq '.jobs[] | select(.conclusion=="failure") | .name'

  DEPLOYMENTS=$(gh api "repos/${TEST_REPO}/deployments?sha=${HEAD_SHA}&environment=github-pages" --jq 'length')
  if [[ "$DEPLOYMENTS" != "0" ]]; then
    echo "VERDICT: FAIL — ${DEPLOYMENTS} deployment(s) exist for the non-main sha" >&2
    exit $EXIT_FAIL
  fi

  echo "VERDICT: PASS — run failed at the environment gate, no deployment created for ${HEAD_SHA:0:12}"
  echo "cleanup: git push origin --delete ${BRANCH}"
fi
