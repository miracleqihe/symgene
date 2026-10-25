#!/usr/bin/env bash
# NEG-05 — skipped / neutral results and required checks: three ISOLATED
# experiments (R5-C).
#
# Isolation guarantees (per experiment):
#   1. the lab clone is RESET to origin/main (hard reset + clean) before the
#      experiment's branch is created — no cumulative worktree, no
#      cross-experiment check sources;
#   2. the experiment's PR carries exactly ONE workflow change;
#   3. the PR is never merged; lab main is untouched;
#   4. evidence records check-run ID, conclusion, source app slug, HEAD SHA
#      and the PR merge state;
#   5. preconditions are asserted before any MEASURED output — unmet
#      preconditions, unstable platform state, missing permissions or an
#      app-slug mismatch are BLOCKED;
#   6. results are compared against the documented platform semantics
#      (docs.github.com "Status checks": skipped/neutral SATISFY required
#      checks) and reported as MEASURED-OK or MEASURED-DEVIATION.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-05" "skipped / neutral required checks (three isolated experiments)" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0
require_identity A

reset_baseline() {
  git_as A "$LAB_DIR" fetch "$(authed_url A "$TEST_REPO")" 'refs/heads/main:refs/remotes/origin/main' --force
  git_as A "$LAB_DIR" reset --hard origin/main
  git_as A "$LAB_DIR" clean -qfd
}

open_pr() {
  local branch="$1" title="$2"
  git_as A "$LAB_DIR" push "$(authed_url A "$TEST_REPO")" "HEAD:refs/heads/${branch}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$branch" \
    --title "$title" --body "platform measurement" >/dev/null
  gh_as A pr view --repo "$TEST_REPO" --head "$branch" --json number --jq .number
}

# evidence <head-sha>: prints check-run id/conclusion/app for the required name
evidence() {
  gh api "repos/${TEST_REPO}/commits/$1/check-runs" \
    --jq '.check_runs[] | select(.name=="Branch policy") | {id, conclusion, app: .app.slug}'
}

