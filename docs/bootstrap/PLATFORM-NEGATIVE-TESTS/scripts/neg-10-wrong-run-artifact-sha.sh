#!/usr/bin/env bash
# NEG-10 — wrong run / artifact / SHA reaching the publish step.
#
# R2: the two layers are now EXPLICITLY separated:
#   T1 (STATIC, executable today): the S1R2 auditor rejects cross-run
#      artifact pulls (run-id:) in the deploy job — this is a local audit
#      mutation test, not a platform verdict.
#   T2 (STATIC, executable today): production deploy job must consume the
#      same-run artifact (no run-id:) — covered by the S1R2 suite.
#   T3 (DYNAMIC, PENDING lab): REAL artifact/SHA publish-binding verification
#      using #37's deploy chain in the lab: the deploy job asserts
#      needs.verify.outputs.artifact_id/digest and AUTHORIZED_SHA; the lab
#      run must fail with a binding error when the artifact is tampered with
#      or the authorized sha diverges. Requires the lab repo to run #37's
#      hardened deploy-pages.yml. PENDING — never simulated as a pass.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-10" "wrong run / artifact / SHA" "T1/T2 IN-REPO-ENFORCED (static); T3 PENDING (lab)"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0

plan "T1 (static, local): mutate deploy-pages.yml with run-id: on download-artifact; node --test must fail with CROSS_RUN_ARTIFACT; restore"
plan "T2 (static, local): production file pinned: same-run artifact only (S1R2 suite green)"
plan "T3 (dynamic, PENDING lab): craft digest/sha mismatch against #37's binding chain; expect DEPLOY_APPROVAL_MISSING/binding failure; never simulated"

if [[ "$LIVE_MODE" == "1" ]]; then
  LAB_DIR="${LAB_DIR:?LIVE=1 requires LAB_DIR pointing at the lab clone}"
  cp "$LAB_DIR/.github/workflows/deploy-pages.yml" "$LAB_DIR/.github/workflows/deploy-pages.yml.bak"
  sed -i.bak 's/          name: site-dist/          name: site-dist\n          run-id: ${{ github.run_id }}/' \
    "$LAB_DIR/.github/workflows/deploy-pages.yml"
  set +e
  (cd "$LAB_DIR" && node --test .github/tests/*.test.mjs 2>&1 | tee /tmp/neg10.out | grep -q CROSS_RUN_ARTIFACT)
  rc=$?
  set -e
  mv "$LAB_DIR/.github/workflows/deploy-pages.yml.bak" "$LAB_DIR/.github/workflows/deploy-pages.yml"
  if [[ $rc -eq 0 ]]; then
    echo "RESULT: PASS (T1 static) — S1R2 audit flagged CROSS_RUN_ARTIFACT"
  else
    echo "RESULT: FAIL — S1R2 audit did not flag the cross-run artifact" >&2
    exit $EXIT_FAIL
  fi
  echo "T3: PENDING — real artifact/SHA binding verification needs the lab run of #37's deploy chain; not simulated here"
fi
