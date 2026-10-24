// Governance audit library for the symgene website repository.
//
// Structural audits over the workflow YAML files. Deliberately dependency
// free (node stdlib only) so CI can run it before `npm ci` and nobody can
// tamper with it through package installs. It scans a deliberately small
// YAML subset (2-space indentation, block maps, plain scalars, flow
// mappings in permission values). Anything outside that subset that matters
// is a violation by construction (fail closed): UNSUPPORTED_YAML_CONSTRUCT
// and the *_UNPARSEABLE / *_UNRECOGNIZED codes below exist so that syntax
// this auditor cannot reliably understand is reported, never ignored.

const WRITABLE_SCOPES = new Set([
  'contents', 'pages', 'id-token', 'deployments', 'actions', 'checks',
  'packages', 'administration', 'environments', 'statuses',
  'security-events', 'attestations', 'models', 'members', 'organization-projects',
])

// Job-level write widenings considered acceptable for commenting/reporting
// bots. Anything else with a write value must be added deliberately.
const KNOWN_WRITE_SCOPES = new Set(['issues', 'pull-requests'])

const PERM_VALUES = new Set(['read', 'write', 'none'])

const KNOWN_TRIGGERS = new Set([
  'push', 'pull_request', 'pull_request_target', 'workflow_dispatch',
  'schedule', 'workflow_call',
])

export function stripComments(line) {
  if (line.trimStart().startsWith('#')) return ''
  const hash = line.indexOf(' #')
  return hash === -1 ? line : line.slice(0, hash)
}

// Split a document into top-level `key:` blocks (column 0).
export function topLevelBlocks(text) {
  const lines = text.split('\n')
  const blocks = new Map()
  let current = null
  for (const raw of lines) {
    const line = stripComments(raw)
    if (!line.trim()) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*|"[^"]+"):\s*(.*)$/)
    if (match) {
      const key = match[1].replace(/"/g, '')
      current = { inline: match[2].trim(), lines: [] }
      blocks.set(key, current)
    } else if (current) {
      current.lines.push(raw)
    }
  }
  return blocks
}

// Keys at exactly `indent` spaces inside a block, with their body lines.
export function subBlocks(blockLines, indent) {
  const result = new Map()
  const prefix = ' '.repeat(indent)
  let current = null
  for (const raw of blockLines) {
    const line = stripComments(raw)
    if (!line.trim()) continue
    if (line.startsWith(prefix) && !line.startsWith(prefix + ' ')) {
      const rest = line.slice(prefix.length).replace(/^ +/, '')
      const match = rest.match(/^([A-Za-z_][A-Za-z0-9_-]*|"[^"]+"):\s*(.*)$/)
      if (match) {
        const key = match[1].replace(/"/g, '')
        current = { inline: match[2].trim(), lines: [] }
        result.set(key, current)
        continue
      }
    }
    if (current) current.lines.push(raw)
  }
  return result
}

// `key: value` entries at any indentation within a small block. Only safe on
// dedicated scalar blocks (permissions, environment, concurrency, env).
export function parseScalarEntries(blockLines) {
  const entries = new Map()
  for (const raw of blockLines) {
    const line = stripComments(raw)
    if (!line.trim()) continue
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_.-]+):\s*(.*)$/)
    if (match) entries.set(match[1], match[2].trim())
  }
  return entries
}

// Split a flow-collection body on `sep`, respecting quotes and nesting.
function splitFlow(input, sep) {
  const parts = []
  let depth = 0
  let quote = null
  let current = ''
  for (const ch of input) {
    if (quote) {
      current += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue }
    if (ch === '{' || ch === '[') { depth++; current += ch; continue }
    if (ch === '}' || ch === ']') { depth--; current += ch; continue }
    if (ch === sep && depth === 0) { parts.push(current); current = ''; continue }
    current += ch
  }
  if (current.trim()) parts.push(current)
  return parts.map((p) => p.trim()).filter(Boolean)
}

