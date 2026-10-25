// Governance audit library for the symgene website repository.

import { YamlParseError, parseYaml, workflowJobs, mapGet, asString } from './mini-yaml.mjs'
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

// Canonical branch-policy gate scripts. Matching is TEMPLATE EQUALITY of the
// whitespace-normalized script (not containment): a signature appearing in a
// dead string, behind extra statements, or inside another branch of control
// flow does not prove execution semantics. New gate variants require a
// deliberate, reviewed extension of this list.
const V1_CANONICAL = `if [[ "$BASE_REF" == "main" ]] && \
[[ "$HEAD_REF" != "dev" || "$HEAD_REPOSITORY" != "$BASE_REPOSITORY" ]]; then
echo "Pull requests to main must promote the dev branch from this repository."
echo "Received: $HEAD_REPOSITORY:$HEAD_REF -> $BASE_REPOSITORY:$BASE_REF"
exit 1
fi`

const V2_CANONICAL = `if [[ "$EVENT_NAME" == "pull_request" && "$BASE_REF" == "main" ]]; then
[[ "$HEAD_REF" == "dev" && "$HEAD_REPOSITORY" == "$BASE_REPOSITORY" ]] || exit 1
fi`

// Quote-aware shell normalization: whitespace OUTSIDE quotes is removed
// entirely; every character INSIDE quotes is preserved verbatim. Stripping
// all whitespace (R3) made "de v" and "dev" normalize identically — a real
// bypass, because "de v" is a valid git branch name.
// Quote-aware shell normalization (R5): whitespace OUTSIDE quotes is
// removed; every character INSIDE quotes is preserved verbatim; line
// breaks outside quotes collapse to a single '\n' marker (a shell newline
// is a command terminator — 'exit\n1' is NOT 'exit 1'), and edge
// newlines are trimmed. Quote content is never altered.
function normalizeShellText(s) {
  if (!s) return ''
  let out = ''
  let q = null
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) {
      if (q === '"' && ch === '\\') { out += ch + (s[i + 1] ?? ''); i++; continue }
      if (ch === q) q = null
      out += ch
      continue
    }
    if (ch === '"' || ch === "'") { q = ch; out += ch; continue }
    if (ch === '\\' && (s[i + 1] === '\n' || s[i + 1] === '\r')) { i++; continue }
    if (ch === '\n') { out += '\n'; continue }
    if (/\s/.test(ch)) continue
    out += ch
  }
  return out.replace(/\n{2,}/g, '\n').replace(/^\n+|\n+$/g, '')
}
const V1_TEMPLATE = normalizeShellText(V1_CANONICAL)
const V2_TEMPLATE = normalizeShellText(V2_CANONICAL)

