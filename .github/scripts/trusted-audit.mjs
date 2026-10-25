// Trusted-base governance audit (R5-B).
//
// Runs ONLY code from the protected base checkout (this file is executed from
// the base.sha worktree by governance-trusted.yml). Candidate changes are
// accepted strictly as DATA: the candidate pull request's .github/workflows
// files are downloaded at the PR head SHA and audited with the base
// validator. Candidate scripts, dependencies and the PR HEAD itself are never
// executed, installed or checked out.
//
// Provenance binding: repository, PR number, base SHA, head SHA (resolved
// from the PR number via the API — no head input interpolation), and the
// SHA-256 of the base validator sources are printed with every verdict.
//
// Usage: node .github/scripts/trusted-audit.mjs [--publish-only]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { auditRepository, formatViolations } from '../tests/lib/audit-governance.mjs'

const repo = process.env.GITHUB_REPOSITORY
const prNumber = process.env.PR_NUMBER
const publishOnly = process.argv.includes('--publish-only')
const publishMarker = '<!-- symgene-trusted-governance -->'

function gh(args, opts = {}) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
}

if (!repo || !prNumber) {
  console.error('trusted-audit: GITHUB_REPOSITORY/PR_NUMBER missing')
  process.exit(70)
}

// 1. Bind identities: PR number -> base/head SHAs and the target branch,
//    resolved from the API (trusted inputs only).
const pr = JSON.parse(gh(['api', `repos/${repo}/pulls/${prNumber}`]))
const baseSha = pr.base.sha
const headSha = pr.head.sha
const baseRef = pr.base.ref
const validatorHash = sha256File(fileURLToPath(import.meta.url)) + ' ' + sha256File(new URL('../tests/lib/audit-governance.mjs', import.meta.url).pathname) + ' ' + sha256File(new URL('../tests/lib/mini-yaml.mjs', import.meta.url).pathname)

console.log('=== trusted governance audit ===')
console.log(`repository:      ${repo}`)
console.log(`pull request:    #${prNumber} (${pr.head.ref} -> ${baseRef})`)
console.log(`base sha:        ${baseSha}`)
console.log(`head sha:        ${headSha}`)
console.log(`validator sha256: ${validatorHash}`)

// 2. Candidate workflow files as DATA (contents API at the head SHA).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trusted-audit-'))
let files = []
try {
  const listing = JSON.parse(gh(['api', `repos/${repo}/contents/.github/workflows?ref=${headSha}`]))
  for (const entry of listing) {
    if (!/\.ya?ml$/.test(entry.name)) continue
    const raw = JSON.parse(gh(['api', `repos/${repo}/contents/${entry.path}?ref=${headSha}`], { maxBuffer: 32 * 1024 * 1024 }))
    const text = Buffer.from(raw.content, 'base64').toString('utf8')
    fs.writeFileSync(path.join(tmp, entry.name), text)
    files.push({ path: `.github/workflows/${entry.name}`, text })
  }
  const codeownersPath = path.join(tmp, 'CODEOWNERS')
  try {
    const co = JSON.parse(gh(['api', `repos/${repo}/contents/.github/CODEOWNERS?ref=${headSha}`]))
    fs.writeFileSync(codeownersPath, Buffer.from(co.content, 'base64').toString('utf8'))
    files.push({ path: '.github/CODEOWNERS', text: fs.readFileSync(codeownersPath, 'utf8') })
  } catch {
    files.push({ path: '.github/CODEOWNERS', text: '' })
  }
} catch (e) {
  console.log('VERDICT: BLOCKED — candidate workflow files could not be read as data:', e.message)
  process.exit(70)
}

// 3. Verdict from the BASE validator over the candidate data.
const violations = auditRepository(files)
console.log(formatViolations(violations))

const blocked = files.length === 0
let verdict
if (blocked) {
  verdict = 'BLOCKED'
} else if (violations.some((v) => !['CHECK_NAME_COLLISION', 'GOVERNANCE_JOB_MISSING'].includes(v.code))) {
  verdict = 'FAIL'
} else {
  // Pre-declared residuals (known integration deltas) are reported, not
  // silently accepted; everything else must be clean.
  verdict = violations.length === 0 ? 'PASS' : 'PASS-WITH-DECLARED-RESIDUALS'
}
console.log(`VERDICT: ${verdict}`)

const report = `${publishMarker}
## Governance (trusted base)

受信基准校验器(运行于 base \`${baseSha.slice(0, 12)}\`)对候选 #${prNumber} 的 \`.github/workflows\` 以数据形式执行的独立审计:

- **裁决:${verdict}**
- 校验器 sha256:\`${validatorHash.split(' ')[0]}…\`
- 候选 head SHA:\`${headSha}\`

<details><summary>违规明细</summary>

\`\`\`
${formatViolations(violations)}
\`\`\`
</details>

_此评论由受信基准工作流自动维护;候选分支无法修改其校验逻辑。_
`

if (publishOnly) {
  try {
    const comments = JSON.parse(gh(['api', `repos/${repo}/issues/${prNumber}/comments?per_page=100`]))
    const previous = comments.find((c) => c.user && c.body && c.body.includes(publishMarker))
    if (previous) {
      gh(['api', `-X`, `PATCH`, `repos/${repo}/issues/${prNumber}/comments/${previous.id}`, `-f`, `body=${report}`])
    } else {
      gh(['api', `-X`, `POST`, `repos/${repo}/issues/${prNumber}/comments`, `-f`, `body=${report}`])
    }
    console.log('published the trusted verdict comment')
  } catch (e) {
    console.error('publishing failed:', e.message)
    process.exit(70)
  }
  process.exit(0)
}

process.exit(verdict === 'FAIL' || verdict === 'BLOCKED' ? 1 : 0)
