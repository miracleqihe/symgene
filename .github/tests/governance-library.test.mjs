// Local negative tests for the governance audit library.
//
// These fixtures exercise the audit rules themselves: GOOD shapes must pass
// clean, BAD shapes must produce the specific violation. They run anywhere
// (no repository state needed) and guard the auditor against silent
// weakening — if someone relaxes a rule, the BAD fixture starts failing.
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  auditWorkflow,
  auditCodeowners,
  auditRepository,
  triggerKeys,
  topLevelBlocks,
} from './lib/audit-governance.mjs'

const GOOD_DEPLOY = `name: Deploy to GitHub Pages

on:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: pages-production
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - run: npm run verify

  deploy:
    needs: verify
    permissions:
      contents: read
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: https://example.invalid
    runs-on: ubuntu-latest
    steps:
      - uses: actions/deploy-pages@v4
`

const DEPLOY_WITH_PUSH = GOOD_DEPLOY.replace(
  'on:\n  workflow_dispatch:',
  'on:\n  push:\n    branches: [main]\n  workflow_dispatch:',
)
const DEPLOY_WITH_SCHEDULE = GOOD_DEPLOY.replace(
  'on:\n  workflow_dispatch:',
  'on:\n  schedule:\n    - cron: "0 3 * * *"\n  workflow_dispatch:',
)
const DEPLOY_WITHOUT_ENV = GOOD_DEPLOY.replace(
  '    environment:\n      name: github-pages\n      url: https://example.invalid\n',
  '',
)
const DEPLOY_WITHOUT_ID_TOKEN = GOOD_DEPLOY.replace('      id-token: write\n', '')
const DEPLOY_WITH_WIDENED_VERIFY = GOOD_DEPLOY.replace(
  `  verify:
    runs-on: ubuntu-latest
    permissions:
      contents: read
`,
  `  verify:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
`,
)
const DEPLOY_WITH_CHANGED_CONCURRENCY = GOOD_DEPLOY.replace(
  'group: pages-production',
  'group: pages-build',
)
const DEPLOY_WITH_WIDE_TOP = GOOD_DEPLOY.replace(
  'permissions:\n  contents: read',
  'permissions:\n  contents: write',
)
const DEPLOY_WITHOUT_TOP_PERMISSIONS = GOOD_DEPLOY.replace(
  'permissions:\n  contents: read\n\n',
  '',
)
const DEPLOY_WITH_CROSS_RUN_ARTIFACT = GOOD_DEPLOY.replace(
  '      - uses: actions/deploy-pages@v4\n',
  '      - uses: actions/download-artifact@v4\n        with:\n          name: site-dist\n          path: dist\n          run-id: ${{ github.run_id }}\n',
)

const GOOD_CI = `name: CI

on:
  pull_request:
    branches: [dev, main]

permissions:
  contents: read

jobs:
  branch-policy:
    name: Branch policy
    if: github.event_name == 'pull_request' && github.base_ref == 'main'
    runs-on: ubuntu-latest
    steps:
      - name: Require same-repository dev promotion for main
        env:
          BASE_REF: \${{ github.base_ref }}
          HEAD_REF: \${{ github.head_ref }}
          BASE_REPOSITORY: \${{ github.repository }}
          HEAD_REPOSITORY: \${{ github.event.pull_request.head.repo.full_name }}
        run: |
          if [[ "$BASE_REF" == "main" ]] && \\
             [[ "$HEAD_REF" != "dev" || "$HEAD_REPOSITORY" != "$BASE_REPOSITORY" ]]; then
            echo "Pull requests to main must promote the dev branch from this repository."
            echo "Received: $HEAD_REPOSITORY:$HEAD_REF -> $BASE_REPOSITORY:$BASE_REF"
            exit 1
          fi

  governance:
    name: Governance
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - run: node --test .github/tests/*.test.mjs
`

const WEAKENED_CI = GOOD_CI.replace(
  '[[ "$HEAD_REF" != "dev" || "$HEAD_REPOSITORY" != "$BASE_REPOSITORY" ]]',
  '[[ "$HEAD_REF" != "dev" ]]',
)
const MISSING_POLICY_CI = GOOD_CI.replace(/  branch-policy:[\s\S]*$/, '')

const PR_TARGET_SAFE = `name: PR governance

on:
  pull_request_target:
    branches: [main]

permissions:
  contents: read

jobs:
  promotion-pr-policy:
    permissions:
      contents: read
      issues: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.base.sha }}
          persist-credentials: false
`

const PR_TARGET_UNSAFE = PR_TARGET_SAFE.replace(
  'ref: \${{ github.event.pull_request.base.sha }}',
  'ref: \${{ github.event.pull_request.head.sha }}',
)

const GOOD_CODEOWNERS = `* @miracleqihe
/.github/ @miracleqihe
`
const UNOWNED_CODEOWNERS = `* @miracleqihe
`

test('good deploy workflow passes clean', () => {
  assert.deepEqual(auditWorkflow(GOOD_DEPLOY, 'deploy-pages.yml', { pagesJobs: { 'deploy-pages.yml': ['deploy'] } }), [])
})

test('push trigger on deploy workflow is rejected (S0 invariant)', () => {
  const codes = auditWorkflow(DEPLOY_WITH_PUSH, 'deploy-pages.yml', { pagesJobs: { 'deploy-pages.yml': ['deploy'] } }).map((v) => v.code)
  assert.ok(codes.includes('DEPLOY_TRIGGER_PUSH'), `expected DEPLOY_TRIGGER_PUSH, got ${codes}`)
  assert.ok(codes.includes('DEPLOY_TRIGGER_NOT_DISPATCH_ONLY'), `expected DEPLOY_TRIGGER_NOT_DISPATCH_ONLY, got ${codes}`)
})

test('schedule trigger on deploy workflow is rejected', () => {
  const codes = auditWorkflow(DEPLOY_WITH_SCHEDULE, 'deploy-pages.yml', { pagesJobs: { 'deploy-pages.yml': ['deploy'] } }).map((v) => v.code)
  assert.ok(codes.includes('DEPLOY_TRIGGER_SCHEDULE'))
})

test('deploy job publishing outside the github-pages environment is rejected', () => {
  const codes = auditWorkflow(DEPLOY_WITHOUT_ENV, 'deploy-pages.yml', { pagesJobs: { 'deploy-pages.yml': ['deploy'] } }).map((v) => v.code)
  assert.ok(codes.includes('DEPLOY_ENV_NOT_PAGES'))
})

