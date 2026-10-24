#!/usr/bin/env bash
# NEG-05 — skipped / neutral results must not satisfy a required check.
#
# Semantics being verified (see scenarios/NEG-05-skipped-neutral-checks.md):
#   case A: job-level `if: false` — Actions EMITS a check-run with
#           conclusion=skipped. Whether a skipped conclusion satisfies a
#           required check is platform behavior under test: PASS means the
#           merge was still blocked; a merge here is a FAIL (skip satisfies).
#   case B: workflow path/branch filters — no run at all for the ref, the
#           required name never appears; merge must stay blocked.
#   case C: a check-run forced to conclusion=neutral via the API — neutral is
#           not success; merge must stay blocked.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-05" "skipped / neutral required check" "PENDING / LIVE-TEST-REPO"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0
require_identity A

BRANCH="neg05-$RANDOM"
MERGE_PAT='not mergeable|required review|MERGE_STATE_STATUS|protected branch|merge is blocked'
plan "case A: PR whose workflow contains a job named like a required check with if:false"
plan "  record the check conclusion (skipped) via GET /commits/<head>/check-runs"
plan "  expect_protected_rejection: merge blocked despite the skipped conclusion"
plan "case B: workflow filtered out entirely (no run) -> required name absent -> blocked"
plan "case C: API-created check-run with conclusion=neutral -> blocked"
plan "verdict rule: PASS only when the merge is rejected by protection; skipped-check"
plan "satisfying the gate would be VERDICT: FAIL (finding to fix the required set)."

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
  git -C "$LAB_DIR" commit -m "NEG-05: skipped gate job" && git -C "$LAB_DIR" push origin "HEAD:refs/heads/${BRANCH}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-05 skipped required check" --body "negative test"
  N=$(gh_as A pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  HEAD_SHA=$(gh_as A pr view "$N" --repo "$TEST_REPO" --json headRefOid --jq .headRefOid)
  echo "[live] case A: check runs at head:"
  gh api "repos/${TEST_REPO}/commits/${HEAD_SHA}/check-runs" --jq '.check_runs[] | {name, conclusion}'
  expect_protected_rejection "merge with a skipped required check" "$MERGE_PAT" \
    gh_as A pr merge "$N" --repo "$TEST_REPO" --merge
  echo "cleanup: gh pr close ${N} --repo ${TEST_REPO}; git push origin --delete ${BRANCH}"
fi
