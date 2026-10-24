#!/usr/bin/env bash
# NEG-09 — publishing through the wrong Pages environment/ref must fail AT
# THE ENVIRONMENT GATE.
#
# R2 fixes retained: dispatch with ref only (no bogus client_payload), run
# associated by head_sha AND event, PASS requires run failure + failed job
# log containing the environment rejection + zero deployments for the sha.
# R3 fix (P1-16): the R2 script had a fallback to the LOCAL default git
# credentials when the authenticated push failed — removed. A failed
# authenticated push is a BLOCKED, never a silent default-credential push
# (which would misattribute the actor and could fake the result).
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-09" "wrong Pages environment / ref" "PENDING / LIVE-TEST-REPO (lab only)"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0
require_identity A

BRANCH="neg09-$RANDOM"
plan "push via authed_url(GH_A) ONLY — no local-credential fallback; failure => BLOCKED"
plan "dispatch deploy-pages.yml with ref=${BRANCH} (204 = queued, NOT a verdict)"
plan "locate run by event=workflow_dispatch AND head_sha=<branch head>"
plan "require: run conclusion=failure"
plan "require: failed job log contains 'environment protection rules' / 'not allowed to deploy' (source proof)"
plan "require: zero deployments for that sha and environment github-pages"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  if ! git_as A "$LAB_DIR" push "$(authed_url A "$TEST_REPO")" "HEAD:refs/heads/${BRANCH}"; then
    echo "VERDICT: BLOCKED — authenticated push as GH_A failed; refusing to fall back to local credentials" >&2
    exit $EXIT_BLOCKED_AUTH
  fi
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
