#!/usr/bin/env bash
# NEG-09 — publishing through the wrong Pages environment/ref must fail AT
# THE ENVIRONMENT GATE.
#
# R2 corrections:
#   1. dispatch parameters fixed: deploy-pages.yml declares no inputs, so the
#      dispatch sends ONLY ref (the earlier bogus client_payload argument is
#      removed — it could dissociate the request from the run);
#   2. the run is associated by head_sha AND event=workflow_dispatch;
#   3. the failure must be PROVEN to come from the github-pages ENVIRONMENT
#      protection rule: the failed job's log must contain the environment
#      rejection text; a run that fails elsewhere or with no matching log is
#      BLOCKED, not a pass;
#   4. NO Deployment may exist for that sha.
#
# WARNING: lab-only (lib.sh refuses non *-sec-lab repos). The lab repo must
# have the github-pages environment with a custom branch policy allowing only
# 'main' (mirroring production). Real Pages need not be enabled.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-09" "wrong Pages environment / ref" "PENDING / LIVE-TEST-REPO (lab only)"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0

BRANCH="neg09-$RANDOM"
plan "dispatch deploy-pages.yml with ref=${BRANCH} (204 = queued, NOT a verdict)"
plan "locate run by event=workflow_dispatch AND head_sha=<branch head>"
plan "require: run conclusion=failure"
plan "require: failed job log contains 'environment protection rules' / 'not allowed to deploy' (source proof)"
plan "require: zero deployments for that sha and environment github-pages"
plan "production read-only control: prod env policy = main-only (see inventory)"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  git_as A "$LAB_DIR" push "$(authed_url A "$TEST_REPO")" "HEAD:refs/heads/${BRANCH}" 2>/dev/null || \
    git -C "$LAB_DIR" push origin "HEAD:refs/heads/${BRANCH}"
  HEAD_SHA=$(git -C "$LAB_DIR" rev-parse HEAD)

  gh api -X POST "repos/${TEST_REPO}/actions/workflows/deploy-pages.yml/dispatches" -f ref="$BRANCH" >/dev/null
  echo "[live] dispatch accepted (queued); locating the run..."
  RUN_ID=""
  for _ in 1 2 3 4; do
    sleep 15
    RUN_ID=$(gh api "repos/${TEST_REPO}/actions/workflows/deploy-pages.yml/runs?event=workflow_dispatch&per_page=10" \
      --jq "[.workflow_runs[] | select(.head_sha==\"$HEAD_SHA\")][0].id") || RUN_ID=""
    [[ -n "$RUN_ID" && "$RUN_ID" != "null" ]] && break
  done
  if [[ -z "$RUN_ID" || "$RUN_ID" == "null" ]]; then
    echo "VERDICT: BLOCKED — no workflow run found for the dispatch; cannot prove the gate" >&2
    exit $EXIT_BLOCKED_INPUT
  fi

  CONCLUSION=$(gh api "repos/${TEST_REPO}/actions/runs/${RUN_ID}" --jq .conclusion)
  echo "[live] run ${RUN_ID} conclusion: ${CONCLUSION:-running}"
  if [[ "$CONCLUSION" != "failure" ]]; then
    echo "VERDICT: FAIL — run concluded '${CONCLUSION:-running}'; the environment gate did not stop a non-main publish" >&2
    exit $EXIT_FAIL
  fi

  FAILED_JOB=$(gh api "repos/${TEST_REPO}/actions/runs/${RUN_ID}/jobs" --jq '[.jobs[] | select(.conclusion=="failure")][0].id')
  JOB_LOG=$(gh api "repos/${TEST_REPO}/actions/jobs/${FAILED_JOB}/logs" 2>/dev/null || true)
  if printf '%s' "$JOB_LOG" | grep -Eqi 'environment protection rules|not allowed to deploy to github-pages'; then
    echo "OK: failure source verified — github-pages environment protection rule rejected the ref"
  else
    echo "VERDICT: BLOCKED — run failed but the log does not evidence the environment gate as the source; attribution unproven" >&2
    exit $EXIT_BLOCKED_INPUT
  fi

  DEPLOYMENTS=$(gh api "repos/${TEST_REPO}/deployments?sha=${HEAD_SHA}&environment=github-pages" --jq 'length')
  if [[ "$DEPLOYMENTS" != "0" ]]; then
    echo "VERDICT: FAIL — ${DEPLOYMENTS} deployment(s) exist for the non-main sha" >&2
    exit $EXIT_FAIL
  fi

  echo "VERDICT: PASS — run failed at the environment gate (log-verified), no deployment created for ${HEAD_SHA:0:12}"
  echo "cleanup: git push origin --delete ${BRANCH}"
fi
