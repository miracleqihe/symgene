// Governance audit library for the symgene website repository.
//
// Structural audits over the workflow YAML files. Deliberately dependency
// free (node stdlib only) so CI can run it before `npm ci` and nobody can
// tamper with it through package installs. It scans the small YAML subset
// the repository actually uses: 2-space indentation, block maps, plain
// `key: value` scalars. Anything outside that subset that matters is a
// violation by construction (fail closed).

const JOB_ESCALATION_PERMISSIONS = [
  'pages: write',
  'id-token: write',
  'deployments: write',
  'contents: write',
  'actions: write',
  'checks: write',
  'packages: write',
  'administration: write',
]

// Job-level widenings considered acceptable for commenting/reporting bots.
const BENIGN_JOB_PERMISSIONS = new Set([
  'contents: read',
  'issues: write',
  'pull-requests: write',
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
// dedicated scalar blocks (permissions, environment, concurrency).
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

export function jobPermissions(jobBlockLines) {
  // job bodies are declared at 4-space absolute indent (jobs at 2-space)
  const perm = subBlocks(jobBlockLines, 4).get('permissions')
  if (!perm) return null
  if (perm.inline) return new Map([['__inline', perm.inline]])
  return parseScalarEntries(perm.lines)
}

function formatPermissions(map) {
  return [...map.entries()].filter(([k]) => k !== '__inline').map(([k, v]) => `${k}: ${v}`)
}

// Audit one workflow file. `pagesJobs` maps file name -> job ids allowed to
// carry the production publishing permissions (pages: write / id-token: write).
export function auditWorkflow(text, fileName, { pagesJobs = {} } = {}) {
  const violations = []
  const add = (code, message) => violations.push({ file: fileName, code, message })
  const blocks = topLevelBlocks(text)
  const allowedPagesJobs = pagesJobs[fileName] ?? []

  const topPermBlock = blocks.get('permissions')
  const topPerm = topPermBlock
    ? (topPermBlock.inline
        ? new Map([['__inline', topPermBlock.inline]])
        : parseScalarEntries(topPermBlock.lines))
    : null
  if (!topPerm) {
    add('TOP_PERMISSIONS_MISSING', 'workflow has no top-level permissions block; jobs inherit the repository default instead of least privilege')
  } else if (topPerm.get('__inline')) {
    add('TOP_PERMISSIONS_NOT_LEAST_PRIVILEGE', `top-level permissions is inline "${topPerm.get('__inline')}" instead of contents: read`)
  } else if (topPerm.size !== 1 || topPerm.get('contents') !== 'read') {
    add('TOP_PERMISSIONS_NOT_LEAST_PRIVILEGE', `top-level permissions is [${formatPermissions(topPerm)}], expected exactly [contents: read]`)
  }

  const onBlock = blocks.get('on')
  const triggers = triggerKeys(onBlock)

  for (const [jobId, jobBlock] of subBlocks(blocks.get('jobs')?.lines ?? [], 2)) {
    const perm = jobPermissions(jobBlock.lines)
    if (perm) {
      const formatted = formatPermissions(perm)
      const isPagesJob = allowedPagesJobs.includes(jobId)
      for (const entry of formatted) {
        if (JOB_ESCALATION_PERMISSIONS.includes(entry) && !isPagesJob) {
          add('JOB_PRIVILEGE_ESCALATION', `job "${jobId}" grants "${entry}"; only ${allowedPagesJobs.map((j) => `"${j}"`).join(', ') || 'no job'} may hold production permissions`)
        }
        if (!isPagesJob && !BENIGN_JOB_PERMISSIONS.has(entry) && !JOB_ESCALATION_PERMISSIONS.includes(entry)) {
          add('JOB_PERMISSION_UNRECOGNIZED', `job "${jobId}" grants unrecognized permission "${entry}"; extend the audit allowlist deliberately if this is intended`)
        }
      }
    }

    // pull_request_target is the one trigger that gets a write-capable token
    // for the base branch: it must never act on the pull request head.
    if (triggers.includes('pull_request_target')) {
      for (const raw of jobBlock.lines) {
        const line = stripComments(raw).trim()
        if (/^(ref|repository):\s*.*\$\{\{.*pull_request\.head/.test(line)) {
          add('PR_TARGET_HEAD_CHECKOUT', `job "${jobId}" resolves ${line.split(':')[0]} from pull_request.head; pull_request_target workflows must only use the trusted base commit`)
        }
      }
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

function auditBranchPolicy(blocks, fileName) {
  const violations = []
  const add = (code, message) => violations.push({ file: fileName, code, message })

  const jobs = subBlocks(blocks.get('jobs')?.lines ?? [], 2)
  const policy = jobs.get('branch-policy')
  if (!policy) {
    add('BRANCH_POLICY_JOB_MISSING', 'ci.yml has no "branch-policy" job; promotion from dev to main is no longer enforced in CI')
    return violations
  }
  const flat = policy.lines.map(stripComments).join('\n')
  if (!flat.includes("github.base_ref == 'main'")) {
    add('BRANCH_POLICY_NOT_GATED', 'branch-policy job no longer gates on github.base_ref == main')
  }
  for (const required of [
    '[[ "$BASE_REF" == "main" ]]',
    '[[ "$HEAD_REF" != "dev" || "$HEAD_REPOSITORY" != "$BASE_REPOSITORY" ]]',
    'exit 1',
  ]) {
    if (!flat.includes(required)) {
      add('BRANCH_POLICY_WEAKENED', `branch-policy enforcement is missing the required condition: ${required}`)
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