// Duplicate keys are valid YAML (last wins — the scanner's Maps behave the
// same, so conclusions stay consistent), but they are a classic parser-
// confusion foot-gun: flag them for deliberate review.
export function findDuplicateKeys(text) {
  const dups = []
  const seenTop = new Set()
  let inJobs = false
  const seenJobs = new Set()
  for (const raw of text.split('\n')) {
    const line = stripComments(raw)
    if (!line.trim()) continue
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*|"[^"]+"):\s*(.*)$/)
    if (m) {
      if (seenTop.has(m[1])) dups.push({ scope: '(top level)', key: m[1] })
      seenTop.add(m[1])
      inJobs = m[1] === 'jobs'
      continue
    }
    if (inJobs) {
      const j = line.match(/^ {2}([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/)
      if (j) {
        if (seenJobs.has(j[1])) dups.push({ scope: 'jobs', key: j[1] })
        seenJobs.add(j[1])
      }
    }
  }
  return dups
}

// continue-on-error / "|| true" / "set +e" swallow failures that gate and
// publish chains depend on. Scoped to the jobs whose result is security
// relevant; reporting bots elsewhere keep their legitimate usage.
function auditSwallowedFailures(treeJobs, guardedJobIds, add) {
  for (const [jobId, job] of treeJobs) {
    if (!guardedJobIds.includes(jobId)) continue
    // job-level continue-on-error
    const jobCoe = job.node && job.node.kind === 'map' ? asString(mapGet(job.node, 'continue-on-error')) : null
    if (jobCoe !== null && jobCoe !== undefined && jobCoe !== 'false') {
      add('FAILURE_SWALLOWED', `job "${jobId}" sets continue-on-error: ${jobCoe}; only the literal false is accepted`)
    }
    for (const step of job.steps) {
      const coe = step.continueOnError
      if (coe !== null && coe !== undefined && coe !== 'false') {
        add('FAILURE_SWALLOWED', `job "${jobId}" step sets continue-on-error: ${coe}; only the literal false is accepted, anything else (including expressions) can swallow failures`)
      }
      if (step.run !== null && step.run !== undefined) {
        for (const line of step.run.split('\n')) {
          if (/\bset\s+\+e\b/.test(line)) {
            add('FAILURE_SWALLOWED', `job "${jobId}" disables errexit (set +e); failures would be swallowed`)
          }
          auditPipeSwallow(line, jobId, add)
        }
      }
    }
  }
}

// Flag `||` operators outside quotes unless the right-hand side is the
// fail-loud `exit 1` (the v2 gate form). Covers "|| true", "|| :",
// "|| exit 0", "|| echo ..." and similar swallows; JS script blocks are out
// of scope ("||" there is the logical operator, not shell failure control).
function auditPipeSwallow(text, jobId, add) {
  let q = null
  let bracketDepth = 0 // inside [[ ]] the "||" is the test operator, not shell pipe
  for (let i = 0; i < text.length - 1; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '\\') { i++; continue }
      if (ch === q) q = null
      continue
    }
    if (ch === '"' || ch === "'") { q = ch; continue }
    if (ch === '[' && text[i + 1] === '[') { bracketDepth++; i++; continue }
    if (ch === ']' && text[i + 1] === ']' && bracketDepth > 0) { bracketDepth--; i++; continue }
    if (bracketDepth === 0 && ch === '|' && text[i + 1] === '|') {
      const rhs = text.slice(i + 2).trim()
      if (!/^exit\s+1\b/.test(rhs)) {
        add('FAILURE_SWALLOWED', `job "${jobId}" swallows a failure with "|| ${rhs.slice(0, 30)}"; only "|| exit 1" (fail-loud) is accepted in gate/publish shell steps`)
      }
      return
    }
  }
}

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

  // R5-A: structured parse first. Any construct outside the declared subset
  // throws and becomes a violation — never a silent pass-through.
  let tree
  try {
    tree = parseYaml(text)
  } catch (e) {
    if (e instanceof YamlParseError) {
      const msg = e.message
      const code = /duplicate key/.test(msg) ? 'YAML_DUPLICATE_KEY'
        : /multi-document|tab indentation|anchor|alias/.test(msg) ? 'UNSUPPORTED_YAML_CONSTRUCT'
        : 'PARSE_ERROR'
      add(code, `structured parse failed: ${msg}`)
      return violations
    }
    throw e
  }
  const treeJobs = workflowJobs(tree)

  const blocks = topLevelBlocks(text)
  const allowedPagesJobs = pagesJobs[fileName] ?? []

  const onBlock = blocks.get('on')
  const triggers = triggerKeys(onBlock)
  auditSyntaxSubset(text, triggers, add)

  for (const d of findDuplicateKeys(text)) {
    add('YAML_DUPLICATE_KEY', `duplicate key "${d.key}" in ${d.scope}; last-wins is consistent here but duplicate keys are a parser-confusion foot-gun`)
  }
  const jobsBlock = blocks.get('jobs')
  if (jobsBlock && jobsBlock.inline) {
    add('UNSUPPORTED_YAML_CONSTRUCT', 'jobs declared as a flow mapping; the auditor only parses block-form jobs and fails closed otherwise')
  }

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

  const jobs = subBlocks(blocks.get('jobs')?.lines ?? [], 2)
  for (const [jobId, jobBlock] of jobs) {
    if (jobBlock.inline) {
      add('UNSUPPORTED_YAML_CONSTRUCT', `job "${jobId}" uses a flow mapping; the auditor only parses block-form jobs and fails closed otherwise`)
      continue
    }
    const jv = treeJobs.get(jobId)
    if (jv && jv.node && jv.node.kind === 'map' && jv.node.flow) {
      add('UNSUPPORTED_YAML_CONSTRUCT', `job "${jobId}" is declared as a flow mapping; the declared subset requires block-form jobs`)
      continue
    }
    const stepsNode = jv && jv.node && jv.node.kind === 'map' ? mapGet(jv.node, 'steps') : null
    if (stepsNode && stepsNode.flow) {
      add('UNSUPPORTED_YAML_CONSTRUCT', `job "${jobId}" declares steps as a flow sequence; the declared subset requires block-form steps`)
    }
    const nameEntry = subBlocks(jobBlock.lines, 4).get('name')
    if (nameEntry && (nameEntry.inline || '').includes('${{')) {
      add('JOB_NAME_DYNAMIC', `job "${jobId}" has a dynamic display name; check-run names must be static for impersonation detection`)
    }
    const perm = jobPermissions(jobBlock.lines)
    const isPagesJob = allowedPagesJobs.includes(jobId)
    auditPermissionMap(perm, { isPagesJob, jobId, add })

    if (jv && jv.steps.some((s) => s.node && s.node.flow)) {
      add('UNSUPPORTED_YAML_CONSTRUCT', `job "${jobId}" has flow-mapping steps; the declared subset requires block-form steps`)
    }
    // pull_request_target is the one trigger that gets a write-capable token
    // for the base branch: it must never act on attacker-controlled PR input.
    if (triggers.includes('pull_request_target')) {
      auditPullRequestTargetJob(treeJobs.get(jobId), jobId, add)
    }
  }

  if (fileName === 'deploy-pages.yml') {
    auditSwallowedFailures(treeJobs, [...jobs.keys()], add)
    violations.push(...auditVerifyContract(treeJobs))
    violations.push(...auditDeployWorkflow(blocks, fileName))
  }
  if (fileName === 'ci.yml') {
    auditSwallowedFailures(treeJobs, ['branch-policy', 'governance', 'verify'], add)
    // Skipped jobs SATISFY required checks (official docs), so conditional
    // gate jobs would silently vacate the required set.
    for (const [jobId, cond] of [['governance', 'GOVERNANCE_JOB_CONDITIONAL'], ['verify', 'VERIFY_JOB_CONDITIONAL']]) {
      const jv = treeJobs.get(jobId)
      if (jv && jv.if !== null && jv.if !== undefined) {
        add(cond, `the ${jobId} job has a job-level if ("${jv.if}"); skipped jobs satisfy required checks, so it must run on every CI event unconditionally`)
      }
    }
    violations.push(...auditBranchPolicy(blocks, treeJobs, fileName))
    violations.push(...auditGovernanceContract(treeJobs, fileName))
    violations.push(...auditVerifyContract(treeJobs))
  }
  return violations
}

