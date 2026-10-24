// Governance audit of the actual repository state.
//
// This is the enforcement layer. It fails when the repository deviates from
// the trusted-governance invariants:
//   - the Pages deploy workflow publishes via workflow_dispatch only (S0);
//   - every workflow declares least-privilege permissions;
//   - pull_request_target never acts on the pull request head;
//   - CI keeps the same-repository dev -> main promotion policy;
//   - CODEOWNERS keeps /.github/ under explicit owner review.
//
// If DEPLOY_TRIGGER_PUSH is reported, S0-FREEZE.patch has not been applied
// (or a change re-introduced the push trigger). Restore the freeze before
// merging anything else.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { auditRepository, formatViolations } from './lib/audit-governance.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const workflowsDir = path.join(repoRoot, '.github', 'workflows')

function loadFiles() {
  const files = []
  for (const entry of fs.readdirSync(workflowsDir).sort()) {
    if (!/\.ya?ml$/.test(entry)) continue
    files.push({
      path: `.github/workflows/${entry}`,
      text: fs.readFileSync(path.join(workflowsDir, entry), 'utf8'),
    })
  }
  const codeowners = path.join(repoRoot, '.github', 'CODEOWNERS')
  if (fs.existsSync(codeowners)) {
    files.push({ path: '.github/CODEOWNERS', text: fs.readFileSync(codeowners, 'utf8') })
  }
  return files
}

test('repository satisfies the governance invariants', () => {
  const violations = auditRepository(loadFiles())
  assert.equal(
    violations.length,
    0,
    `governance violations found:\n${formatViolations(violations)}\n` +
      'Hint: [DEPLOY_TRIGGER_PUSH] means S0-FREEZE.patch is missing or has been reverted.\n',
  )
})
