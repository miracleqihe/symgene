#!/usr/bin/env bash
# NEG-05 — a required check that reports skipped/neutral must block the merge.
#
# Lab setup: add a workflow whose job has `if: false` and name it exactly like
# a required check (e.g. "Branch policy"). GitHub Actions does not emit a
# check-run for skipped jobs, so the required name never appears.
# A second case creates a check-run with conclusion=neutral via the API for a
# required context and expects the merge to stay blocked.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-05" "skipped / neutral required check" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0

BRANCH="neg05-$RANDOM"
plan "case 1 (skipped): PR whose workflow only contains a job with if:false named like a required check"
plan "  expected: the required check never appears -> merge BLOCKED (skipped is not success)"
plan "case 2 (neutral): POST /repos/\${TEST_REPO}/check-runs {name: <required>, conclusion: neutral, head_sha: <pr head>}"
plan "  expected: merge stays BLOCKED (neutral is not success for a required check)"
plan "anti-false-positive control: the same API call with conclusion=success (via a legitimately
        green run in the lab) unblocks the merge"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  mkdir -p "$LAB_DIR/.github/workflows"
  cat > "$LAB_DIR/.github/workflows/neg05-skipped.yml" <<'YAML'
name: NEG05 skipped
on:
  pull_request:
jobs:
  branch-policy:
    name: Branch policy
    if: false
    runs-on: ubuntu-latest
    steps:
      - run: echo "never runs"
YAML
  git -C "$LAB_DIR" add .github/workflows/neg05-skipped.yml
  git -C "$LAB_DIR" commit -m "NEG-05: skipped impostor" && git -C "$LAB_DIR" push origin "HEAD:refs/heads/${BRANCH}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-05 skipped required check" --body "negative test"
  N=$(gh_as A pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  expect_rejection "merge with a skipped required check" \
    gh_as A pr merge "$N" --repo "$TEST_REPO" --merge
  echo "cleanup: gh pr close ${N} --repo ${TEST_REPO}; git push origin --delete ${BRANCH}"
fi