// Governance execution contract: the job exists unconditionally and runs the
// canonical test command in exactly one unconditional step (R5-5).
const GOVERNANCE_RUN = normalizeShellText('node --test .github/tests/*.test.mjs')
function auditGovernanceContract(treeJobs, fileName) {
  const violations = []
  const add = (code, message) => violations.push({ file: fileName, code, message })
  const gov = treeJobs.get('governance')
  if (!gov) {
    add('GOVERNANCE_JOB_MISSING', 'ci.yml has no "governance" job; the trusted-governance audit is not part of the required chain (S1 must be present)')
    return violations
  }
  const runSteps = gov.steps.filter((s) => s.run !== null && s.run !== undefined)
  if (runSteps.length !== 1 || normalizeShellText(runSteps[0].run) !== GOVERNANCE_RUN) {
    const got = runSteps.map((s) => normalizeShellText(s.run).slice(0, 40)).join(' | ') || '(none)'
    add('GOVERNANCE_STEP_CONTRACT', `the governance job must run exactly one canonical step ("node --test .github/tests/*.test.mjs"); found: ${got}`)
  }
  for (const s of gov.steps) {
    if (s.if !== null && s.if !== undefined) {
      add('GOVERNANCE_STEP_CONDITIONAL', `governance step "${s.name ?? s.run ?? '?'}" is conditional ("${s.if}"); skipped steps satisfy required checks`)
    }
    if (s.continueOnError !== null && s.continueOnError !== undefined && s.continueOnError !== 'false') {
      add('FAILURE_SWALLOWED', `governance step sets continue-on-error: ${s.continueOnError}`)
    }
  }
  return violations
}

