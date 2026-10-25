#!/usr/bin/env bash
# NEG-05 — skipped / neutral results and required checks: three ISOLATED
# experiments with read-only observation.
#
# OFFICIAL PLATFORM SEMANTICS (docs.github.com "Status checks"):
#   "A job that is skipped will report its status as 'Success'. It will not
#    prevent a pull request from merging, even if it is a required check."
#   "About protected branches": required checks are satisfied by
#   'successful', 'skipped' OR 'neutral' status.
#
# R4 fixes (P1-23):
#   - NO merge is performed anywhere (observation via mergeStateStatus only);
#   - three experiments use separate, disposable PRs; lab main is untouched;
#   - evidence recorded per case: real check-run conclusion, source App slug,
#     required-check match, and the PR merge state;
#   - preconditions are asserted BEFORE any MEASURED output; a missing
#     precondition (workflow not present, check-run absent, check-run
#     creation denied — the checks API needs a GitHub App) is BLOCKED;
#   - results are compared against the documented expectation and reported
#     as MEASURED-OK or MEASURED-DEVIATION (a deviation is a finding, never
#     a PASS).
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-05" "skipped / neutral required checks (three isolated experiments)" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0
require_identity A

plan "case A: job if:false named 'Branch policy' -> expect skipped check-run from app github-actions; mergeStateStatus CLEAN (docs: skipped satisfies)"
plan "case B: workflow filtered by paths:[nonexistent/**] -> NO check-run for the required name; mergeStateStatus BLOCKED (required pending)"
plan "case C: all-green PR + API-created neutral check-run -> mergeStateStatus CLEAN (docs: neutral satisfies); creation denial => BLOCKED"
plan "common: no merge; per-case disposable PR; deviations reported as MEASURED-DEVIATION"

observe_state() { gh pr view "$1" --repo "$TEST_REPO" --json mergeStateStatus --jq .mergeStateStatus 2>/dev/null || echo UNREADABLE; }
check_runs() { gh api "repos/${TEST_REPO}/commits/$1/check-runs" --jq '.check_runs[] | {name, conclusion, app: .app.slug}' 2>/dev/null || echo "[]"; }
close_case() { gh_as A pr close "$1" --repo "$TEST_REPO" >/dev/null 2>&1 || true; }

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  BLOCKED_CASES=0

  # ---------------- case A ----------------
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
  git_as A "$LAB_DIR" push "$(authed_url A "$TEST_REPO")" "HEAD:refs/heads/${BRANCH}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-05 case A (skipped)" --body "platform measurement" >/dev/null
  N=$(gh_as A pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  gh_as A pr checks "$N" --repo "$TEST_REPO" --watch --fail-fast || true
  HEAD_SHA=$(gh_as A pr view "$N" --repo "$TEST_REPO" --json headRefOid --jq .headRefOid)
  RUNS=$(check_runs "$HEAD_SHA")
  SKIPPED=$(echo "$RUNS" | grep -c '"conclusion": "skipped"' || true)
  ACTIONS_APP=$(echo "$RUNS" | grep -c '"app": "github-actions"' || true)
  STATE=$(observe_state "$N")
  if [[ "$SKIPPED" -lt 1 ]]; then
    echo "VERDICT: BLOCKED — case A precondition unmet: no skipped check-run observed (runs: ${RUNS})" >&2
    BLOCKED_CASES=$((BLOCKED_CASES+1))
  elif [[ "$STATE" == "CLEAN" ]]; then
    echo "MEASURED-OK[A]: skipped check-run present (app github-actions observed ${ACTIONS_APP}x), mergeStateStatus=${STATE} — matches docs (skipped satisfies required checks)"
  else
    echo "MEASURED-DEVIATION[A]: mergeStateStatus=${STATE}, docs expect CLEAN; skipped check-run observed ${SKIPPED}x"
  fi
  close_case "$N"

  # ---------------- case B ----------------
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
  git_as A "$LAB_DIR" push "$(authed_url A "$TEST_REPO")" "HEAD:refs/heads/${BRANCH}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-05 case B (filtered)" --body "platform measurement" >/dev/null
  N=$(gh_as A pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  sleep 30
  HEAD_SHA=$(gh_as A pr view "$N" --repo "$TEST_REPO" --json headRefOid --jq .headRefOid)
  RUNS=$(check_runs "$HEAD_SHA")
  PRESENT=$(echo "$RUNS" | grep -c '"name": "Branch policy"' || true)
  STATE=$(observe_state "$N")
  if [[ "$PRESENT" -ne 0 ]]; then
    echo "VERDICT: BLOCKED — case B precondition unmet: 'Branch policy' check-run exists despite the path filter" >&2
    BLOCKED_CASES=$((BLOCKED_CASES+1))
  elif [[ "$STATE" == "BLOCKED" ]]; then
    echo "MEASURED-OK[B]: required name absent (no check-run), mergeStateStatus=${STATE} — merge gate holds while the check is pending"
  else
    echo "MEASURED-DEVIATION[B]: mergeStateStatus=${STATE} with the required check absent; docs expect the merge to stay blocked"
  fi
  close_case "$N"

  # ---------------- case C ----------------
  BRANCH="neg05c-$RANDOM"
  git_as A "$LAB_DIR" commit --allow-empty -m "NEG-05C: neutral probe"
  git_as A "$LAB_DIR" push "$(authed_url A "$TEST_REPO")" "HEAD:refs/heads/${BRANCH}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-05 case C (neutral)" --body "platform measurement" >/dev/null
  N=$(gh_as A pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  gh_as A pr checks "$N" --repo "$TEST_REPO" --watch --fail-fast || true
  HEAD_SHA=$(gh_as A pr view "$N" --repo "$TEST_REPO" --json headRefOid --jq .headRefOid)
  if gh api -X POST "repos/${TEST_REPO}/check-runs" \
      -f name="Branch policy" -f head_sha="$HEAD_SHA" \
      -f status="completed" -f conclusion="neutral" \
      -f 'output[title]=NEG-05C neutral probe' >/dev/null 2>&1; then
    NEUTRAL=$(check_runs "$HEAD_SHA" | grep -c '"conclusion": "neutral"' || true)
    STATE=$(observe_state "$N")
    if [[ "$NEUTRAL" -lt 1 ]]; then
      echo "VERDICT: BLOCKED — case C precondition unmet: neutral check-run not visible after creation" >&2
      BLOCKED_CASES=$((BLOCKED_CASES+1))
    elif [[ "$STATE" == "CLEAN" ]]; then
      echo "MEASURED-OK[C]: neutral check-run present, mergeStateStatus=${STATE} — matches docs (neutral satisfies required checks)"
    else
      echo "MEASURED-DEVIATION[C]: mergeStateStatus=${STATE}, docs expect CLEAN"
    fi
  else
    echo "VERDICT: BLOCKED — check-run creation denied (the checks API requires a GitHub App with checks:write; user tokens cannot create check-runs). Case C requires a lab GitHub App — PENDING until provisioned" >&2
    BLOCKED_CASES=$((BLOCKED_CASES+1))
  fi
  close_case "$N"

  echo "cases blocked: ${BLOCKED_CASES} (blocked cases are inconclusive, not passes)"
  echo "cleanup: all case PRs closed without merging; case branches left for audit, lab main untouched"
fi
