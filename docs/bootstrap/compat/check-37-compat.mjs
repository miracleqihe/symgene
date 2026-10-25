// Isolated compatibility tests: PR #37 / PR #39 workflows × S1 Governance × S0 policy.
//
// For each PR checkout (their latest head), the harness runs:
//   Phase A — unreconciled: the tree keeps its push trigger, so the S1
//     Governance audit MUST flag it (DEPLOY_TRIGGER_PUSH /
//     DEPLOY_TRIGGER_NOT_DISPATCH_ONLY). An as-is promotion is caught.
//   Phase B — S0-reconciled: the minimal S0 delta (remove the push trigger;
//     narrow an event allowlist when present) must leave ZERO S0/S1-invariant
//     violations — i.e. the PR's hardening, the S1 audit suite, and the
//     dispatch-only publish policy coexist. Residual violations are printed
//     in full; codes in KNOWN_RESIDUAL are pre-declared PR-internal findings
//     (not S0/S1 interactions) and are reported, never silently suppressed.
//
// PR-specific preserved-property assertions (R2-D):
//   #37: authorization event-allowlist narrowing; artifact digest/SHA binding
//        and identity/gate jobs untouched by the delta.
//   #39: the publication-integrity rename and the (non-blocking) legacy
//        content integrity verification must survive the delta — the old
//        blocking gate is NOT resurrected.
//
// Usage: node check-37-compat.mjs <#37 checkout root> [<#39 checkout root>]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditRepository, formatViolations } from '../../../.github/tests/lib/audit-governance.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const args = process.argv.slice(2)
if (!args[0] || !fs.existsSync(path.join(args[0], '.github', 'workflows'))) {
  console.error('usage: node check-37-compat.mjs <#37 checkout root> [<#39 checkout root>]')
  process.exit(2)
}

const S0_S1_INVARIANT_CODES = new Set([
  'DEPLOY_TRIGGER_PUSH', 'DEPLOY_TRIGGER_NOT_DISPATCH_ONLY', 'DEPLOY_TRIGGER_SCHEDULE',
  'DEPLOY_ENV_NOT_PAGES', 'DEPLOY_PERMISSIONS_MISSING', 'DEPLOY_PERMISSIONS_UNEXPECTED',
  'DEPLOY_NEEDS_MISSING', 'DEPLOY_NEEDS_UNKNOWN', 'DEPLOY_FAILURE_FINALITY',
  'CROSS_RUN_ARTIFACT', 'DEPLOY_CONCURRENCY_GROUP_CHANGED', 'PAGES_ENTRY_WORKFLOW_MISSING',
  'JOB_PRIVILEGE_ESCALATION', 'TOP_PERMISSIONS_MISSING', 'TOP_PERMISSIONS_NOT_LEAST_PRIVILEGE',
  'TOP_PERMISSIONS_UNPARSEABLE', 'TOP_PERMISSIONS_VALUE_INVALID',
  'PR_TARGET_HEAD_CHECKOUT', 'PR_TARGET_HEAD_REFERENCE', 'PR_TARGET_UNTRUSTED_INPUT',
  'BRANCH_POLICY_JOB_MISSING', 'BRANCH_POLICY_WEAKENED', 'BRANCH_POLICY_UNRECOGNIZED',
  'BRANCH_POLICY_ENV_BINDING_WEAKENED', 'BRANCH_POLICY_NOT_GATED', 'BRANCH_POLICY_STEP_CONDITION',
  'FAILURE_SWALLOWED', 'JOB_NAME_DYNAMIC', 'YAML_DUPLICATE_KEY',
  'UNSUPPORTED_YAML_CONSTRUCT', 'TRIGGER_UNRECOGNIZED',
  'JOB_PERMISSIONS_UNPARSEABLE', 'JOB_PERMISSIONS_VALUE_INVALID', 'JOB_PERMISSION_UNRECOGNIZED',
  'PARSE_ERROR',
])
// GOVERNANCE_JOB_MISSING: S1's governance job is OUR bootstrap addition —
// #37/#39 do not carry it yet. Resolved at integration by merging S1's
// ci.yml governance job into their CI; reported here, never suppressed.
const KNOWN_RESIDUAL = new Set(['CHECK_NAME_COLLISION', 'GOVERNANCE_JOB_MISSING'])
const deployPath = '.github/workflows/deploy-pages.yml'

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