// Verify execution contract for the CI and publish chains (R5-3/4/6):
// the verify job exists unconditionally, runs the canonical `npm run verify`
// step after `npm ci`, and nothing in the job swallows failures.
const VERIFY_RUN = normalizeShellText('npm run verify')
const NPM_CI_RUN = normalizeShellText('npm ci')
function auditVerifyContract(treeJobs) {
  const violations = []
  const addV = (code, message) => violations.push({ file: 'verify contract', code, message })
  const verify = treeJobs.get('verify')
  if (!verify) {
    addV('VERIFY_JOB_MISSING', 'no "verify" job found; the canonical verification step is not part of the chain')
    return violations
  }
  if (verify.if !== null && verify.if !== undefined) {
    addV('VERIFY_JOB_CONDITIONAL', `the verify job has a job-level if ("${verify.if}"); skipped jobs satisfy required checks`)
  }
  const runSteps = verify.steps.filter((s) => s.run !== null && s.run !== undefined)
  const verifyIdx = runSteps.findIndex((s) => normalizeShellText(s.run) === VERIFY_RUN)
  const ciIdx = runSteps.findIndex((s) => normalizeShellText(s.run) === NPM_CI_RUN)
  if (verifyIdx === -1) {
    addV('VERIFY_STEP_CONTRACT', 'the verify job does not contain the canonical "npm run verify" step; verification may be skipped or replaced')
  } else {
    if (verify.steps.find((s) => normalizeShellText(s.run) === VERIFY_RUN)?.if) {
      addV('VERIFY_STEP_CONDITIONAL', 'the canonical verify step is conditional; it must execute unconditionally')
    }
    if (ciIdx === -1) {
      addV('VERIFY_STEP_ORDER', 'the verify job has no "npm ci" step before "npm run verify"; the chain may run against unmanaged dependencies')
    } else if (ciIdx > verifyIdx) {
      addV('VERIFY_STEP_ORDER', '"npm ci" must run before "npm run verify"')
    }
  }
  for (const s of verify.steps) {
    if (s.continueOnError !== null && s.continueOnError !== undefined && s.continueOnError !== 'false') {
      addV('FAILURE_SWALLOWED', `verify step sets continue-on-error: ${s.continueOnError}`)
    }
    if (s.if !== null && s.if !== undefined && normalizeShellText(s.run ?? '') === VERIFY_RUN) {
      addV('VERIFY_STEP_CONDITIONAL', 'the canonical verify step is conditional')
    }
  }
  return violations
}

// pull_request_target jobs get a write-capable token for the base branch.
// Interpolation of attacker-controlled PR fields into scripts or step inputs
// is code injection; only pull_request.number and pull_request.base.* may be
// interpolated. head.sha|ref additionally must never reach ref/repository
// (checkout) or any executed/input position. Display `name:` labels are
// exempt. Scans operate on the PARSED step structure (run text and every
// with:/env input value), so block scalars cannot hide content (R5-A).
const PR_TRUSTED_FIELDS = /^(number|base\.)/

