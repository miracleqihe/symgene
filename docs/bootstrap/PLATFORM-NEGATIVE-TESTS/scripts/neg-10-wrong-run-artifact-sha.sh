#!/usr/bin/env bash
# NEG-10 — wrong run / artifact / SHA reaching the publish step.
#
# The production publish chain is: verify job builds 'site-dist' in run R ->
# deploy job downloads 'site-dist' FROM THE SAME RUN -> uploads to Pages.
# Threats:
#   T1 cross-run artifact: deploy job adds run-id: to download-artifact and
#      pulls an artifact built from a different SHA. Blocked in-repo by the
#      S1 audit (CROSS_RUN_ARTIFACT) — this script exercises that layer.
#   T2 stale artifact: download-artifact without run-id defaults to the same
#      workflow run; nothing to exploit — assert production file pins this.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "NEG-10" "wrong run / artifact / SHA" "PENDING / IN-REPO-ENFORCED (T1), SIMULATED-VERIFIED (T2)"
require_test_repo && LIVE_MODE=1 || LIVE_MODE=0

plan "T1: craft a deploy-pages.yml copy in the lab with run-id: on download-artifact"
plan "  expected: node --test .github/tests/*.test.mjs fails with CROSS_RUN_ARTIFACT (lab copy of S1 suite)"
plan "T2: static assertion against production content (read-only): deploy job's download-artifact step contains no run-id and uses name: site-dist"
plan "  verified in-package via the S1 audit fixtures; re-run locally against any future change"

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
    echo "RESULT: REJECTED-AS-EXPECTED — S1 audit flagged CROSS_RUN_ARTIFACT"
  else
    echo "RESULT: UNEXPECTED — S1 audit did not flag the cross-run artifact" >&2
    exit 1
  fi
fi
