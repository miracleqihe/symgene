#!/usr/bin/env bash
# selftest.sh — real Bash execution tests for the shared verdict functions
# (P1-24). Runs offline: every "platform" response is a controlled bash -c
# payload, so PASS/FAIL/BLOCKED classification is verified deterministically,
# including the set -e regression: a failing subcommand must NOT abort the
# script before the verdict is printed.
#
# Usage: bash selftest.sh   (exit 0 = all cases pass)
set -euo pipefail
cd "$(dirname "$0")"
. ./lib.sh

pass=0
failn=0

# check <name> <expected-rc> <expected-output-marker> <pattern> <payload>
check() {
  local name="$1" want_rc="$2" marker="$3" pattern="$4" payload="$5"
  local out rc
  rc=0
  out=$(set -euo pipefail; . ./lib.sh; expect_protected_rejection "t" "$pattern" -- bash -c "$payload") || rc=$?
  if [[ "$rc" == "$want_rc" && "$out" == *"$marker"* ]]; then
    pass=$((pass+1)); echo "ok  - $name (rc=${rc})"
  else
    failn=$((failn+1)); echo "NOT OK - $name: rc=${rc} (want ${want_rc}); output: ${out}" >&2
  fi
}

# 1. protection rejection -> PASS (rc 0), even though the payload failed
check "P1-24 PASS path" "$EXIT_PASS" "VERDICT: PASS" 'protected' 'echo "remote: protected branch hook declined" >&2; exit 1'
# 2. unexpected success -> FAIL (rc 1)
check "P1-24 FAIL path" "$EXIT_FAIL" "VERDICT: FAIL" 'protected' 'exit 0'
# 3. auth/permission problem -> BLOCKED (rc 70), verdict still printed
check "P1-24 BLOCKED auth" "$EXIT_BLOCKED_AUTH" "VERDICT: BLOCKED" 'protected' 'echo "HTTP 403 Resource not accessible" >&2; exit 1'
# 4. unknown error -> BLOCKED (rc 71)
check "P1-24 BLOCKED unknown" "$EXIT_BLOCKED_INPUT" "VERDICT: BLOCKED" 'protected' 'echo "weird failure" >&2; exit 1'
# 5. self-approval style 403 WITH the protection signature -> PASS
check "P1-24 signed 403 counts as protection" "$EXIT_PASS" "VERDICT: PASS" 'Can not approve your own pull request' 'echo "gh: Can not approve your own pull request (HTTP 403)" >&2; exit 1'
# 6. positive control accepted -> PASS
rc=0
out=$(set -euo pipefail; . ./lib.sh; expect_accepted "t" -- bash -c 'exit 0') || rc=$?
if [[ "$rc" == "0" && "$out" == *"VERDICT: PASS (positive control)"* ]]; then pass=$((pass+1)); echo "ok  - expect_accepted PASS path"; else failn=$((failn+1)); echo "NOT OK - expect_accepted PASS" >&2; fi
# 7. positive control failing -> FAIL
rc=0
out=$(set -euo pipefail; . ./lib.sh; expect_accepted "t" -- bash -c 'echo "not mergeable" >&2; exit 1') || rc=$?
if [[ "$rc" == "$EXIT_FAIL" && "$out" == *"VERDICT: FAIL"* ]]; then pass=$((pass+1)); echo "ok  - expect_accepted FAIL path"; else failn=$((failn+1)); echo "NOT OK - expect_accepted FAIL" >&2; fi
# 8. set -e regression: after a BLOCKED verdict the CALLER continues when the
#    non-zero return is handled ("|| true") — proves the verdict was printed
#    and execution reached the end of the function.
rc=0
out=$(set -euo pipefail; . ./lib.sh; expect_protected_rejection "t" 'protected' -- bash -c 'echo "remote rejected: protected branch" >&2; exit 1' || true; echo CONTINUED) || rc=$?
if [[ "$out" == *"VERDICT: PASS"* && "$out" == *"CONTINUED"* ]]; then pass=$((pass+1)); echo "ok  - caller continues after handled verdict (set -e regression)"; else failn=$((failn+1)); echo "NOT OK - set -e regression: ${out}" >&2; fi
# 9. missing identity in live mode -> BLOCKED 72, no network call
rc=0
out=$(set -euo pipefail; export LIVE=1 TEST_REPO=y4ho0/lab-sec-lab; . ./lib.sh; require_identity A) || rc=$?
if [[ "$rc" == "$EXIT_BLOCKED_IDENTITY" && "$out" == *"VERDICT: BLOCKED"* ]]; then pass=$((pass+1)); echo "ok  - require_identity blocks when unconfigured"; else failn=$((failn+1)); echo "NOT OK - require_identity: rc=${rc} out=${out}" >&2; fi
# 10. production repo guard still hard-denies
rc=0
out=$(set -euo pipefail; export LIVE=1 TEST_REPO=miracleqihe/symgene; . ./lib.sh; require_test_repo) || rc=$?
if [[ "$rc" == "64" ]]; then pass=$((pass+1)); echo "ok  - production repo guard"; else failn=$((failn+1)); echo "NOT OK - guard: rc=${rc}" >&2; fi

echo "selftest: ${pass} ok, ${failn} not ok"
[[ "$failn" == "0" ]]