finish_case() {
  gh_as A pr close "$1" --repo "$TEST_REPO" >/dev/null 2>&1 || true
}

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  BLOCKED=0

  # ---------------- case A: job-level skip ----------------
  reset_baseline
  BRANCH="neg05a-$RANDOM"
  mkdir -p "$LAB_DIR/.github/workflows"
  cat > "$LAB_DIR/.github/workflows/neg05a.yml" <<'YAML'
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
  git_as A "$LAB_DIR" add .github/workflows/neg05a.yml
  git_as A "$LAB_DIR" commit -m "NEG-05A: skipped gate job (isolated)"
  N=$(open_pr "$BRANCH" "NEG-05 case A (skipped)")
  gh_as A pr checks "$N" --repo "$TEST_REPO" --watch --fail-fast || true
  HEAD_SHA=$(gh_as A pr view "$N" --repo "$TEST_REPO" --json headRefOid --jq .headRefOid)
  EV=$(evidence "$HEAD_SHA")
  echo "[case A] check-run evidence: ${EV:-none}"
  CONCL=$(echo "$EV" | grep -o '"conclusion": "[a-z]*"' | head -1 | cut -d'"' -f4)
  APP=$(echo "$EV" | grep -o '"app": "[a-z-]*"' | head -1 | cut -d'"' -f4)
  if [[ -z "$CONCL" ]]; then
    echo "VERDICT: BLOCKED — case A precondition unmet: no 'Branch policy' check-run at head" >&2
    BLOCKED=$((BLOCKED+1))
  elif [[ "$CONCL" != "skipped" || "$APP" != "github-actions" ]]; then
    echo "VERDICT: BLOCKED — case A precondition unmet: conclusion=${CONCL:-none} app=${APP:-none}" >&2
    BLOCKED=$((BLOCKED+1))
  else
    STATE=$(gh_as A pr view "$N" --repo "$TEST_REPO" --json mergeStateStatus --jq .mergeStateStatus)
    if [[ "$STATE" == "CLEAN" ]]; then
      echo "MEASURED-OK[A]: skipped check-run (app=${APP}), mergeStateStatus=${STATE} — matches docs (skipped satisfies required checks)"
    elif [[ "$STATE" == "BLOCKED" ]]; then
      echo "MEASURED-DEVIATION[A]: mergeStateStatus=BLOCKED with a skipped required check — platform deviates from documented semantics"
    else
      echo "VERDICT: BLOCKED — case A merge state ${STATE} is neither CLEAN nor BLOCKED; platform state not stable" >&2
      BLOCKED=$((BLOCKED+1))
    fi
  fi
  finish_case "$N"

  # ---------------- case B: workflow path filter (no check-run) ----------------
  reset_baseline
  BRANCH="neg05b-$RANDOM"
  cat > "$LAB_DIR/.github/workflows/neg05b.yml" <<'YAML'
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
  git_as A "$LAB_DIR" add .github/workflows/neg05b.yml
  git_as A "$LAB_DIR" commit -m "NEG-05B: path-filtered workflow (isolated)"
  N=$(open_pr "$BRANCH" "NEG-05 case B (filtered)")
  sleep 30
  HEAD_SHA=$(gh_as A pr view "$N" --repo "$TEST_REPO" --json headRefOid --jq .headRefOid)
  EV=$(evidence "$HEAD_SHA")
  echo "[case B] check-run evidence: ${EV:-none}"
  if [[ -n "$EV" ]]; then
    echo "VERDICT: BLOCKED — case B precondition unmet: a 'Branch policy' check-run exists despite the path filter" >&2
    BLOCKED=$((BLOCKED+1))
  else
    STATE=$(gh_as A pr view "$N" --repo "$TEST_REPO" --json mergeStateStatus --jq .mergeStateStatus)
    if [[ "$STATE" == "BLOCKED" ]]; then
      echo "MEASURED-OK[B]: required name absent (no check-run), mergeStateStatus=${STATE} — gate holds while the check is pending"
    else
      echo "MEASURED-DEVIATION[B]: mergeStateStatus=${STATE} with the required check absent"
    fi
  fi
  finish_case "$N"

  # ---------------- case C: API-created neutral check-run ----------------
  reset_baseline
  BRANCH="neg05c-$RANDOM"
  git_as A "$LAB_DIR" commit --allow-empty -m "NEG-05C: neutral probe (isolated)"
  N=$(open_pr "$BRANCH" "NEG-05 case C (neutral)")
  gh_as A pr checks "$N" --repo "$TEST_REPO" --watch --fail-fast || true
  HEAD_SHA=$(gh_as A pr view "$N" --repo "$TEST_REPO" --json headRefOid --jq .headRefOid)
  if gh api -X POST "repos/${TEST_REPO}/check-runs" \
      -f name="Branch policy" -f head_sha="$HEAD_SHA" \
      -f status="completed" -f conclusion="neutral" \
      -f 'output[title]=NEG-05C neutral probe' >/dev/null 2>&1; then
    EV=$(evidence "$HEAD_SHA")
    echo "[case C] check-run evidence: ${EV:-none}"
    NEUTRAL=$(echo "$EV" | grep -c '"conclusion": "neutral"' || true)
    STATE=$(gh_as A pr view "$N" --repo "$TEST_REPO" --json mergeStateStatus --jq .mergeStateStatus)
    if [[ "$NEUTRAL" -lt 1 ]]; then
      echo "VERDICT: BLOCKED — case C precondition unmet: neutral check-run not visible after creation" >&2
      BLOCKED=$((BLOCKED+1))
    elif [[ "$STATE" == "CLEAN" ]]; then
      echo "MEASURED-OK[C]: neutral check-run present, mergeStateStatus=${STATE} — matches docs (neutral satisfies required checks)"
    else
      echo "MEASURED-DEVIATION[C]: mergeStateStatus=${STATE}, docs expect CLEAN"
    fi
  else
    echo "VERDICT: BLOCKED — check-run creation denied (the checks API requires a GitHub App with checks:write; user tokens cannot create check-runs). Provision a lab GitHub App to run case C" >&2
    BLOCKED=$((BLOCKED+1))
  fi
  finish_case "$N"

  echo "blocked cases: ${BLOCKED} (blocked is inconclusive, never a pass)"
  echo "isolation: each experiment started from a fresh origin/main baseline; no merges; PRs closed"
fi
