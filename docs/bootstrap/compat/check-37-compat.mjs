// Isolated compatibility test: PR #37 workflows × S1 Governance × S0 policy.
//
// Proves, against a checkout of codex/t03-website-security (PR #37 head):
//   Phase A — unreconciled: #37's deploy-pages.yml keeps the push trigger, so
//     the S1 Governance audit MUST flag it (DEPLOY_TRIGGER_PUSH /
//     DEPLOY_TRIGGER_NOT_DISPATCH_ONLY). A promotion of #37 as-is is caught.
//   Phase B — S0-reconciled: applying the minimal S0 delta to #37's version
//     (remove the push trigger; drop 'push' from the authorization allowlist)
//     must leave ZERO S0/S1-invariant violations — i.e. #37's hardened CI,
//     the S1 audit suite, and the dispatch-only publish policy coexist.
//     Any residual violations are printed in full; codes in KNOWN_RESIDUAL
//     are pre-declared #37-internal findings (not S0/S1 interactions) and are
//     reported, never silently suppressed.
//
// Usage: node check-37-compat.mjs <path-to-#37-checkout>
//   e.g. git fetch origin codex/t03-website-security
//        git worktree add --detach /tmp/t37head <head-sha>
//        node docs/bootstrap/compat/check-37-compat.mjs /tmp/t37head
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditRepository, formatViolations } from '../../../.github/tests/lib/audit-governance.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const root37 = path.resolve(process.argv[2] ?? '')
if (!fs.existsSync(path.join(root37, '.github', 'workflows'))) {
  console.error(`usage: node check-37-compat.mjs <#37 checkout root> (got: ${root37})`)
  process.exit(2)
}

const S0_S1_INVARIANT_CODES = new Set([
  'DEPLOY_TRIGGER_PUSH', 'DEPLOY_TRIGGER_NOT_DISPATCH_ONLY', 'DEPLOY_TRIGGER_SCHEDULE',
  'DEPLOY_ENV_NOT_PAGES', 'DEPLOY_PERMISSIONS_MISSING', 'CROSS_RUN_ARTIFACT',
  'DEPLOY_CONCURRENCY_GROUP_CHANGED', 'PAGES_ENTRY_WORKFLOW_MISSING',
  'JOB_PRIVILEGE_ESCALATION', 'TOP_PERMISSIONS_MISSING', 'TOP_PERMISSIONS_NOT_LEAST_PRIVILEGE',
  'PR_TARGET_HEAD_CHECKOUT', 'PR_TARGET_HEAD_REFERENCE',
  'BRANCH_POLICY_JOB_MISSING', 'BRANCH_POLICY_WEAKENED', 'BRANCH_POLICY_UNRECOGNIZED',
  'BRANCH_POLICY_ENV_BINDING_WEAKENED', 'BRANCH_POLICY_NOT_GATED',
  'UNSUPPORTED_YAML_CONSTRUCT', 'TRIGGER_UNRECOGNIZED',
  'JOB_PERMISSIONS_UNPARSEABLE', 'JOB_PERMISSIONS_VALUE_INVALID',
])
// Pre-declared #37-internal findings that are not S0/S1 interactions. They
// are reported in full and must be resolved inside #37 before promotion.
const KNOWN_RESIDUAL = new Set(['CHECK_NAME_COLLISION'])

function loadWorkflows(root) {
  const dir = path.join(root, '.github', 'workflows')
  const files = []
  for (const entry of fs.readdirSync(dir).sort()) {
    if (!/\.ya?ml$/.test(entry)) continue
    files.push({ path: `.github/workflows/${entry}`, text: fs.readFileSync(path.join(dir, entry), 'utf8') })
  }
  files.push({ path: '.github/CODEOWNERS', text: fs.readFileSync(path.join(repoRoot, '.github', 'CODEOWNERS'), 'utf8') })
  return files
}

let failures = 0

// ---- Phase A: unreconciled #37 must be caught ------------------------------
const filesA = loadWorkflows(root37)
const violationsA = auditRepository(filesA)
const codesA = new Set(violationsA.map((v) => v.code))
console.log('== Phase A: unreconciled #37 (push trigger retained) ==')
console.log(formatViolations(violationsA))
for (const code of ['DEPLOY_TRIGGER_PUSH', 'DEPLOY_TRIGGER_NOT_DISPATCH_ONLY']) {
  if (codesA.has(code)) console.log(`OK: ${code} present — Governance would block an as-is promotion`)
  else { console.log(`FAIL: expected ${code} on the unreconciled tree`); failures++ }
}

// ---- Phase B: minimal S0 delta on top of #37 -------------------------------
let deploy37 = fs.readFileSync(path.join(root37, '.github', 'workflows', 'deploy-pages.yml'), 'utf8')
const before = deploy37
deploy37 = deploy37.replace(/  push:\n    branches: \[main\]\n/, '')
deploy37 = deploy37.replace("['push', 'workflow_dispatch']", "['workflow_dispatch']")
if (deploy37 === before) {
  console.log('FAIL: S0-delta rewrite made no change to #37 deploy-pages.yml')
  process.exit(1)
}
const filesB = filesA.map((f) => (f.path === '.github/workflows/deploy-pages.yml'
  ? { path: f.path, text: deploy37 }
  : f))
const violationsB = auditRepository(filesB)
const invariantLeft = violationsB.filter((v) => S0_S1_INVARIANT_CODES.has(v.code))
const residual = violationsB.filter((v) => !S0_S1_INVARIANT_CODES.has(v.code))
console.log('\n== Phase B: S0-reconciled #37 (dispatch-only publish) ==')
if (invariantLeft.length > 0) {
  console.log(formatViolations(invariantLeft))
  console.log('FAIL: S0/S1 invariant violations remain after reconciliation')
  failures++
} else {
  console.log('OK: zero S0/S1-invariant violations — #37 CI, S1 audit and dispatch-only publishing coexist')
}
if (residual.length > 0) {
  console.log('\nResidual findings (pre-declared #37-internal, resolve inside #37):')
  console.log(formatViolations(residual))
  const undeclared = residual.filter((v) => !KNOWN_RESIDUAL.has(v.code))
  if (undeclared.length > 0) {
    console.log('FAIL: residual findings outside the pre-declared set')
    failures++
  } else {
    console.log('OK: all residual findings are pre-declared #37-internal issues (not S0/S1 interactions)')
  }
}

console.log(failures === 0 ? '\nCOMPAT RESULT: PASS' : `\nCOMPAT RESULT: FAIL (${failures} assertion(s))`)
process.exit(failures === 0 ? 0 : 1)
