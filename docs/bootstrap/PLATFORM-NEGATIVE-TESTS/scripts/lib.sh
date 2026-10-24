#!/usr/bin/env bash
# Shared harness for the symgene platform negative tests.
#
# VERDICT SEMANTICS — only a genuine GitHub protection rejection may PASS:
#   PASS     the command failed AND its error matches the scenario's expected
#            protection signature (checked FIRST, so platform rules that
#            surface as HTTP 403 — e.g. self-approval denial — still count).
#   FAIL     the command succeeded although protection should have denied it.
#   BLOCKED  inconclusive, never a pass: bad credentials (401), insufficient
#            permissions (403 without the protection signature), missing
#            target (404), network errors, invalid input, or a required test
#            identity that is not configured. Report BLOCKED scenarios as
#            "not yet proven"; do not count them toward coverage.
#
# SAFETY GUARD (hard-coded):
#   1. Production repositories are denied unconditionally.
#   2. LIVE=1 requires TEST_REPO to be a dedicated *-sec-lab repository.
#   3. Without LIVE=1, scripts only print their execution plan and the
#      expected platform response. No write API calls are made.

EXIT_FAIL=1
EXIT_BLOCKED_AUTH=70
EXIT_BLOCKED_INPUT=71
EXIT_BLOCKED_IDENTITY=72

# Production repositories are denied by name. The public website repo is
# hard-coded; register any other production repo (e.g. the private data
# pipeline) via PROD_REPOS (space-separated) so its name stays out of this
# public file. The *-sec-lab pattern gate below also blocks every non-lab
# repository regardless of this list.
FORBIDDEN_REPOS=(
  "miracleqihe/symgene"
  ${PROD_REPOS:-}
)

# Failures that indicate a harness/credential problem, not a protection
# decision. Checked AFTER the scenario pattern.
DISTRESS_RE='HTTP 40[134]|Bad credentials|Could not resolve|Connection (refused|reset|closed)|timed out|Not Found|Resource not accessible|Must have admin rights|requires authentication'

metadata() {
  echo "=== $1: $2 [status: $3] ==="
}

plan() { echo "[plan] $*"; }

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

# Every listed identity must have a token (GH_<NAME>) when running live.
# A missing account BLOCKS the scenario instead of running it under one
# identity and misreading the result.
require_identity() {
  if [[ "${LIVE:-0}" == "1" ]]; then
    local who token_var
    for who in "$@"; do
      token_var="GH_${who}"
      if [[ -z "${!token_var:-}" ]]; then
        echo "VERDICT: BLOCKED — identity GH_${who} is not configured; this scenario needs distinct accounts and refuses to run under a single identity" >&2
        exit $EXIT_BLOCKED_IDENTITY
      fi
    done
  fi
}

# Some scenarios are only meaningful as a non-admin collaborator (admin
# bypass would fake the result). Verifies the acting identity's permission.
require_actor_not_admin() {
  if [[ "${LIVE:-0}" == "1" ]]; then
    local repo="$1" who="${ACTOR:-A}" token_var="GH_${who}" login perm
    login=$(GH_TOKEN="${!token_var}" gh api user --jq .login) || {
      echo "VERDICT: BLOCKED — cannot resolve actor identity GH_${who}" >&2
      exit $EXIT_BLOCKED_AUTH
    }
    perm=$(GH_TOKEN="${!token_var}" gh api "repos/${repo}/collaborators/${login}/permission" --jq .permission) || {
      echo "VERDICT: BLOCKED — cannot read the actor's permission on ${repo}" >&2
      exit $EXIT_BLOCKED_AUTH
    }
    if [[ "$perm" == "admin" ]]; then
      echo "VERDICT: BLOCKED — actor ${login} is an admin on ${repo}; push semantics differ for admins and would fake this result" >&2
      exit $EXIT_BLOCKED_INPUT
    fi
    echo "[live] actor ${login} permission: ${perm}"
  fi
}

# Run gh as a specific lab identity (GH_<NAME> holds a PAT). In live mode a
# missing token is a hard BLOCKED, never a silent fallback.
gh_as() {
  local who="$1"; shift
  local token_var="GH_${who}"
  local token="${!token_var:-}"
  if [[ -n "$token" ]]; then
    GH_TOKEN="$token" gh "$@"
  elif [[ "${LIVE:-0}" == "1" ]]; then
    echo "VERDICT: BLOCKED — identity GH_${who} required for a live call is not configured" >&2
    exit $EXIT_BLOCKED_IDENTITY
  else
    echo "[warn] GH_${who} not set; simulate mode: would call gh $*" >&2
  fi
}

# expect_protected_rejection <desc> <protection-pattern> -- cmd [args...]
expect_protected_rejection() {
  local desc="$1" pattern="$2"; shift 2
  [[ "${1:-}" == "--" ]] && shift
  local out rc
  out=$("$@" 2>&1)
  rc=$?
  if [[ $rc -eq 0 ]]; then
    echo "VERDICT: FAIL — ${desc} was NOT rejected. Protection is missing or misconfigured. DO NOT ignore this." >&2
    return $EXIT_FAIL
  fi
  if printf '%s' "$out" | grep -Eqi "$pattern"; then
    echo "VERDICT: PASS — ${desc} rejected by a protection decision:"
    printf '%s\n' "$out" | head -3
    return 0
  fi
  if printf '%s' "$out" | grep -Eqi "$DISTRESS_RE"; then
    echo "VERDICT: BLOCKED — failure is a harness/permission problem, not a proven protection rejection:" >&2
    printf '%s\n' "$out" | head -5 >&2
    return $EXIT_BLOCKED_AUTH
  fi
  echo "VERDICT: BLOCKED — failure with an unrecognized error; not counted as protection:" >&2
  printf '%s\n' "$out" | head -5 >&2
  return $EXIT_BLOCKED_INPUT
}