function flattenNodeStrings(node, out) {
  if (node === null || node === undefined) return
  if (typeof node === 'string') { out.push(node); return }
  if (node.kind === 'block') { out.push(node.text); return }
  if (node.kind === 'seq') { for (const it of node.items) flattenNodeStrings(it, out); return }
  if (node.kind === 'map') { for (const [k, v] of node.entries) { out.push(k); flattenNodeStrings(v, out) } }
}

function auditPullRequestTargetJob(job, jobId, add) {
  for (const step of job.steps) {
    if (step.node && step.node.kind === 'map') {
      const withNode = mapGet(step.node, 'with')
      if (withNode && withNode.kind === 'map') {
        for (const [key, value] of withNode.entries) {
          const sv = typeof value === 'string' ? value : (value && value.kind === 'block' ? value.text : String(value ?? ''))
          if (/^(ref|repository)$/.test(key) && /pull_request\.head/.test(sv)) {
            add('PR_TARGET_HEAD_CHECKOUT', `job "${jobId}" resolves ${key} from pull_request.head; pull_request_target workflows must only use the trusted base commit`)
            continue
          }
          const targets = []
          flattenNodeStrings(value, targets)
          for (const s of targets) auditUntrustedInterpolation(s, jobId, `with input "${key}"`, add)
        }
      }
      const envNode = mapGet(step.node, 'env')
      if (envNode && envNode.kind === 'map') {
        for (const [key, value] of envNode.entries) {
          auditUntrustedInterpolation(typeof value === 'string' ? value : String(value ?? ''), jobId, `env input "${key}"`, add)
        }
      }
    }
    if (step.run !== null && step.run !== undefined) {
      for (const line of step.run.split('\n')) {
        auditUntrustedInterpolation(line, jobId, 'run script', add)
      }
    }
  }
}

