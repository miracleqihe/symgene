#!/usr/bin/env bash
# NEG-09 — publishing through the wrong Pages environment/ref must be rejected.
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
plan "case 1: dispatch deploy-pages.yml with ref=${BRANCH} (non-main)"
plan "  expected: run rejected/fails at the environment gate ('Branch \"${BRANCH}\" is not allowed to deploy to github-pages due to environment protection rules')"
plan "case 2: workflow_run/artifact path is absent by design; S1 audit CROSS_RUN_ARTIFACT + deploy-pages audits keep the wiring pinned"
plan "production check (no write): confirm prod env policy = main-only via GET /repos/miracleqihe/symgene/environments/github-pages/deployment-branch-policies"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  git -C "$LAB_DIR" push origin "HEAD:refs/heads/${BRANCH}"
  expect_rejection "workflow_dispatch of deploy-pages on a non-main ref" \
    gh api -X POST "repos/${TEST_REPO}/actions/workflows/deploy-pages.yml/dispatches" \
      -f ref="$BRANCH"
  echo "cleanup: git push origin --delete ${BRANCH}"
fi