// Parse a permissions value in any valid YAML expression form:
//   read-all | write-all | { scope: value, ... } | block map (already parsed)
// Anything the auditor cannot reliably interpret is returned as __unparsed
// so the caller can fail closed.
export function parseInlinePermissions(inline) {
  const t = inline.trim()
  if (t === 'read-all' || t === 'write-all') return new Map([['__mode', t]])
  const flow = t.match(/^\{(.*)\}$/s)
  if (flow) {
    const entries = new Map()
    for (const part of splitFlow(flow[1], ',')) {
      const m = part.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/)
      if (!m) return new Map([['__unparsed', t]])
      entries.set(m[1], m[2])
    }
    return entries
  }
  return new Map([['__unparsed', t]])
}

export function triggerKeys(onBlock) {
  if (!onBlock) return []
  if (onBlock.inline) {
    if (onBlock.inline.startsWith('[')) {
      return [...onBlock.inline.matchAll(/([A-Za-z_][A-Za-z0-9_-]*)/g)].map((m) => m[1])
    }
    return [onBlock.inline]
  }
  return [...subBlocks(onBlock.lines, 2).keys()]
}

function parsePermissionsBlock(block) {
  if (!block) return null
  if (block.inline) return parseInlinePermissions(block.inline)
  return parseScalarEntries(block.lines)
}

export function jobPermissions(jobBlockLines) {
  // job bodies are declared at 4-space absolute indent (jobs at 2-space)
  return parsePermissionsBlock(subBlocks(jobBlockLines, 4).get('permissions'))
}

function formatPermissions(map) {
  return [...map.entries()].filter(([k]) => !k.startsWith('__')).map(([k, v]) => `${k}: ${v}`)
}

// Shared permission-map audit. Read/none values are benign at any scope;
// write values are escalated only on the sanctioned scopes.
function auditPermissionMap(perm, { isPagesJob, jobId, add }) {
  if (!perm) return
  if (perm.get('__mode') === 'write-all') {
    add('JOB_PRIVILEGE_ESCALATION', `job "${jobId}" grants permissions: write-all (inline form); every scope is writable`)
    return
  }
  if (perm.get('__unparsed')) {
    add('JOB_PERMISSIONS_UNPARSEABLE', `job "${jobId}" has a permissions value the auditor cannot reliably interpret: "${perm.get('__unparsed')}"`)
    return
  }
  for (const [scope, value] of perm) {
    if (scope.startsWith('__')) continue
    if (!PERM_VALUES.has(value)) {
      add('JOB_PERMISSIONS_VALUE_INVALID', `job "${jobId}" grants ${scope}: ${value}; allowed values are read/write/none`)
      continue
    }
    if (value !== 'write') continue
    if (isPagesJob) continue
    if (WRITABLE_SCOPES.has(scope)) {
      add('JOB_PRIVILEGE_ESCALATION', `job "${jobId}" grants "${scope}: write"; only the sanctioned publishing job may hold production permissions`)
    } else if (!KNOWN_WRITE_SCOPES.has(scope)) {
      add('JOB_PERMISSION_UNRECOGNIZED', `job "${jobId}" grants unrecognized write scope "${scope}: write"; extend the audit allowlist deliberately if this is intended`)
    }
  }
}