test('deploy job without id-token: write is rejected (publish integrity)', () => {
  const codes = auditWorkflow(DEPLOY_WITHOUT_ID_TOKEN, 'deploy-pages.yml', { pagesJobs: { 'deploy-pages.yml': ['deploy'] } }).map((v) => v.code)
  assert.ok(codes.includes('DEPLOY_PERMISSIONS_MISSING'))
})

test('non-deploy job with id-token: write is rejected (privilege escalation)', () => {
  const codes = auditWorkflow(DEPLOY_WITH_WIDENED_VERIFY, 'deploy-pages.yml', { pagesJobs: { 'deploy-pages.yml': ['deploy'] } }).map((v) => v.code)
  assert.ok(codes.includes('JOB_PRIVILEGE_ESCALATION'))
})

test('changed deploy concurrency group is rejected', () => {
  const codes = auditWorkflow(DEPLOY_WITH_CHANGED_CONCURRENCY, 'deploy-pages.yml', { pagesJobs: { 'deploy-pages.yml': ['deploy'] } }).map((v) => v.code)
  assert.ok(codes.includes('DEPLOY_CONCURRENCY_GROUP_CHANGED'))
})

test('widened top-level permissions are rejected', () => {
  const codes = auditWorkflow(DEPLOY_WITH_WIDE_TOP, 'deploy-pages.yml', { pagesJobs: { 'deploy-pages.yml': ['deploy'] } }).map((v) => v.code)
  assert.ok(codes.includes('TOP_PERMISSIONS_NOT_LEAST_PRIVILEGE'))
})

test('missing top-level permissions are rejected', () => {
  const codes = auditWorkflow(DEPLOY_WITHOUT_TOP_PERMISSIONS, 'deploy-pages.yml', { pagesJobs: { 'deploy-pages.yml': ['deploy'] } }).map((v) => v.code)
  assert.ok(codes.includes('TOP_PERMISSIONS_MISSING'))
})

test('good CI branch policy passes clean', () => {
  assert.deepEqual(auditWorkflow(GOOD_CI, 'ci.yml'), [])
})

test('weakened branch policy is rejected', () => {
  const codes = auditWorkflow(WEAKENED_CI, 'ci.yml').map((v) => v.code)
  assert.ok(codes.includes('BRANCH_POLICY_WEAKENED'))
})

test('removed branch policy is rejected', () => {
  const codes = auditWorkflow(MISSING_POLICY_CI, 'ci.yml').map((v) => v.code)
  assert.ok(codes.includes('BRANCH_POLICY_JOB_MISSING'))
})

test('pull_request_target on the trusted base commit passes clean', () => {
  assert.deepEqual(auditWorkflow(PR_TARGET_SAFE, 'pr-governance.yml'), [])
})

test('pull_request_target resolving the PR head is rejected', () => {
  const codes = auditWorkflow(PR_TARGET_UNSAFE, 'pr-governance.yml').map((v) => v.code)
  assert.ok(codes.includes('PR_TARGET_HEAD_CHECKOUT'))
})

test('deploy job consuming a cross-run artifact is rejected (wrong-SHA publish input)', () => {
  const codes = auditWorkflow(DEPLOY_WITH_CROSS_RUN_ARTIFACT, 'deploy-pages.yml', { pagesJobs: { 'deploy-pages.yml': ['deploy'] } }).map((v) => v.code)
  assert.ok(codes.includes('CROSS_RUN_ARTIFACT'))
})

test('repository audit flags duplicate check-run names (impersonation surface)', () => {
  const fake = GOOD_CI.replace(
    '  branch-policy:',
    '  impostor:\n    name: Branch policy\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n\n  branch-policy:',
  )
  const violations = auditRepository([
    { path: '.github/workflows/ci.yml', text: fake },
    { path: '.github/CODEOWNERS', text: GOOD_CODEOWNERS },
  ])
  assert.ok(
    violations.some((v) => v.code === 'CHECK_NAME_COLLISION' && v.message.includes('"Branch policy"')),
    `expected CHECK_NAME_COLLISION, got ${violations.map((v) => v.code)}`,
  )
})

test('CODEOWNERS without /.github/ coverage is rejected', () => {
  const codes = auditCodeowners(UNOWNED_CODEOWNERS).map((v) => v.code)
  assert.ok(codes.includes('GOVERNANCE_PATH_UNOWNED'))
  assert.deepEqual(auditCodeowners(GOOD_CODEOWNERS), [])
})

test('repository audit rejects a checkout missing CODEOWNERS', () => {
  const violations = auditRepository([{ path: '.github/workflows/ci.yml', text: GOOD_CI }])
  assert.ok(violations.some((v) => v.code === 'GOVERNANCE_PATH_UNOWNED'))
})

test('scanner handles the YAML 1.1 on-block and inline trigger forms', () => {
  const blocks = topLevelBlocks(GOOD_DEPLOY)
  assert.deepEqual(triggerKeys(blocks.get('on')), ['workflow_dispatch'])
  assert.deepEqual(triggerKeys(topLevelBlocks('on: [push, workflow_dispatch]\n').get('on')), ['push', 'workflow_dispatch'])
  assert.deepEqual(triggerKeys(topLevelBlocks('on: push\n').get('on')), ['push'])
})

// ===========================================================================
// Remediation round 2026-10-24 (review findings 1-3).
// New fixtures for YAML expression forms, signature-based branch policy
// validation, and fail-closed parsing boundaries. Written before the fix;
// every test here must be red first, then green after the auditor update.
// ===========================================================================

const GOOD_DEPLOY_PAGESJOBS = { 'deploy-pages.yml': ['deploy'] }

// --- F1: job-level inline permissions -------------------------------------
const JOB_INLINE_WRITE_ALL = GOOD_DEPLOY.replace(
  '  verify:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n',
  '  verify:\n    runs-on: ubuntu-latest\n    permissions: write-all\n',
)
const JOB_INLINE_FLOW_PAGES = GOOD_DEPLOY.replace(
  '  verify:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n',
  '  verify:\n    runs-on: ubuntu-latest\n    permissions: { contents: read, pages: write }\n',
)
const JOB_INLINE_READ_ALL = GOOD_DEPLOY.replace(
  '  verify:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n',
  '  verify:\n    runs-on: ubuntu-latest\n    permissions: read-all\n',
)
const JOB_INLINE_UNPARSEABLE = GOOD_DEPLOY.replace(
  '  verify:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n',
  '  verify:\n    runs-on: ubuntu-latest\n    permissions: contents:read\n',
)
const JOB_INVALID_VALUE = GOOD_DEPLOY.replace('      id-token: write', '      id-token: Write')

