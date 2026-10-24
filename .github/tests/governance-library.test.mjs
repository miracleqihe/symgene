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
          BASE_REF: main
          HEAD_REF: dev
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
