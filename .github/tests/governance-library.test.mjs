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
            exit 1
          fi
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