test('F1: inline write-all job permissions are rejected (were silently ignored)', () => {
  const codes = auditWorkflow(JOB_INLINE_WRITE_ALL, 'deploy-pages.yml', { pagesJobs: GOOD_DEPLOY_PAGESJOBS }).map((v) => v.code)
  assert.ok(codes.includes('JOB_PRIVILEGE_ESCALATION'), `expected JOB_PRIVILEGE_ESCALATION, got ${codes}`)
})

test('F1: inline flow-mapping job permissions granting pages: write are rejected', () => {
  const codes = auditWorkflow(JOB_INLINE_FLOW_PAGES, 'deploy-pages.yml', { pagesJobs: GOOD_DEPLOY_PAGESJOBS }).map((v) => v.code)
  assert.ok(codes.includes('JOB_PRIVILEGE_ESCALATION'), `expected JOB_PRIVILEGE_ESCALATION, got ${codes}`)
})

test('F1: inline read-all job permissions remain acceptable', () => {
  const codes = auditWorkflow(JOB_INLINE_READ_ALL, 'deploy-pages.yml', { pagesJobs: GOOD_DEPLOY_PAGESJOBS }).map((v) => v.code)
  assert.ok(!codes.some((c) => c.includes('PERMISSION')), `unexpected ${codes}`)
})

test('F1: unparseable inline job permissions fail closed', () => {
  const codes = auditWorkflow(JOB_INLINE_UNPARSEABLE, 'deploy-pages.yml', { pagesJobs: GOOD_DEPLOY_PAGESJOBS }).map((v) => v.code)
  assert.ok(codes.includes('JOB_PERMISSIONS_UNPARSEABLE'), `expected JOB_PERMISSIONS_UNPARSEABLE, got ${codes}`)
})

test('F1: permission values outside the read/write/none enum fail closed', () => {
  const codes = auditWorkflow(JOB_INVALID_VALUE, 'deploy-pages.yml', { pagesJobs: GOOD_DEPLOY_PAGESJOBS }).map((v) => v.code)
  assert.ok(codes.includes('JOB_PERMISSIONS_VALUE_INVALID'), `expected JOB_PERMISSIONS_VALUE_INVALID, got ${codes}`)
})

// --- F2: signature-based branch policy validation --------------------------
// Verbatim shape of PR #37 (codex/t03-website-security) branch-policy job.
const GOOD_CI_V2 = `name: CI

on:
  pull_request:
    branches: [dev, main]

permissions:
  contents: read

jobs:
  branch-policy:
    name: Branch policy
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Enforce same-repository dev promotion when targeting main
        env:
          EVENT_NAME: \${{ github.event_name }}
          BASE_REF: \${{ github.base_ref }}
          HEAD_REF: \${{ github.head_ref }}
          BASE_REPOSITORY: \${{ github.repository }}
          HEAD_REPOSITORY: \${{ github.event.pull_request.head.repo.full_name }}
        run: |
          if [[ "$EVENT_NAME" == "pull_request" && "$BASE_REF" == "main" ]]; then
            [[ "$HEAD_REF" == "dev" && "$HEAD_REPOSITORY" == "$BASE_REPOSITORY" ]] || exit 1
          fi
`
const V2_CONSTRAINT_REMOVED = GOOD_CI_V2.replace(
  '            [[ "$HEAD_REF" == "dev" && "$HEAD_REPOSITORY" == "$BASE_REPOSITORY" ]] || exit 1\n', '')
const V2_REPO_CLAUSE_DROPPED = GOOD_CI_V2.replace(
  '[[ "$HEAD_REF" == "dev" && "$HEAD_REPOSITORY" == "$BASE_REPOSITORY" ]] || exit 1',
  '[[ "$HEAD_REF" == "dev" ]] || exit 1')
const V2_ENV_HARDWIRED = GOOD_CI_V2.replace(
  'HEAD_REPOSITORY: \${{ github.event.pull_request.head.repo.full_name }}',
  'HEAD_REPOSITORY: miracleqihe/symgene')