function auditUntrustedInterpolation(text, jobId, where, add) {
  for (const m of text.matchAll(/\$\{\{\s*([^}]+?)\s*\}\}/g)) {
    // normalize bracket indexing to dot paths so `github['event']...` cannot
    // evade the scanner; strip whitespace.
    const expr = m[1]
      .replace(/\[\s*'([^']+)'\s*\]/g, '.$1')
      .replace(/\[\s*"([^"]+)"\s*\]/g, '.$1')
      .replace(/\s+/g, '')
    if (/^github\.head_ref\b/.test(expr)) {
      add('PR_TARGET_UNTRUSTED_INPUT', `job "${jobId}" ${where} interpolates attacker-controlled github.head_ref (the PR head branch name); it must not reach executed scripts or step inputs`)
      continue
    }
    const pm = expr.match(/^github\.event\.pull_request\.(.+)$/)
    if (!pm) continue
    const field = pm[1]
    if (PR_TRUSTED_FIELDS.test(field)) continue
    if (/^head\.(sha|ref)\b/.test(field)) {
      add('PR_TARGET_HEAD_REFERENCE', `job "${jobId}" ${where} consumes pull_request.head.sha/ref; head-controlled input must not reach executed scripts or step inputs`)
    } else {
      add('PR_TARGET_UNTRUSTED_INPUT', `job "${jobId}" ${where} interpolates attacker-controlled pull_request.${field}; only pull_request.number and pull_request.base.* may be interpolated`)
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
      // Allowlist: write only for the publishing scopes; read only for the
      // scopes the chain legitimately needs (contents, actions).
      for (const [scope, value] of perm) {
        if (scope.startsWith('__')) continue
        if (value === 'write' && !['pages', 'id-token'].includes(scope)) {
          add('DEPLOY_PERMISSIONS_UNEXPECTED', `deploy job grants unexpected "${scope}: write"; the publishing allowlist is pages/id-token write only`)
        }
        if (value === 'read' && !['contents', 'actions'].includes(scope)) {
          add('DEPLOY_PERMISSIONS_UNEXPECTED', `deploy job grants unexpected "${scope}: read"; the allowlist is contents/actions read`)
        }
      }
    }

    // The deploy job must depend on the verification chain and run only after
    // its needs succeed: no needs, unknown needs, or an always()-style if
    // would let an unverified or failed run reach production.
    const needsEntry = subBlocks(deploy.lines, 4).get('needs')
    let needsList = []
    if (needsEntry) {
      if (needsEntry.inline) {
        needsList = needsEntry.inline.replace(/[[\]]/g, '').split(',').map((s) => s.trim()).filter(Boolean)
      } else {
        needsList = needsEntry.lines.map((l) => stripComments(l).trim().replace(/^-\s*/, '').trim()).filter(Boolean)
      }
    }
    if (!needsList.includes('verify')) {
      add('DEPLOY_NEEDS_MISSING', `deploy job needs [${needsList}] does not include "verify"; publish must depend on the verification chain`)
    }
    for (const n of needsList) {
      if (n !== 'verify' && !jobs.has(n)) {
        add('DEPLOY_NEEDS_UNKNOWN', `deploy job needs unknown job "${n}"`)
      }
    }
    if (subBlocks(deploy.lines, 4).get('if')) {
      add('DEPLOY_FAILURE_FINALITY', 'deploy job has a job-level if; it must run unconditionally after its needs succeed (always()/!cancelled() would bypass verify failures)')
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
const BLOCK_HEADER_RE = /^[|>](?:[0-9][+-]?|[+-][0-9]?|[0-9])?$/

// Extract the run-block script for ONE step. Block scalars with chomping
// and indentation indicators are supported (`|`, `|-`, `>`, `>-`, `|2`,
// `|-2`, ...); literal and folded normalize equal because outside-quote
// whitespace is removed. ok=false means the run form cannot be reliably
// parsed — callers must fail closed.
function extractRunBlock(blockLines) {
  const lines = blockLines.map(stripComments)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(?:-\s+)?run:\s*(.*)$/)
    if (!m) continue
    const value = m[1].trim()
    if (!/^[|>]/.test(value)) return { script: normalizeShellText(value), ok: true }
    if (!BLOCK_HEADER_RE.test(value)) return { script: '', ok: false }
    const indent = lines[i].length - lines[i].trimStart().length
    const body = []
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]
      if (!l.trim()) { body.push(''); continue }
      const li = l.length - l.trimStart().length
      if (li <= indent) break
      body.push(l)
    }
    return { script: normalizeShellText(body.join('\n')), ok: true }
  }
  return { script: '', ok: false }
}

// Environment blocks declared at exactly `indent` (job-level block or one
// step's own block).
function collectEnvAt(blockLines, indent) {
  const env = new Map()
  let envIndent = null
  for (const raw of blockLines) {
    const line = stripComments(raw)
    if (!line.trim()) continue
    const li = line.length - line.trimStart().length
    if (envIndent !== null) {
      if (li > envIndent) {
        const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/)
        if (m) env.set(m[1], m[2].replace(/\s+/g, ''))
        continue
      }
      envIndent = null
    }
    if (li === indent && /^\s*env:\s*$/.test(line)) envIndent = li
  }
  return env
}

// Sequence entries (`- ` items) at exactly `indent`, each with its body lines.
function splitSequenceEntries(blockLines, indent) {
  const entries = []
  const prefix = ' '.repeat(indent)
  let current = null
  for (const raw of blockLines) {
    const line = stripComments(raw)
    if (!line.trim()) continue
    if (line.startsWith(prefix) && !line.startsWith(prefix + ' ') && /^-\s/.test(line.slice(prefix.length))) {
      current = { lines: [raw] }
      entries.push(current)
      continue
    }
    if (current && line.length - line.trimStart().length > indent) current.lines.push(raw)
  }
  return entries
}

