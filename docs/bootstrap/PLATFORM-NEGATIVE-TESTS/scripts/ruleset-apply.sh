#!/usr/bin/env bash
# Apply a ruleset JSON to a repository — guarded like every negative-test script.
#
# Usage:
#   ./ruleset-apply.sh <ruleset.json>            # simulate: validates and prints
#   LIVE=1 TEST_REPO=y4ho0/foo-sec-lab ./ruleset-apply.sh <ruleset.json>
set -euo pipefail
. "$(dirname "$0")/lib.sh"

metadata "RULESET-APPLY" "inject target-state rulesets into the lab repo" "PENDING (lab only)"

JSON_FILE="${1:?usage: ruleset-apply.sh <ruleset.json>}"
[[ -f "$JSON_FILE" ]] || { echo "FATAL: no such file: $JSON_FILE" >&2; exit 66; }

NAME=$(node -e 'const j=require(process.argv[1]);console.log(j.name)' "$JSON_FILE" 2>/dev/null \
  || python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["name"])' "$JSON_FILE")

if require_test_repo; then
  # Schema validation happens server-side; a 422 with field errors means the
  # JSON template needs updating against the current API schema (expected
  # possibility; see RULESET-MIGRATION-PLAN.md §3 caveat).
  echo "[live] creating ruleset ${NAME} in ${TEST_REPO}"
  gh api -X POST "repos/${TEST_REPO}/rulesets" --input "$JSON_FILE"
  echo "[live] created. List: gh api repos/${TEST_REPO}/rulesets"
else
  plan "gh api -X POST repos/\${TEST_REPO}/rulesets --input ${JSON_FILE}   (ruleset: ${NAME})"
  plan "target repo must match *-sec-lab; production repos are refused by lib.sh"
  plan "expected server response: 201 Created (or 422 with schema field errors -> update template)"
  exit 0
fi
