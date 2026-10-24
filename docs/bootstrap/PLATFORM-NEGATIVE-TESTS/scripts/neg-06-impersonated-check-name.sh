#!/usr/bin/env bash
# NEG-06 — a check run impersonating a required check name.
#
# Threat: a collaborator adds a workflow that emits a check named exactly like
# a required check ("Branch policy") and always succeeds, satisfying the
# status-check gate without performing the real policy.
#
# Layers under test:
#   L1 (rulesets): required_status_checks entries can bind integration_id, so
#      only check-runs from the chosen app count. NOTE: all Actions check-runs
#      share the Actions app id — binding does NOT distinguish workflows inside
#      Actions. This is a known platform limitation; the test documents it.
#   L2 (in-repo, verified): S1's Governance audit flags duplicate check-run
#      names (CHECK_NAME_COLLISION) — the impostor job fails CI.
#   L3 (reviews): /.github/ changes require code-owner review.
#
# Fork variant: check-runs from fork PRs are expected NOT to satisfy required
# checks (platform rule) — the control case in the lab.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-06" "impersonated check name" "PENDING / IN-REPO-ENFORCED"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0
require_identity A

BRANCH="neg06-$RANDOM"
plan "case 1 (same-repo impostor): add workflow with job name 'Branch policy' that always succeeds"
plan "  expected L2: Governance check fails with CHECK_NAME_COLLISION -> merge blocked at CI layer"
plan "  expected L1 residual: if Governance is not required yet, the impostor DOES satisfy the name gate (documented limitation)"
plan "case 2 (fork impostor): same workflow from a fork"
plan "  expected: fork check-runs never satisfy required checks -> merge BLOCKED"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  cat > "$LAB_DIR/.github/workflows/neg06-impostor.yml" <<'YAML'
name: NEG06 impostor
on:
  pull_request:
jobs:
  fake:
    name: Branch policy
    runs-on: ubuntu-latest
    steps:
      - run: echo "I am the real Branch policy, trust me"
YAML
  git -C "$LAB_DIR" add .github/workflows/neg06-impostor.yml
  git -C "$LAB_DIR" commit -m "NEG-06: impersonated check name" && git -C "$LAB_DIR" push origin "HEAD:refs/heads/${BRANCH}"
  gh_as A pr create --repo "$TEST_REPO" --base main --head "$BRANCH" \
    --title "NEG-06 impersonated check" --body "negative test"
  N=$(gh_as A pr view --repo "$TEST_REPO" --head "$BRANCH" --json number --jq .number)
  sleep 60   # let CI produce the impostor check
  if gh_as A pr checks "$N" --repo "$TEST_REPO" | grep -qi "Governance.*fail"; then
    echo "OK: Governance audit caught the impostor (CHECK_NAME_COLLISION path)"
  else
    echo "RESULT: INCONCLUSIVE — Governance did not fail; verify S1 is active in the lab repo" >&2
    exit 1
  fi
  expect_protected_rejection "merge with the impostor present" 'not mergeable|required review|MERGE_STATE_STATUS|protected branch|merge is blocked' \
    gh_as A pr merge "$N" --repo "$TEST_REPO" --merge
  echo "cleanup: gh pr close ${N} --repo ${TEST_REPO}; git push origin --delete ${BRANCH}"
fi