const V3_UNRECOGNIZED = GOOD_CI_V2.replace(
  /            \[\[ "\$HEAD_REF".*\n(.*\n)?/m,
  '            echo "reviewed manually, trust me"\n')

test('F2: PR #37 style branch policy (positive gate + exit 1) passes clean', () => {
  assert.deepEqual(auditWorkflow(GOOD_CI_V2, 'ci.yml'), [])
})

test('F2: removing the v2 enforcement line fails', () => {
  const codes = auditWorkflow(V2_CONSTRAINT_REMOVED, 'ci.yml').map((v) => v.code)
  assert.ok(codes.some((c) => c.startsWith('BRANCH_POLICY_')), `expected a BRANCH_POLICY_ violation, got ${codes}`)
})

test('F2: dropping the same-repository clause from v2 fails', () => {
  const codes = auditWorkflow(V2_REPO_CLAUSE_DROPPED, 'ci.yml').map((v) => v.code)
  assert.ok(codes.includes('BRANCH_POLICY_WEAKENED'), `expected BRANCH_POLICY_WEAKENED, got ${codes}`)
})

test('F2: hard-wiring the env context instead of interpolating it fails', () => {
  const codes = auditWorkflow(V2_ENV_HARDWIRED, 'ci.yml').map((v) => v.code)
  assert.ok(codes.includes('BRANCH_POLICY_ENV_BINDING_WEAKENED'), `expected BRANCH_POLICY_ENV_BINDING_WEAKENED, got ${codes}`)
})

test('F2: an unrecognized gate implementation fails closed', () => {
  const codes = auditWorkflow(V3_UNRECOGNIZED, 'ci.yml').map((v) => v.code)
  assert.ok(codes.includes('BRANCH_POLICY_UNRECOGNIZED'), `expected BRANCH_POLICY_UNRECOGNIZED, got ${codes}`)
})

// --- F3: parsing boundaries ------------------------------------------------
const FLOW_CHECKOUT_PR_TARGET = PR_TARGET_SAFE.replace(
  '      - uses: actions/checkout@v4\n        with:\n          ref: \${{ github.event.pull_request.base.sha }}\n          persist-credentials: false\n',
  '      - { uses: actions/checkout@v4, with: { ref: \${{ github.event.pull_request.head.sha }}, persist-credentials: false } }\n')
const RUN_HEAD_USE_PR_TARGET = PR_TARGET_SAFE.replace(
  '          persist-credentials: false\n',
  '          persist-credentials: false\n      - name: report\n        run: echo "\${{ github.event.pull_request.head.sha }}"\n')
const ANCHORED_WORKFLOW = `name: Anchored

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  first: &shared-job
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
  second: *shared-job
`
const MULTIDOC_WORKFLOW = '---\n' + GOOD_CI
const TABBED_WORKFLOW = GOOD_CI.replace('  branch-policy:', '\tbranch-policy:')
const WORKFLOW_RUN_TRIGGER = `name: Wrapped

on:
  workflow_run:
    workflows: [CI]
    types: [completed]

permissions:
  contents: read

jobs:
  after:
    runs-on: ubuntu-latest
    steps:
      - run: echo ok
`
const DYNAMIC_ENV_DEPLOY = GOOD_DEPLOY.replace('      name: github-pages', '      name: \${{ env.PAGES_ENV }}')
const ALT_PAGES_WORKFLOW = GOOD_DEPLOY.replace("name: Deploy to GitHub Pages", "name: Alt publisher")

test('F3: pull_request_target head checkout via flow mapping is rejected', () => {
  const codes = auditWorkflow(FLOW_CHECKOUT_PR_TARGET, 'pr-governance.yml').map((v) => v.code)
  assert.ok(codes.includes('PR_TARGET_HEAD_CHECKOUT'), `expected PR_TARGET_HEAD_CHECKOUT, got ${codes}`)
})

test('F3: pull_request_target run scripts consuming head.sha are rejected', () => {
  const codes = auditWorkflow(RUN_HEAD_USE_PR_TARGET, 'pr-governance.yml').map((v) => v.code)
  assert.ok(codes.includes('PR_TARGET_HEAD_REFERENCE'), `expected PR_TARGET_HEAD_REFERENCE, got ${codes}`)
})

test('F3: YAML anchors and aliases fail closed', () => {
  const codes = auditWorkflow(ANCHORED_WORKFLOW, 'anchored.yml').map((v) => v.code)
  assert.ok(codes.includes('UNSUPPORTED_YAML_CONSTRUCT'), `expected UNSUPPORTED_YAML_CONSTRUCT, got ${codes}`)
})

test('F3: multi-document YAML streams fail closed', () => {
  const codes = auditWorkflow(MULTIDOC_WORKFLOW, 'multi.yml').map((v) => v.code)
  assert.ok(codes.includes('UNSUPPORTED_YAML_CONSTRUCT'), `expected UNSUPPORTED_YAML_CONSTRUCT, got ${codes}`)
})

test('F3: tab indentation fails closed', () => {
  const codes = auditWorkflow(TABBED_WORKFLOW, 'tabbed.yml').map((v) => v.code)
  assert.ok(codes.includes('UNSUPPORTED_YAML_CONSTRUCT'), `expected UNSUPPORTED_YAML_CONSTRUCT, got ${codes}`)
})

test('F3: unrecognized triggers (workflow_run) fail closed', () => {
  const codes = auditWorkflow(WORKFLOW_RUN_TRIGGER, 'wrapped.yml').map((v) => v.code)
  assert.ok(codes.includes('TRIGGER_UNRECOGNIZED'), `expected TRIGGER_UNRECOGNIZED, got ${codes}`)
})

test('F3: an alternative Pages publishing workflow is rejected', () => {
  const violations = auditRepository([
    { path: '.github/workflows/deploy-pages.yml', text: GOOD_DEPLOY },
    { path: '.github/workflows/deploy-alt.yml', text: ALT_PAGES_WORKFLOW },
    { path: '.github/CODEOWNERS', text: GOOD_CODEOWNERS },
  ])
  assert.ok(violations.some((v) => v.code === 'JOB_PRIVILEGE_ESCALATION' && v.file === 'deploy-alt.yml'),
    `expected escalation on deploy-alt.yml, got ${violations.map((v) => v.code)}`)
})

test('F3: deleting deploy-pages.yml fails closed at repository level', () => {
  const violations = auditRepository([
    { path: '.github/workflows/ci.yml', text: GOOD_CI },
    { path: '.github/CODEOWNERS', text: GOOD_CODEOWNERS },
  ])
  assert.ok(violations.some((v) => v.code === 'PAGES_ENTRY_WORKFLOW_MISSING'),
    `expected PAGES_ENTRY_WORKFLOW_MISSING, got ${violations.map((v) => v.code)}`)
})

test('F3: dynamic environment name in the deploy job fails closed (regression guard)', () => {
  const codes = auditWorkflow(DYNAMIC_ENV_DEPLOY, 'deploy-pages.yml', { pagesJobs: GOOD_DEPLOY_PAGESJOBS }).map((v) => v.code)
  assert.ok(codes.includes('DEPLOY_ENV_NOT_PAGES'), `expected DEPLOY_ENV_NOT_PAGES, got ${codes}`)
})

// --- F10 follow-up: value-aware top-level permissions -----------------------
// Read-only top-level declarations (any scopes, read/none values) are
// least-privilege compliant; only write values escalate. Discovered via the
// #37 compatibility test (publication-policy.yml declares four read scopes).
const TOP_READ_SCOPES = GOOD_DEPLOY.replace(
  'permissions:\n  contents: read\n\n',
  'permissions:\n  contents: read\n  pull-requests: read\n  actions: read\n\n',
)
const TOP_READ_ALL = GOOD_DEPLOY.replace(
  'permissions:\n  contents: read\n\n',
  'permissions: read-all\n',
)
const TOP_WRITE_SCOPE = GOOD_DEPLOY.replace(
  'permissions:\n  contents: read\n\n',
  'permissions:\n  contents: read\n  deployments: write\n\n',
)

test('F1: read-only top-level scopes beyond contents are acceptable', () => {
  const codes = auditWorkflow(TOP_READ_SCOPES, 'deploy-pages.yml', { pagesJobs: { 'deploy-pages.yml': ['deploy'] } }).map((v) => v.code)
  assert.ok(!codes.some((c) => c.startsWith('TOP_PERMISSIONS')), `unexpected ${codes}`)
})

test('F1: inline read-all top-level permissions are acceptable', () => {
  const codes = auditWorkflow(TOP_READ_ALL, 'deploy-pages.yml', { pagesJobs: { 'deploy-pages.yml': ['deploy'] } }).map((v) => v.code)
  assert.ok(!codes.some((c) => c.startsWith('TOP_PERMISSIONS')), `unexpected ${codes}`)
})

test('F1: any write value at top level is rejected', () => {
  const codes = auditWorkflow(TOP_WRITE_SCOPE, 'deploy-pages.yml', { pagesJobs: { 'deploy-pages.yml': ['deploy'] } }).map((v) => v.code)
  assert.ok(codes.includes('TOP_PERMISSIONS_NOT_LEAST_PRIVILEGE'), `expected TOP_PERMISSIONS_NOT_LEAST_PRIVILEGE, got ${codes}`)
})

// ===========================================================================
// R2 adversarial round (2026-10-24). Each test targets one independently
// reproduced finding from the second review. Written before the fix.
// ===========================================================================

const PJ = { 'deploy-pages.yml': ['deploy'] }

// --- R2-A1: branch-policy template containment bypass -----------------------
// The signature used to be matched by CONTAINMENT, so a dead string (echo)
// or extra statements satisfied the gate without executing it.
const V2_SIGNATURE_AS_STRING = GOOD_CI_V2.replace(
  /        run: \|\n[\s\S]*?          fi\n/,
  `        run: echo 'if [[ "$EVENT_NAME" == "pull_request" && "$BASE_REF" == "main" ]]; then [[ "$HEAD_REF" == "dev" && "$HEAD_REPOSITORY" == "$BASE_REPOSITORY" ]] || exit 1; fi'\n`)
const V2_WITH_EXTRA_STATEMENT = GOOD_CI_V2.replace(
  '          if [[ "$EVENT_NAME"',
  '          echo "starting gate"\n          if [[ "$EVENT_NAME"')

test('R2-A1: signature inside a dead string does not satisfy the gate', () => {
  const codes = auditWorkflow(V2_SIGNATURE_AS_STRING, 'ci.yml').map((v) => v.code)
  // The template-equality rule must reject the dead-string form; the exact
  // diagnostic code (WEAKENED when gate fragments are recognizable,
  // UNRECOGNIZED otherwise) is secondary — both are fail-closed violations.
  assert.ok(
    codes.includes('BRANCH_POLICY_WEAKENED') || codes.includes('BRANCH_POLICY_UNRECOGNIZED'),
    `expected a BRANCH_POLICY_ violation, got ${codes}`)
})

test('R2-A1: extra statements around the v2 script fail closed', () => {
  const codes = auditWorkflow(V2_WITH_EXTRA_STATEMENT, 'ci.yml').map((v) => v.code)
  assert.ok(codes.some((c) => c.startsWith('BRANCH_POLICY_')), `got ${codes}`)
})

test('R2-A1: a job-level if that can skip the gate on PRs to main is rejected', () => {
  const codes = auditWorkflow(GOOD_CI_V2.replace(
    '  branch-policy:\n    name: Branch policy\n    runs-on: ubuntu-latest',
    "  branch-policy:\n    name: Branch policy\n    if: github.event_name == 'push'\n    runs-on: ubuntu-latest"), 'ci.yml').map((v) => v.code)
  assert.ok(codes.includes('BRANCH_POLICY_NOT_GATED'), `expected BRANCH_POLICY_NOT_GATED, got ${codes}`)
})

// --- R2-A2: swallowed failures ----------------------------------------------
const STEP_COE = GOOD_CI_V2.replace(
  '      - name: Enforce same-repository dev promotion when targeting main',
  '      - name: Enforce same-repository dev promotion when targeting main\n        continue-on-error: true')
const GOV_COE = GOOD_CI.replace(
  '  governance:\n    name: Governance\n    runs-on: ubuntu-latest',
  '  governance:\n    name: Governance\n    continue-on-error: true\n    runs-on: ubuntu-latest')
const VERIFY_OR_TRUE = GOOD_DEPLOY.replace('      - run: npm run verify', '      - run: npm run verify || true')
const VERIFY_COE = GOOD_DEPLOY.replace(
  '  verify:\n    runs-on: ubuntu-latest',
  '  verify:\n    continue-on-error: true\n    runs-on: ubuntu-latest')

test('R2-A2: continue-on-error on the branch-policy step is rejected', () => {
  const codes = auditWorkflow(STEP_COE, 'ci.yml').map((v) => v.code)
  assert.ok(codes.includes('FAILURE_SWALLOWED'), `expected FAILURE_SWALLOWED, got ${codes}`)
})

test('R2-A2: continue-on-error on the Governance job is rejected', () => {
  const codes = auditWorkflow(GOV_COE, 'ci.yml').map((v) => v.code)
  assert.ok(codes.includes('FAILURE_SWALLOWED'), `expected FAILURE_SWALLOWED, got ${codes}`)
})

test('R2-A2: "|| true" on the publish-chain verify step is rejected', () => {
  const codes = auditWorkflow(VERIFY_OR_TRUE, 'deploy-pages.yml', { pagesJobs: PJ }).map((v) => v.code)
  assert.ok(codes.includes('FAILURE_SWALLOWED'), `expected FAILURE_SWALLOWED, got ${codes}`)
})

test('R2-A2: continue-on-error on the deploy verify job is rejected', () => {
  const codes = auditWorkflow(VERIFY_COE, 'deploy-pages.yml', { pagesJobs: PJ }).map((v) => v.code)
  assert.ok(codes.includes('FAILURE_SWALLOWED'), `expected FAILURE_SWALLOWED, got ${codes}`)
})

test('R2-A2: benign continue-on-error outside gate/publish files stays accepted', () => {
  const codes = auditWorkflow(PR_TARGET_SAFE, 'pr-governance.yml').map((v) => v.code)
  assert.ok(!codes.includes('FAILURE_SWALLOWED'), `unexpected ${codes}`)
})

// --- R2-A3: duplicate keys, dynamic names, flow mappings --------------------
const DUP_TOP = GOOD_CI.replace('permissions:\n  contents: read', 'permissions:\n  contents: write\npermissions:\n  contents: read')
const DUP_JOB = GOOD_DEPLOY.replace('  deploy:\n    needs: verify', '  deploy:\n    needs: verify\n  deploy:\n    needs: verify')
const FLOW_JOBS = `name: Flow\n\non:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n\njobs: {verify: {runs-on: ubuntu-latest, steps: [{run: echo hi}]}}\n`
const FLOW_JOB_ENTRY = GOOD_DEPLOY.replace('  verify:\n    runs-on: ubuntu-latest', '  verify: {runs-on: ubuntu-latest}\n    runs-on: ubuntu-latest')
const DYNAMIC_NAME = GOOD_CI.replace('    name: Branch policy', '    name: ${{ matrix.policy-name }}')

test('R2-A3: duplicate top-level keys are flagged', () => {
  const codes = auditWorkflow(DUP_TOP, 'ci.yml').map((v) => v.code)
  assert.ok(codes.includes('YAML_DUPLICATE_KEY'), `expected YAML_DUPLICATE_KEY, got ${codes}`)
})

test('R2-A3: duplicate job ids are flagged', () => {
  const codes = auditWorkflow(DUP_JOB, 'deploy-pages.yml', { pagesJobs: PJ }).map((v) => v.code)
  assert.ok(codes.includes('YAML_DUPLICATE_KEY'), `expected YAML_DUPLICATE_KEY, got ${codes}`)
})

test('R2-A3: flow-mapping jobs blocks fail closed', () => {
  const codes = auditWorkflow(FLOW_JOBS, 'flow.yml').map((v) => v.code)
  assert.ok(codes.includes('UNSUPPORTED_YAML_CONSTRUCT'), `expected UNSUPPORTED_YAML_CONSTRUCT, got ${codes}`)
})

test('R2-A3: flow-mapping job entries fail closed', () => {
  const codes = auditWorkflow(FLOW_JOB_ENTRY, 'deploy-pages.yml', { pagesJobs: PJ }).map((v) => v.code)
  assert.ok(codes.includes('UNSUPPORTED_YAML_CONSTRUCT'), `expected UNSUPPORTED_YAML_CONSTRUCT, got ${codes}`)
})

test('R2-A3: dynamic job display names are flagged (check-name integrity)', () => {
  const codes = auditWorkflow(DYNAMIC_NAME, 'ci.yml').map((v) => v.code)
  assert.ok(codes.includes('JOB_NAME_DYNAMIC'), `expected JOB_NAME_DYNAMIC, got ${codes}`)
})

// --- R2-A4: untrusted pull_request_target inputs ----------------------------
const RUN_TITLE = PR_TARGET_SAFE.replace(
  '          persist-credentials: false\n',
  '          persist-credentials: false\n      - name: announce\n        run: echo "\${{ github.event.pull_request.title }}"\n')
const SCRIPT_BODY = PR_TARGET_SAFE.replace(
  '          persist-credentials: false\n',
  '          persist-credentials: false\n      - uses: actions/github-script@v7\n        with:\n          script: console.log("\${{ github.event.pull_request.body }}")\n')
const WITH_TITLE = PR_TARGET_SAFE.replace(
  '          persist-credentials: false\n',
  '          persist-credentials: false\n      - uses: actions/upload-artifact@v4\n        with:\n          name: report-\${{ github.event.pull_request.title }}\n')

test('R2-A4: run scripts interpolating pull_request.title are rejected', () => {
  const codes = auditWorkflow(RUN_TITLE, 'pr-governance.yml').map((v) => v.code)
  assert.ok(codes.includes('PR_TARGET_UNTRUSTED_INPUT'), `expected PR_TARGET_UNTRUSTED_INPUT, got ${codes}`)
})

test('R2-A4: github-script interpolating pull_request.body is rejected', () => {
  const codes = auditWorkflow(SCRIPT_BODY, 'pr-governance.yml').map((v) => v.code)
  assert.ok(codes.includes('PR_TARGET_UNTRUSTED_INPUT'), `expected PR_TARGET_UNTRUSTED_INPUT, got ${codes}`)
})

test('R2-A4: with: inputs carrying pull_request.title are rejected', () => {
  const codes = auditWorkflow(WITH_TITLE, 'pr-governance.yml').map((v) => v.code)
  assert.ok(codes.includes('PR_TARGET_UNTRUSTED_INPUT'), `expected PR_TARGET_UNTRUSTED_INPUT, got ${codes}`)
})

test('R2-A4: pull_request.number and base.* stay allowed (trusted inputs)', () => {
  const okText = PR_TARGET_SAFE.replace(
    '          persist-credentials: false\n',
    '          persist-credentials: false\n      - name: label\n        run: echo "PR \${{ github.event.pull_request.number }} base \${{ github.event.pull_request.base.sha }}"\n')
  const codes = auditWorkflow(okText, 'pr-governance.yml').map((v) => v.code)
  assert.ok(!codes.includes('PR_TARGET_UNTRUSTED_INPUT'), `unexpected ${codes}`)
})

// --- R2-A5: deploy permissions allowlist, needs, failure finality -----------
const DEPLOY_CONTENTS_WRITE = GOOD_DEPLOY.replace(
  '    permissions:\n      contents: read\n      pages: write',
  '    permissions:\n      contents: write\n      pages: write')
const DEPLOY_NO_NEEDS = GOOD_DEPLOY.replace('    needs: verify\n', '')
const DEPLOY_NEEDS_PHANTOM = GOOD_DEPLOY.replace('    needs: verify', '    needs: [verify, phantom]')
const DEPLOY_IF_ALWAYS = GOOD_DEPLOY.replace(
  '  deploy:\n    needs: verify',
  '  deploy:\n    if: always()\n    needs: verify')

test('R2-A5: deploy job with contents: write is rejected (permission allowlist)', () => {
  const codes = auditWorkflow(DEPLOY_CONTENTS_WRITE, 'deploy-pages.yml', { pagesJobs: PJ }).map((v) => v.code)
  assert.ok(codes.includes('DEPLOY_PERMISSIONS_UNEXPECTED'), `expected DEPLOY_PERMISSIONS_UNEXPECTED, got ${codes}`)
})

test('R2-A5: deploy job without needs is rejected', () => {
  const codes = auditWorkflow(DEPLOY_NO_NEEDS, 'deploy-pages.yml', { pagesJobs: PJ }).map((v) => v.code)
  assert.ok(codes.includes('DEPLOY_NEEDS_MISSING'), `expected DEPLOY_NEEDS_MISSING, got ${codes}`)
})

test('R2-A5: deploy needs referencing an unknown job is rejected', () => {
  const codes = auditWorkflow(DEPLOY_NEEDS_PHANTOM, 'deploy-pages.yml', { pagesJobs: PJ }).map((v) => v.code)
  assert.ok(codes.includes('DEPLOY_NEEDS_UNKNOWN'), `expected DEPLOY_NEEDS_UNKNOWN, got ${codes}`)
})

test('R2-A5: deploy job running on failure (if: always()) is rejected', () => {
  const codes = auditWorkflow(DEPLOY_IF_ALWAYS, 'deploy-pages.yml', { pagesJobs: PJ }).map((v) => v.code)
  assert.ok(codes.includes('DEPLOY_FAILURE_FINALITY'), `expected DEPLOY_FAILURE_FINALITY, got ${codes}`)
})

// ===========================================================================
// R3 adversarial round (2026-10-24, findings P1-10..P1-17, P2-06).
// Written before the fix: P1-10/11/12/13 must be red on the R2 auditor.
// ===========================================================================

// --- P1-10: job-condition bypass (substring rule accepted always-false ifs) --
const V2_IF_AND_FALSE = GOOD_CI_V2.replace(
  '  branch-policy:\n    name: Branch policy\n    runs-on: ubuntu-latest',
  "  branch-policy:\n    name: Branch policy\n    if: github.base_ref == 'main' && false\n    runs-on: ubuntu-latest")
const V2_IF_FALSE_LITERAL = GOOD_CI_V2.replace(
  '  branch-policy:\n    name: Branch policy\n    runs-on: ubuntu-latest',
  '  branch-policy:\n    name: Branch policy\n    if: false\n    runs-on: ubuntu-latest')

test('P1-10: job if "github.base_ref == main && false" (always-false) is rejected', () => {
  const codes = auditWorkflow(V2_IF_AND_FALSE, 'ci.yml').map((v) => v.code)
  assert.ok(codes.includes('BRANCH_POLICY_NOT_GATED'), `expected BRANCH_POLICY_NOT_GATED, got ${codes}`)
})

test('P1-10 control: literal if:false stays rejected', () => {
  const codes = auditWorkflow(V2_IF_FALSE_LITERAL, 'ci.yml').map((v) => v.code)
  assert.ok(codes.includes('BRANCH_POLICY_NOT_GATED'), `expected BRANCH_POLICY_NOT_GATED, got ${codes}`)
})

// --- P1-11: Governance job must not be conditionally skippable --------------
const GOV_IF_FALSE = GOOD_CI.replace(
  '  governance:\n    name: Governance\n    runs-on: ubuntu-latest',
  '  governance:\n    name: Governance\n    if: false\n    runs-on: ubuntu-latest')
const GOV_IF_EXPR = GOOD_CI.replace(
  '  governance:\n    name: Governance\n    runs-on: ubuntu-latest',
  "  governance:\n    name: Governance\n    if: \${{ github.event_name == 'push' }}\n    runs-on: ubuntu-latest")

test('P1-11: governance job with if:false is rejected (skipped satisfies required checks)', () => {
  const codes = auditWorkflow(GOV_IF_FALSE, 'ci.yml').map((v) => v.code)
  assert.ok(codes.includes('GOVERNANCE_JOB_CONDITIONAL'), `expected GOVERNANCE_JOB_CONDITIONAL, got ${codes}`)
})

test('P1-11: governance job with an expression if is rejected', () => {
  const codes = auditWorkflow(GOV_IF_EXPR, 'ci.yml').map((v) => v.code)
  assert.ok(codes.includes('GOVERNANCE_JOB_CONDITIONAL'), `expected GOVERNANCE_JOB_CONDITIONAL, got ${codes}`)
})

// --- P1-12: expression-form continue-on-error -------------------------------
const COE_EXPRESSION = GOOD_DEPLOY.replace(
  '  verify:\n    runs-on: ubuntu-latest',
  '  verify:\n    continue-on-error: \${{ steps.gate.outputs.swallow }}\n    runs-on: ubuntu-latest')
const COE_NUMERIC = GOOD_DEPLOY.replace(
  '  verify:\n    runs-on: ubuntu-latest',
  '  verify:\n    continue-on-error: 1\n    runs-on: ubuntu-latest')

test('P1-12: expression-valued continue-on-error is rejected', () => {
  const codes = auditWorkflow(COE_EXPRESSION, 'deploy-pages.yml', { pagesJobs: { 'deploy-pages.yml': ['deploy'] } }).map((v) => v.code)
  assert.ok(codes.includes('FAILURE_SWALLOWED'), `expected FAILURE_SWALLOWED, got ${codes}`)
})

test('P1-12: truthy non-boolean continue-on-error is rejected', () => {
  const codes = auditWorkflow(COE_NUMERIC, 'deploy-pages.yml', { pagesJobs: { 'deploy-pages.yml': ['deploy'] } }).map((v) => v.code)
  assert.ok(codes.includes('FAILURE_SWALLOWED'), `expected FAILURE_SWALLOWED, got ${codes}`)
})

// --- P1-13: github.head_ref and bracket-index untrusted inputs --------------
const HEAD_REF_RUN = PR_TARGET_SAFE.replace(
  '          persist-credentials: false\n',
  '          persist-credentials: false\n      - name: r\n        run: echo "\${{ github.head_ref }}"\n')
const BRACKET_TITLE_RUN = PR_TARGET_SAFE.replace(
  '          persist-credentials: false\n',
  '          persist-credentials: false\n      - name: r\n        run: echo "\${{ github[\'event\'][\'pull_request\'][\'title\'] }}"\n')
const BRACKET_NUMBER_RUN = PR_TARGET_SAFE.replace(
  '          persist-credentials: false\n',
  '          persist-credentials: false\n      - name: r\n        run: echo "\${{ github[\'event\'][\'pull_request\'][\'number\'] }}"\n')

test('P1-13: github.head_ref interpolation in pull_request_target scripts is rejected', () => {
  const codes = auditWorkflow(HEAD_REF_RUN, 'pr-governance.yml').map((v) => v.code)
  assert.ok(codes.includes('PR_TARGET_UNTRUSTED_INPUT'), `expected PR_TARGET_UNTRUSTED_INPUT, got ${codes}`)
})

test('P1-13: bracket-indexed pull_request.title interpolation is rejected', () => {
  const codes = auditWorkflow(BRACKET_TITLE_RUN, 'pr-governance.yml').map((v) => v.code)
  assert.ok(codes.includes('PR_TARGET_UNTRUSTED_INPUT'), `expected PR_TARGET_UNTRUSTED_INPUT, got ${codes}`)
})

test('P1-13 control: bracket-indexed pull_request.number stays allowed', () => {
  const codes = auditWorkflow(BRACKET_NUMBER_RUN, 'pr-governance.yml').map((v) => v.code)
  assert.ok(!codes.includes('PR_TARGET_UNTRUSTED_INPUT'), `unexpected ${codes}`)
})

// ===========================================================================
// R4 adversarial round (2026-10-24, findings P1-18..P1-21).
// Written before the fix; each must be red on the R3 auditor.
// ===========================================================================

// --- P1-18: whitespace-stripping normalization destroys quoted semantics ----
// Git refs may contain spaces ("de v" is a valid branch name). The R3
// normalizer stripped ALL whitespace, so a gate comparing against "de v"
// normalized identically to the "dev" template — an attacker simply opens
// the PR from a branch named "de v" and the gate passes.
const V2_QUOTED_DE_V = GOOD_CI_V2.replace('[[ "$HEAD_REF" == "dev" &&', '[[ "$HEAD_REF" == "de v" &&')

test('P1-18: quoted "de v" comparison must not normalize to "dev" (template mismatch)', () => {
  const codes = auditWorkflow(V2_QUOTED_DE_V, 'ci.yml').map((v) => v.code)
  assert.ok(codes.includes('BRANCH_POLICY_UNRECOGNIZED') || codes.includes('BRANCH_POLICY_WEAKENED'),
    `expected a BRANCH_POLICY_ violation, got ${codes}`)
})

test('P1-18 control: folded block scalar (run: >-) still matches the v2 template', () => {
  const folded = GOOD_CI_V2.replace('        run: |\n', '        run: >-\n')
  const codes = auditWorkflow(folded, 'ci.yml').map((v) => v.code)
  assert.ok(!codes.some((c) => c.startsWith('BRANCH_POLICY_')), `unexpected ${codes}`)
})

// --- P1-19: gate env cross-step pollution -----------------------------------
// Step 1 carries the gate script with a hard-wired env; step 2 carries the
// correct env with a decoy script. R3 merged all env blocks (last wins =
// step 2's correct values) and took the FIRST run block as the script, so
// the vacuous gate in step 1 was accepted.
const GATE_STEP_HARDWIRED = GOOD_CI_V2.replace(
  `        env:
          EVENT_NAME: \${{ github.event_name }}
          BASE_REF: \${{ github.base_ref }}
          HEAD_REF: \${{ github.head_ref }}
          BASE_REPOSITORY: \${{ github.repository }}
          HEAD_REPOSITORY: \${{ github.event.pull_request.head.repo.full_name }}
        run: |
          if [[ "$EVENT_NAME" == "pull_request" && "$BASE_REF" == "main" ]]; then
            [[ "$HEAD_REF" == "dev" && "$HEAD_REPOSITORY" == "$BASE_REPOSITORY" ]] || exit 1
          fi
`,
  `        env:
          EVENT_NAME: \${{ github.event_name }}
          BASE_REF: \${{ github.base_ref }}
          HEAD_REF: dev
          BASE_REPOSITORY: \${{ github.repository }}
          HEAD_REPOSITORY: \${{ github.event.pull_request.head.repo.full_name }}
        run: |
          if [[ "$EVENT_NAME" == "pull_request" && "$BASE_REF" == "main" ]]; then
            [[ "$HEAD_REF" == "dev" && "$HEAD_REPOSITORY" == "$BASE_REPOSITORY" ]] || exit 1
          fi

      - name: Decoy step carrying the correct env (masks step 1 via merge)
        env:
          EVENT_NAME: \${{ github.event_name }}
          BASE_REF: \${{ github.base_ref }}
          HEAD_REF: \${{ github.head_ref }}
          BASE_REPOSITORY: \${{ github.repository }}
          HEAD_REPOSITORY: \${{ github.event.pull_request.head.repo.full_name }}
        run: echo "decoy"
`)

test('P1-19: hard-wired gate env is not masked by a later step with correct env', () => {
  const codes = auditWorkflow(GATE_STEP_HARDWIRED, 'ci.yml').map((v) => v.code)
  assert.ok(codes.includes('BRANCH_POLICY_ENV_BINDING_WEAKENED'),
    `expected BRANCH_POLICY_ENV_BINDING_WEAKENED, got ${codes}`)
})

// --- P1-20: chomping/indent block scalar headers -----------------------------
const RUN_CHOMP_INLINE = PR_TARGET_SAFE.replace(
  '          persist-credentials: false\n',
  '          persist-credentials: false\n      - name: r\n        run: |-\n          echo "\${{ github.event.pull_request.title }}"\n')
const FOLDED_GATE = GOOD_CI_V2.replace('        run: |\n', '        run: >-\n')

test('P1-20: untrusted input inside a run:|- block is scanned (was evasive)', () => {
  const codes = auditWorkflow(RUN_CHOMP_INLINE, 'pr-governance.yml').map((v) => v.code)
  assert.ok(codes.includes('PR_TARGET_UNTRUSTED_INPUT'), `expected PR_TARGET_UNTRUSTED_INPUT, got ${codes}`)
})

test('P1-20 control: run:|- gate form in ci.yml parses for template equality', () => {
  const chompedGate = GOOD_CI_V2.replace('        run: |\n', '        run: |-\n')
  const codes = auditWorkflow(chompedGate, 'ci.yml').map((v) => v.code)
  assert.ok(!codes.some((c) => c.startsWith('BRANCH_POLICY_')), `unexpected ${codes}`)
})

// --- P1-21: "|| :" and other swallow forms ----------------------------------
const OR_COLON = GOOD_DEPLOY.replace('      - run: npm run verify', '      - run: npm run verify || :')
const OR_EXIT0 = GOOD_DEPLOY.replace('      - run: npm run verify', '      - run: npm run verify || exit 0')

test('P1-21: "|| :" swallow is rejected (R3 regex missed the colon form)', () => {
  const codes = auditWorkflow(OR_COLON, 'deploy-pages.yml', { pagesJobs: { 'deploy-pages.yml': ['deploy'] } }).map((v) => v.code)
  assert.ok(codes.includes('FAILURE_SWALLOWED'), `expected FAILURE_SWALLOWED, got ${codes}`)
})

test('P1-21: "|| exit 0" swallow is rejected', () => {
  const codes = auditWorkflow(OR_EXIT0, 'deploy-pages.yml', { pagesJobs: { 'deploy-pages.yml': ['deploy'] } }).map((v) => v.code)
  assert.ok(codes.includes('FAILURE_SWALLOWED'), `expected FAILURE_SWALLOWED, got ${codes}`)
})

test('P1-21 control: "|| exit 1" fail-loud form stays accepted in the v2 gate', () => {
  const codes = auditWorkflow(GOOD_CI_V2, 'ci.yml').map((v) => v.code)
  assert.ok(!codes.includes('FAILURE_SWALLOWED'), `unexpected ${codes}`)
})
