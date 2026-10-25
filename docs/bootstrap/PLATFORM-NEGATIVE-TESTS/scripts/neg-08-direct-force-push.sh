#!/usr/bin/env bash
# NEG-08 — direct push / force push / deletion of protected branches must be
# rejected, executed under a VERIFIED non-admin identity.
#
# Identity binding: every git push goes through authed_url(GH_A) — the
# token is asserted to authenticate as GH_A_USER first; the local default
# credentials are never used (a default admin credential would fake the
# result or hide it).
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-08" "direct push / force push to protected branch" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0
require_identity A
require_actor_not_admin "$TEST_REPO"

plan "case 1: git push origin HEAD:main via GH_A authed URL -> rejected (protected branch)"
plan "case 2: git push --force origin HEAD:main -> rejected (non_fast_forward rule)"
plan "case 3: git push origin :main -> rejected (deletion rule)"
plan "case 4 (control): same operations against dev with dev-minimum -> also rejected"
plan "identity evidence: assert_identity A runs before any push"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  URL=$(authed_url A "$TEST_REPO")
  expect_protected_rejection "direct push to main" 'protected branch hook declined|remote rejected|protected' \
    git_as A "$LAB_DIR" push "$URL" HEAD:main
  expect_protected_rejection "force push to main" 'non-fast-forward|remote rejected|protected' \
    git_as A "$LAB_DIR" push --force "$URL" HEAD:main
  expect_protected_rejection "delete main" 'remote rejected|protected|deletion' \
    git_as A "$LAB_DIR" push "$URL" :main
  expect_protected_rejection "force push to dev" 'non-fast-forward|remote rejected|protected' \
    git_as A "$LAB_DIR" push --force "$URL" HEAD:dev
fi
