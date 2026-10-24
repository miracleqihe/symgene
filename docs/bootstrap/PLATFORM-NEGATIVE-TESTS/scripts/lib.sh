#!/usr/bin/env bash
# Shared harness for the symgene platform negative tests.
#
# SAFETY GUARD (hard-coded):
#   1. Production repositories are denied unconditionally.
#   2. LIVE=1 requires TEST_REPO to be a dedicated *-sec-lab repository.
#   3. Without LIVE=1, scripts only print their execution plan and the
#      expected platform response. No write API calls are made.

# Production repositories are denied by name. The public website repo is
# hard-coded; register any other production repo (e.g. the private data
# pipeline) via PROD_REPOS (space-separated) so its name stays out of this
# public file. The *-sec-lab pattern gate below also blocks every non-lab
# repository regardless of this list.
FORBIDDEN_REPOS=(
  "miracleqihe/symgene"
  ${PROD_REPOS:-}
)

metadata() {
  echo "=== $1: $2 [status: $3] ==="
}

is_forbidden_repo() {
  # lowercase without bash-4 ${var,,} (macOS ships bash 3.2)
  local r
  r=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
  r="${r%/}"
  local f
  for f in "${FORBIDDEN_REPOS[@]}"; do
    [[ "$r" == "$f" ]] && return 0
  done
  return 1
}

# Returns 0 when live execution is authorized, 1 when in simulate mode.
require_test_repo() {
  if [[ "${LIVE:-0}" != "1" ]]; then
    echo "[simulate] LIVE not set: printing the plan only. No write API calls will be made."
    return 1
  fi
  if [[ -z "${TEST_REPO:-}" ]]; then
    echo "FATAL: LIVE=1 requires TEST_REPO (e.g. y4ho0/symgene-sec-lab)" >&2
    exit 64
  fi
  local r
  r=$(printf '%s' "$TEST_REPO" | tr '[:upper:]' '[:lower:]')
  case "$r" in
    */*-sec-lab) : ;;
    *)
      echo "FATAL: TEST_REPO must be a dedicated *-sec-lab repository (got: ${TEST_REPO})" >&2
      exit 64
      ;;
  esac
  if is_forbidden_repo "$TEST_REPO"; then
    echo "FATAL: refusing to run against a production repository: ${TEST_REPO}" >&2
    exit 65
  fi
  gh repo view "$TEST_REPO" --json name >/dev/null 2>&1 || {
    echo "FATAL: TEST_REPO not accessible with the current credentials: ${TEST_REPO}" >&2
    exit 66
  }
  return 0
}

# Run gh as a specific lab identity. GH_A / GH_B hold a PAT for that identity.
gh_as() {
  local who="$1"; shift
  local token_var="GH_${who}"
  local token="${!token_var:-}"
  if [[ -n "$token" ]]; then
    GH_TOKEN="$token" gh "$@"
  else
    echo "[warn] GH_${who} not set; falling back to the default gh identity for: gh $*" >&2
    gh "$@"
  fi
}

# Invert the exit status: a rejection is the expected outcome.
expect_rejection() {
  local desc="$1"; shift
  if "$@"; then
    echo "RESULT: UNEXPECTED-SUCCESS — ${desc} was NOT rejected. Protection is missing or misconfigured. DO NOT ignore this." >&2
    return 1
  else
    echo "RESULT: REJECTED-AS-EXPECTED — ${desc}"
    return 0
  fi
}

plan() { echo "[plan] $*"; }
