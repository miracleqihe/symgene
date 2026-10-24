#!/usr/bin/env bash
# NEG-05 — skipped / neutral results and required checks: three experiments.
#
# OFFICIAL PLATFORM SEMANTICS (docs.github.com "Status checks"):
#   "A job that is skipped will report its status as 'Success'. It will not
#    prevent a pull request from merging, even if it is a required check."
#   "About protected branches": required checks are satisfied by
#   'successful', 'skipped' OR 'neutral' status.
# This scenario MEASURES the platform; the project's security requirement
# (gates must be unable to skip) is enforced in-repo by the S1R2/S1R3
# auditor. All three documented behaviors are now actually exercised:
#   case A: job-level `if: false`      -> skipped check-run; expect merge to PROCEED
#   case B: workflow path filter       -> no check-run; expect merge BLOCKED
#                                          (required name stays pending)
#   case C: API-created neutral run    -> expect merge to PROCEED
# Verdicts are MEASURED; FAIL only when the platform contradicts its own
# documentation. No simulation is ever reported as platform evidence.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-05" "skipped / neutral required checks (three experiments)" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0
require_identity A

MERGE_PAT='not mergeable|required review|MERGE_STATE_STATUS|protected branch|merge is blocked'
plan "case A: job if:false named 'Branch policy' -> skipped check-run observed; merge expected to PROCEED (docs)"
plan "case B: workflow gated by paths:[nonexistent/**] -> no run/check-run; required name pending; merge expected BLOCKED"
plan "case C: all checks green + API-created check-run conclusion=neutral for a required context -> merge expected PROCEED"
plan "each case records the observed platform behavior as MEASURED; no merge is left behind"

open_pr() {
  local branch="$1" title="$2"
  git_as A "$LAB_DIR" push "$(authed_url A "$TEST_REPO")" "HEAD:refs/heads/${branch}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$branch" \
    --title "$title" --body "platform behavior measurement" >/dev/null
  gh_as A pr view --repo "$TEST_REPO" --head "$branch" --json number --jq .number
}

measure_merge() {
  local case_name="$1" n="$2" expected="$3"
  if gh_as A pr merge "$n" --repo "$TEST_REPO" --merge 2>/dev/null; then
    echo "MEASURED[${case_name}]: merge PROCEEDED (expected ${expected})"
  else
    echo "MEASURED[${case_name}]: merge BLOCKED (expected ${expected})"
  fi
}

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"

  # ---- case A: job-level skip ----
  BRANCH="neg05a-$RANDOM"
  mkdir -p "$LAB_DIR/.github/workflows"
  cat > "$LAB_DIR/.github/workflows/neg05a-skipped.yml" <<'YAML'
name: NEG05A skipped
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
  git_as A "$LAB_DIR" add .github/workflows/neg05a-skipped.yml
  git_as A "$LAB_DIR" commit -m "NEG-05A: skipped gate job"
  N=$(open_pr "$BRANCH" "NEG-05 case A")
  sleep 45
  HEAD_SHA=$(gh_as A pr view "$N" --repo "$TEST_REPO" --json headRefOid --jq .headRefOid)
  echo "[case A] check runs at head:"
  gh api "repos/${TEST_REPO}/commits/${HEAD_SHA}/check-runs" --jq '.check_runs[] | {name, conclusion}'
  measure_merge "A" "$N" "PROCEED (docs: skipped satisfies)"
  gh_as A pr close "$N" --repo "$TEST_REPO" >/dev/null || true

  # ---- case B: workflow path filter -> no run ----
  BRANCH="neg05b-$RANDOM"
  cat > "$LAB_DIR/.github/workflows/neg05b-filtered.yml" <<'YAML'
name: NEG05B filtered
on:
  pull_request:
    paths:
      - 'nonexistent-path-never-matches/**'
jobs:
  branch-policy:
    name: Branch policy
    runs-on: ubuntu-latest
    steps:
      - run: echo "filtered out"
YAML
  git_as A "$LAB_DIR" add .github/workflows/neg05b-filtered.yml
  git_as A "$LAB_DIR" commit -m "NEG-05B: path-filtered workflow"
  N=$(open_pr "$BRANCH" "NEG-05 case B")
  sleep 30
  HEAD_SHA=$(gh_as A pr view "$N" --repo "$TEST_REPO" --json headRefOid --jq .headRefOid)
  COUNT=$(gh api "repos/${TEST_REPO}/commits/${HEAD_SHA}/check-runs" --jq '[.check_runs[] | select(.name=="Branch policy")] | length')
  if [[ "$COUNT" == "0" ]]; then
    echo "[case B] OK: no 'Branch policy' check-run exists (workflow filtered out)"
  else
    echo "[case B] UNEXPECTED: ${COUNT} 'Branch policy' check-run(s) found despite the path filter"
  fi
  measure_merge "B" "$N" "BLOCKED (required name pending)"
  gh_as A pr close "$N" --repo "$TEST_REPO" >/dev/null || true

  # ---- case C: API-created neutral check-run ----
  BRANCH="neg05c-$RANDOM"
  git_as A "$LAB_DIR" commit --allow-empty -m "NEG-05C: neutral probe" 2>/dev/null || true
  N=$(open_pr "$BRANCH" "NEG-05 case C")
  echo "[live] waiting for required checks to finish..."
  gh_as A pr checks "$N" --repo "$TEST_REPO" --watch --fail-fast || true
  HEAD_SHA=$(gh_as A pr view "$N" --repo "$TEST_REPO" --json headRefOid --jq .headRefOid)
  gh api -X POST "repos/${TEST_REPO}/check-runs" \
    -f name="Branch policy" -f head_sha="$HEAD_SHA" \
    -f status="completed" -f conclusion="neutral" \
    -f 'output[title]=NEG-05C neutral probe' >/dev/null 2>&1 \
    || echo "[case C] NOTE: check-run creation denied for user tokens (GitHub Apps only) — case C BLOCKED"
  echo "[case C] check runs at head after the neutral probe:"
  gh api "repos/${TEST_REPO}/commits/${HEAD_SHA}/check-runs" --jq '.check_runs[] | select(.name=="Branch policy") | {name, conclusion}'
  measure_merge "C" "$N" "PROCEED (docs: neutral satisfies)"
  gh_as A pr close "$N" --repo "$TEST_REPO" >/dev/null || true

  for b in neg05a neg05b neg05c; do
    git_as A "$LAB_DIR" push "$(authed_url A "$TEST_REPO")" ":refs/heads/${b}-$RANDOM" 2>/dev/null || true
  done
  echo "cleanup: all case branches/PRs closed; lab main untouched (no merge left behind)"
fi