function s0Delta(deployText) {
  let out = deployText.replace(/  push:\n    branches: \[main\]\n/, '')
  out = out.replace("['push', 'workflow_dispatch']", "['workflow_dispatch']")
  return out
}

let failures = 0
const fail = (msg) => { console.log(`FAIL: ${msg}`); failures++ }

function runCompat(label, dir, extras = {}) {
  const files = loadWorkflows(dir)
  console.log(`\n===== ${label} =====`)

  // Phase A
  const violationsA = auditRepository(files)
  const codesA = new Set(violationsA.map((v) => v.code))
  console.log(`-- Phase A (${label}, unreconciled) --`)
  console.log(formatViolations(violationsA))
  for (const code of ['DEPLOY_TRIGGER_PUSH', 'DEPLOY_TRIGGER_NOT_DISPATCH_ONLY']) {
    if (codesA.has(code)) console.log(`OK: ${code} present — Governance would block an as-is promotion`)
    else fail(`expected ${code} on the unreconciled ${label} tree`)
  }

  // Phase B
  const before = files.find((f) => f.path === deployPath).text
  const after = s0Delta(before)
  if (after === before) { fail(`S0-delta rewrite made no change to ${label} deploy-pages.yml`); return }
  const filesB = files.map((f) => (f.path === deployPath ? { path: f.path, text: after } : f))
  const violationsB = auditRepository(filesB)
  const invariantLeft = violationsB.filter((v) => S0_S1_INVARIANT_CODES.has(v.code))
  const residual = violationsB.filter((v) => !S0_S1_INVARIANT_CODES.has(v.code))
  console.log(`-- Phase B (${label}, S0-reconciled) --`)
  if (invariantLeft.length > 0) {
    console.log(formatViolations(invariantLeft))
    fail(`S0/S1 invariant violations remain after reconciliation of ${label}`)
  } else {
    console.log(`OK: zero S0/S1-invariant violations — ${label} hardening, S1 audit and dispatch-only publishing coexist`)
  }
  if (residual.length > 0) {
    console.log(`Residual findings (${label}, pre-declared PR-internal):`)
    console.log(formatViolations(residual))
    const undeclared = residual.filter((v) => !KNOWN_RESIDUAL.has(v.code))
    if (undeclared.length > 0) fail(`residual findings outside the pre-declared set (${label})`)
    else console.log(`OK: all residual findings are pre-declared PR-internal issues (not S0/S1 interactions)`)
  }
  if (extras.after) extras.after(filesB, deployPath)
}

runCompat('PR #37 (codex/t03-website-security)', args[0], {
  after: (filesB) => {
    const deploy = filesB.find((f) => f.path === deployPath).text
    const ci = filesB.find((f) => f.path === '.github/workflows/ci.yml')?.text ?? ''
    for (const [name, marker] of [
      ['commit identity job', 'Commit identity'],
      ['engineering gate job', 'Deployment gate'],
      ['production authorization context check', 'DEPLOY_CONTEXT_REJECTED'],
      ['artifact digest binding', 'ARTIFACT_DIGEST'],
      ['run/attempt binding', 'github.run_attempt'],
    ]) {
      const haystack = marker === 'Commit identity' ? ci : deploy
      if (haystack.includes(marker)) console.log(`OK: #37 preserved — ${name}`)
      else fail(`#37 property lost after delta: ${name}`)
    }
  },
})

if (args[1]) {
  runCompat('PR #39 (codex/restore-standard-release-20261023)', args[1], {
    after: (filesB) => {
      const ci = filesB.find((f) => f.path === '.github/workflows/ci.yml')?.text ?? ''
      if (ci.includes('publication-integrity:')) console.log('OK: #39 preserved — Publication integrity job present')
      else fail('#39 rename lost: publication-integrity job missing')
      const deploy = filesB.find((f) => f.path === deployPath).text
      if (deploy.includes('Verify legacy content integrity before building')) {
        console.log('OK: #39 preserved — legacy content integrity verification retained (non-blocking per Owner decision)')
      } else fail('#39 policy lost: legacy content integrity step missing')
      if (!/Refuse unreviewed legacy pages/.test(deploy)) {
        console.log('OK: #39 preserved — the old blocking step is not resurrected by the S0 delta')
      } else fail('S0 delta resurrected the removed blocking step')
    },
  })
}

console.log(failures === 0 ? '\nCOMPAT RESULT: PASS' : `\nCOMPAT RESULT: FAIL (${failures} assertion(s))`)
process.exit(failures === 0 ? 0 : 1)
