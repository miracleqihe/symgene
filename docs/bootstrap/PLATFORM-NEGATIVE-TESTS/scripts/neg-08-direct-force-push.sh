#!/usr/bin/env bash
# NEG-08 — direct push and force push to protected branches must be rejected.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-08" "direct push / force push to protected branch" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0

plan "case 1: git push origin HEAD:main (no PR) -> expected remote rejected 'protected branch hook declined'"
plan "case 2: git push --force origin HEAD:main -> expected rejected by non_fast_forward ruleset rule"
plan "case 3: git push origin :main (delete) -> expected rejected by deletion ruleset rule"
plan "case 4 (control): same three operations against dev with dev-minimum ruleset -> also rejected"
plan "all cases run as a write-only collaborator (GH_A); an admin bypass result would be a finding"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  expect_rejection "direct push to main" git -C "$LAB_DIR" push origin HEAD:main
  expect_rejection "force push to main" git -C "$LAB_DIR" push --force origin HEAD:main
  expect_rejection "delete main" git -C "$LAB_DIR" push origin :main
  expect_rejection "force push to dev" git -C "$LAB_DIR" push --force origin HEAD:dev
fi