// Fail-closed scan for YAML constructs outside the auditor's supported
// subset: multi-document streams, tab indentation, anchors/aliases, and
// unrecognized event triggers (workflow_run etc. need deliberate sanction).
function auditSyntaxSubset(text, triggers, add) {
  if (/^---\s*$/m.test(text) || /^\.\.\.\s*$/m.test(text)) {
    add('UNSUPPORTED_YAML_CONSTRUCT', 'multi-document YAML stream; the auditor parses exactly one document')
  }
  if (/^\t+/m.test(text)) {
    add('UNSUPPORTED_YAML_CONSTRUCT', 'tab indentation; the supported subset is space-indented YAML')
  }
  if (/(?:^|[\s:[{,])&[A-Za-z0-9_-]/.test(text)) {
    add('UNSUPPORTED_YAML_CONSTRUCT', 'YAML anchor (&name); anchors can restructure the document outside the parsed subset')
  }
  if (/(?:^|[\s:[{,])\*[A-Za-z0-9_-]/.test(text)) {
    add('UNSUPPORTED_YAML_CONSTRUCT', 'YAML alias (*name); aliases can duplicate structure outside the parsed subset')
  }
  for (const t of triggers) {
    if (!KNOWN_TRIGGERS.has(t)) {
      add('TRIGGER_UNRECOGNIZED', `trigger "${t}" is outside the sanctioned set (push, pull_request, pull_request_target, workflow_dispatch, schedule, workflow_call); workflow_run and similar need deliberate allowlisting`)
    }
  }
}

// Audit one workflow file. `pagesJobs` maps file name -> job ids allowed to
// carry the production publishing permissions (pages: write / id-token: write).
export function auditWorkflow(text, fileName, { pagesJobs = {} } = {}) {
  const violations = []
  const add = (code, message) => violations.push({ file: fileName, code, message })
  const blocks = topLevelBlocks(text)
  const allowedPagesJobs = pagesJobs[fileName] ?? []

  const onBlock = blocks.get('on')
  const triggers = triggerKeys(onBlock)
  auditSyntaxSubset(text, triggers, add)

  // Top level must be read-only (any read/none scopes, declared explicitly):
  // write values belong in job-level blocks where they can be sanctioned.
  const topPermBlock = blocks.get('permissions')
  if (!topPermBlock) {
    add('TOP_PERMISSIONS_MISSING', 'workflow has no top-level permissions block; jobs inherit the repository default instead of least privilege')
  } else {
    const topPerm = topPermBlock.inline
      ? parseInlinePermissions(topPermBlock.inline)
      : parseScalarEntries(topPermBlock.lines)
    if (topPerm.get('__mode') === 'write-all') {
      add('TOP_PERMISSIONS_NOT_LEAST_PRIVILEGE', 'top-level permissions: write-all grants every scope writable at the top level')
    } else if (topPerm.get('__unparsed')) {
      add('TOP_PERMISSIONS_UNPARSEABLE', `top-level permissions value the auditor cannot reliably interpret: "${topPerm.get('__unparsed')}"`)
    } else if (topPerm.size === 0) {
      add('TOP_PERMISSIONS_NOT_LEAST_PRIVILEGE', 'top-level permissions is empty; jobs would inherit the repository default instead of least privilege')
    } else {
      for (const [scope, value] of topPerm) {
        if (scope.startsWith('__')) continue
        if (!PERM_VALUES.has(value)) {
          add('TOP_PERMISSIONS_VALUE_INVALID', `top-level permissions ${scope}: ${value}; allowed values are read/write/none`)
        } else if (value === 'write') {
          add('TOP_PERMISSIONS_NOT_LEAST_PRIVILEGE', `top-level permissions grants "${scope}: write"; the top level must be read-only (jobs declare their own widening)`)
        }
      }
    }
  }

  for (const [jobId, jobBlock] of subBlocks(blocks.get('jobs')?.lines ?? [], 2)) {
    const perm = jobPermissions(jobBlock.lines)
    const isPagesJob = allowedPagesJobs.includes(jobId)
    auditPermissionMap(perm, { isPagesJob, jobId, add })

    // pull_request_target is the one trigger that gets a write-capable token
    // for the base branch: it must never act on pull-request-head data.
    if (triggers.includes('pull_request_target')) {
      auditPullRequestTargetJob(jobBlock, jobId, add)
    }
  }

  if (fileName === 'deploy-pages.yml') {
    violations.push(...auditDeployWorkflow(blocks, fileName))
  }
  if (fileName === 'ci.yml') {
    violations.push(...auditBranchPolicy(blocks, fileName))
  }
  return violations
}

// Head-referencing channels inside a pull_request_target job:
//  - ref/repository values resolving the head (checkout of PR content) —
//    flow mappings included because the scan is line-based, not nesting-based;
//  - run scripts (inline or block) consuming head.sha / head.ref;
//  - other key: value inputs (with:, env:, artifact names) carrying
//    head.sha / head.ref. Display-only `name:` labels are exempt.
// head.repo.full_name is allowed outside ref/repository lines: it identifies
// the source repository (fork rejection), not head content.
function auditPullRequestTargetJob(jobBlock, jobId, add) {
  let runIndent = null
  for (const raw of jobBlock.lines) {
    const line = stripComments(raw)
    if (!line.trim()) continue
    const indent = line.length - line.trimStart().length
    if (runIndent !== null && indent <= runIndent) runIndent = null

    if (/(^|[\s{[])(ref|repository)\s*:\s*.*pull_request\.head/.test(line)) {
      add('PR_TARGET_HEAD_CHECKOUT', `job "${jobId}" resolves ref/repository from pull_request.head; pull_request_target workflows must only use the trusted base commit`)
      continue
    }

    const runMatch = line.match(/^\s*(?:-\s+)?run:\s*(.*)$/)
    if (runMatch) {
      const value = runMatch[1]
      if (/pull_request\.head\.(sha|ref)\b/.test(value)) {
        add('PR_TARGET_HEAD_REFERENCE', `job "${jobId}" run script consumes pull_request.head.sha/ref; head-controlled input must not reach executed scripts`)
      }
      if (/[|>]\s*$/.test(value)) runIndent = indent
      continue
    }
    if (runIndent !== null) {
      if (/pull_request\.head\.(sha|ref)\b/.test(line)) {
        add('PR_TARGET_HEAD_REFERENCE', `job "${jobId}" run script consumes pull_request.head.sha/ref; head-controlled input must not reach executed scripts`)
      }
      continue
    }

    const kv = line.match(/^\s*([A-Za-z_-]+):\s*(.+)$/)
    if (kv && !['name', 'uses', 'if', 'needs', 'runs-on', 'timeout-minutes', 'shell', 'working-directory'].includes(kv[1])
        && /pull_request\.head\.(sha|ref)\b/.test(kv[2])) {
      add('PR_TARGET_HEAD_REFERENCE', `job "${jobId}" passes pull_request.head.sha/ref into "${kv[1]}"; head-controlled input must not enter step inputs`)
    }
  }
}

function auditDeployWorkflow(blocks, fileName) {
  const violations = []
  const add = (code, message) => violations.push({ file: fileName, code, message })

  const triggers = triggerKeys(blocks.get('on'))
  if (triggers.includes('push')) {
    add('DEPLOY_TRIGGER_PUSH', 'deploy-pages.yml still auto-publishes on push to main; apply S0-FREEZE.patch (publishing must be workflow_dispatch only)')
  }
  if (triggers.includes('schedule')) {
    add('DEPLOY_TRIGGER_SCHEDULE', 'deploy-pages.yml must never publish on a schedule')
  }
  if (!triggers.includes('workflow_dispatch') || triggers.length !== 1) {
    add('DEPLOY_TRIGGER_NOT_DISPATCH_ONLY', `deploy-pages.yml triggers are [${triggers}], expected exactly [workflow_dispatch]`)
  }

  const jobs = subBlocks(blocks.get('jobs')?.lines ?? [], 2)
  const deploy = jobs.get('deploy')
  if (!deploy) {
    add('DEPLOY_JOB_MISSING', 'deploy-pages.yml has no "deploy" job')
  } else {
    // The publish job must only consume the artifact produced by the same
    // run: cross-run artifact pulls (run-id:) would let a wrong-SHA payload
    // reach production.
    for (const raw of deploy.lines) {
      if (/^\s*run-id:\s*\S/.test(stripComments(raw))) {
        add('CROSS_RUN_ARTIFACT', 'deploy job pulls an artifact from another run (run-id:); publish input must be the same-run verify artifact')
      }
    }

    const env = subBlocks(deploy.lines, 4).get('environment')
    const envName = env ? (env.inline || parseScalarEntries(env.lines).get('name')) : null
    if (envName !== 'github-pages') {
      add('DEPLOY_ENV_NOT_PAGES', `deploy job publishes to environment "${envName ?? '(none)'}"; expected "github-pages" (the environment whose branch policy pins ref main)`)
    }
    const perm = jobPermissions(deploy.lines)
    if (!perm) {
      add('DEPLOY_PERMISSIONS_MISSING', 'deploy job has no permissions block; it needs pages: write and id-token: write to publish')
    } else {
      if (perm.get('pages') !== 'write') add('DEPLOY_PERMISSIONS_MISSING', 'deploy job must declare pages: write (publish integrity)')
      if (perm.get('id-token') !== 'write') add('DEPLOY_PERMISSIONS_MISSING', 'deploy job must declare id-token: write (OIDC integrity)')
    }
  }

  const concurrency = blocks.get('concurrency')
  if (concurrency) {
    const entries = parseScalarEntries(concurrency.lines)
    if (entries.get('group') !== 'pages-production') {
      add('DEPLOY_CONCURRENCY_GROUP_CHANGED', `deploy concurrency group is "${entries.get('group')}", expected "pages-production" (single-flight production deploys)`)
    }
  } else {
    add('DEPLOY_CONCURRENCY_GROUP_CHANGED', 'deploy-pages.yml has no concurrency group; expected "pages-production"')
  }
  return violations
}

// Branch policy validation is signature-based, not verbatim: any accepted
// implementation must (a) map the gate env vars to the real GitHub contexts,
// (b) deny-by-default when the head is not same-repository dev, and (c) reach
// exit 1 on violation. Two signatures are accepted:
//   v1 (base 22eb347): job `if` gates on main; script denies via !=/||.
//   v2 (PR #37): script gates on EVENT_NAME+BASE_REF; script denies via a
//     positive [[ ... == dev && ... == ... ]] || exit 1.
// Anything else fails closed (BRANCH_POLICY_WEAKENED when recognizable
// fragments exist, BRANCH_POLICY_UNRECOGNIZED otherwise).
const REQUIRED_ENV_BINDINGS = {
  BASE_REF: '${{github.base_ref}}',
  HEAD_REF: '${{github.head_ref}}',
  HEAD_REPOSITORY: '${{github.event.pull_request.head.repo.full_name}}',
  BASE_REPOSITORY: '${{github.repository}}',
}

function collectStepEnv(blockLines) {
  const env = new Map()
  let envIndent = null
  for (const raw of blockLines) {
    const line = stripComments(raw)
    if (!line.trim()) continue
    const indent = line.length - line.trimStart().length
    if (envIndent !== null) {
      if (indent > envIndent) {
        const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/)
        if (m) env.set(m[1], m[2].replace(/\s+/g, ''))
        continue
      }
      envIndent = null
    }
    if (/^\s*env:\s*$/.test(line)) envIndent = indent
  }
  return env
}

function normalizeScript(blockLines) {
  return blockLines
    .map(stripComments)
    .join('\n')
    .replace(/\\\r?\n/g, ' ')
    .replace(/\s+/g, '')
}

export function auditBranchPolicy(blocks, fileName) {
  const violations = []
  const add = (code, message) => violations.push({ file: fileName, code, message })

  const jobs = subBlocks(blocks.get('jobs')?.lines ?? [], 2)
  const policy = jobs.get('branch-policy')
  if (!policy) {
    add('BRANCH_POLICY_JOB_MISSING', 'ci.yml has no "branch-policy" job; promotion from dev to main is no longer enforced in CI')
    return violations
  }

  const env = collectStepEnv(policy.lines)
  for (const [key, expected] of Object.entries(REQUIRED_ENV_BINDINGS)) {
    if (env.get(key) !== expected) {
      add('BRANCH_POLICY_ENV_BINDING_WEAKENED',
        `branch-policy env var ${key} must interpolate the real context ${expected}; found ${env.get(key) ? `"${env.get(key)}"` : 'nothing'} (hard-wired values make the gate vacuous)`)
    }
  }
  const event = env.get('EVENT_NAME')
  if (event && event !== '${{github.event_name}}') {
    add('BRANCH_POLICY_ENV_BINDING_WEAKENED', `branch-policy env var EVENT_NAME must interpolate \${{ github.event_name }}; found "${event}"`)
  }

  const jobIf = subBlocks(policy.lines, 4).get('if')
  const jobIfText = jobIf ? (jobIf.inline || jobIf.lines.join(' ')) : ''
  const script = normalizeScript(policy.lines)
  const gate =
    jobIfText.includes("github.base_ref == 'main'") ||
    script.includes('[["$EVENT_NAME"=="pull_request"&&"$BASE_REF"=="main"]]') ||
    script.includes('[["$BASE_REF"=="main"]]')

  const sigV1 = script.includes('[["$BASE_REF"=="main"]]&&[["$HEAD_REF"!="dev"||"$HEAD_REPOSITORY"!="$BASE_REPOSITORY"]]') && script.includes('exit1')
  const sigV2 = script.includes('[["$EVENT_NAME"=="pull_request"&&"$BASE_REF"=="main"]]')
    && script.includes('[["$HEAD_REF"=="dev"&&"$HEAD_REPOSITORY"=="$BASE_REPOSITORY"]]||exit1')

  if (!gate) add('BRANCH_POLICY_NOT_GATED', 'branch-policy job no longer gates on pull_request to main')
  if (!sigV1 && !sigV2) {
    const recognizable = script.includes('HEAD_REF') && /dev/.test(script) && script.includes('exit1')
    if (recognizable) {
      add('BRANCH_POLICY_WEAKENED', 'branch-policy job resembles a gate but no accepted deny-by-default signature matches; a constraint was likely removed or weakened')
    } else {
      add('BRANCH_POLICY_UNRECOGNIZED', 'branch-policy job implements no accepted gate signature (v1 deny-by-default or v2 positive-gate); extend the auditor deliberately before trusting it')
    }
  }
  return violations
}

export function auditCodeowners(text, fileName = '.github/CODEOWNERS') {
  const violations = []
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  if (!lines.some((l) => l === '*' || l.startsWith('* '))) {
    violations.push({ file: fileName, code: 'DEFAULT_OWNER_RULE_MISSING', message: 'CODEOWNERS has no default "*" owner rule' })
  }
  if (!lines.some((l) => /^\/\.github\/(\s|$)/.test(l) && l.includes('@'))) {
    violations.push({ file: fileName, code: 'GOVERNANCE_PATH_UNOWNED', message: 'CODEOWNERS does not place /.github/ under explicit owner review' })
  }
  return violations
}

// Audit a whole repository checkout: files = [{ path, text }] with paths
// relative to the repository root.
export function auditRepository(files) {
  const pagesJobs = { 'deploy-pages.yml': ['deploy'] }
  const violations = []
  const workflowFiles = files.filter((f) => f.path.startsWith('.github/workflows/'))
  for (const file of workflowFiles) {
    const name = file.path.replace(/^\.github\/workflows\//, '')
    violations.push(...auditWorkflow(file.text, name, { pagesJobs }))
  }
  if (!workflowFiles.some((f) => f.path === '.github/workflows/deploy-pages.yml')) {
    violations.push({
      file: '.github/workflows/',
      code: 'PAGES_ENTRY_WORKFLOW_MISSING',
      message: 'deploy-pages.yml is absent; the sanctioned Pages publish entry must exist for its dispatch-only and least-privilege invariants to be enforced',
    })
  }

  // Required status checks match check-run names exactly: two jobs sharing
  // one display name means a required check can be satisfied by whichever
  // workflow happens to run (impersonation surface).
  const names = new Map()
  for (const file of workflowFiles) {
    const wfName = file.path.replace(/^\.github\/workflows\//, '')
    const jobs = subBlocks(topLevelBlocks(file.text).get('jobs')?.lines ?? [], 2)
    for (const [jobId, jobBlock] of jobs) {
      const nameEntry = subBlocks(jobBlock.lines, 4).get('name')
      const display = nameEntry ? (nameEntry.inline || null) : jobId
      if (!display || display.includes('${{')) continue
      if (!names.has(display)) names.set(display, [])
      names.get(display).push(`${wfName}:${jobId}`)
    }
  }
  for (const [display, owners] of names) {
    if (owners.length > 1) {
      violations.push({
        file: '.github/workflows/',
        code: 'CHECK_NAME_COLLISION',
        message: `check-run name "${display}" is produced by ${owners.join(', ')}; a required check with this name can be satisfied by any of them`,
      })
    }
  }

  const codeowners = files.find((f) => f.path === '.github/CODEOWNERS')
  if (codeowners) violations.push(...auditCodeowners(codeowners.text))
  else violations.push({ file: '.github/CODEOWNERS', code: 'GOVERNANCE_PATH_UNOWNED', message: 'CODEOWNERS file is missing entirely' })
  return violations
}

export function formatViolations(violations) {
  if (violations.length === 0) return 'governance audit: clean'
  const byFile = new Map()
  for (const v of violations) {
    if (!byFile.has(v.file)) byFile.set(v.file, [])
    byFile.get(v.file).push(v)
  }
  const lines = [`governance audit: ${violations.length} violation(s)`]
  for (const [file, items] of byFile) {
    lines.push(`  ${file}`)
    for (const v of items) lines.push(`    [${v.code}] ${v.message}`)
  }
  return lines.join('\n')
}