// Branch policy validation binds the template script, the effective
// environment (job-level merged with the gate step's own block) and the step
// conditions to ONE actual step. R3 merged env blocks across steps, so a
// hard-wired gate step could be masked by a later step carrying correct
// values. Matching is template EQUALITY via the quote-aware normalization;
// unparseable run forms fail closed.
const REQUIRED_ENV_BINDINGS = {
  BASE_REF: '${{github.base_ref}}',
  HEAD_REF: '${{github.head_ref}}',
  HEAD_REPOSITORY: '${{github.event.pull_request.head.repo.full_name}}',
  BASE_REPOSITORY: '${{github.repository}}',
}

export function auditBranchPolicy(blocks, treeJobs, fileName) {
  const violations = []
  const add = (code, message) => violations.push({ file: fileName, code, message })

  const policy = treeJobs.get('branch-policy')
  if (!policy) {
    add('BRANCH_POLICY_JOB_MISSING', 'ci.yml has no "branch-policy" job; promotion from dev to main is no longer enforced in CI')
    return violations
  }

  // job-level if: exact v1 gating condition (quote-aware comparison)
  const acceptedJobIf = normalizeShellText("github.event_name == 'pull_request' && github.base_ref == 'main'")
  const jobIfOk = !policy.if || normalizeShellText(policy.if) === acceptedJobIf
  if (!jobIfOk) {
    add('BRANCH_POLICY_NOT_GATED', `branch-policy job-level if "${policy.if}" is not the exact v1 main-gating condition; altered conditions (e.g. quoted "ma in") can skip the gate exactly when it must run`)
  }

  const jobEnv = collectEnvNode(policy.node, null)
  let gateSteps = 0
  let fragmentStep = null
  for (const step of policy.steps) {
    if (step.run === null || step.run === undefined) continue
    const script = normalizeShellText(step.run)
    const isGate = script === V1_TEMPLATE || script === V2_TEMPLATE
    if (!isGate) {
      if (script.includes('HEAD_REF') && /dev/.test(script) && script.includes('exit1')) fragmentStep = { step, script }
      continue
    }
    gateSteps++
    if (step.if !== null && step.if !== undefined) {
      add('BRANCH_POLICY_STEP_CONDITION', 'the gate step is conditional; it must execute on every PR to main (skipped steps satisfy required checks)')
    }
    // effective env = job-level merged with the gate step's own block
    const stepEnv = collectEnvNode(step.env, null)
    const effective = new Map([...jobEnv, ...stepEnv])
    for (const [key, expected] of Object.entries(REQUIRED_ENV_BINDINGS)) {
      if (effective.get(key) !== expected) {
        add('BRANCH_POLICY_ENV_BINDING_WEAKENED', `gate step env ${key} must interpolate the real context ${expected}; found ${effective.get(key) ? `"${effective.get(key)}"` : 'nothing'} (hard-wired or wrong-step values make the gate vacuous)`)
      }
    }
    const event = effective.get('EVENT_NAME')
    if (event && event !== '${{github.event_name}}') {
      add('BRANCH_POLICY_ENV_BINDING_WEAKENED', 'gate step env EVENT_NAME must interpolate ${{ github.event_name }}; found "' + event + '"')
    }
  }

  if (gateSteps === 0) {
    if (fragmentStep) {
      add('BRANCH_POLICY_WEAKENED', 'a branch-policy step resembles a gate but does not equal an accepted template; a constraint was likely removed, weakened, or quoted differently')
    } else {
      add('BRANCH_POLICY_UNRECOGNIZED', 'no branch-policy step equals an accepted gate template (v1 deny-by-default, v2 positive-gate); extend the auditor deliberately before trusting it')
    }
  }
  return violations
}

// env map node (parsed) -> normalized key/value map
function collectEnvNode(envNode, _unused) {
  const env = new Map()
  if (envNode && envNode.kind === 'map') {
    for (const [k, v] of envNode.entries) {
      env.set(k, typeof v === 'string' ? v.replace(/\s+/g, '') : String(v ?? '').replace(/\s+/g, ''))
    }
  }
  return env
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
