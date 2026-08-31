import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPORT_MARKER = '<!-- symgene-promotion-pr-policy -->'

const REQUIRED_SECTIONS = [
  '晋级摘要',
  '包含的变更',
  '验证',
  '风险与回滚',
  '合并要求',
]

function isValidCalendarDate(value) {
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

function sectionContents(body) {
  const headings = [...body.matchAll(/^##\s+(.+?)\s*$/gm)]
  const sections = new Map()

  headings.forEach((heading, index) => {
    const start = heading.index + heading[0].length
    const end = headings[index + 1]?.index ?? body.length
    sections.set(heading[1].trim(), body.slice(start, end).trim())
  })

  return sections
}

function hasSubstantiveContent(content) {
  const withoutComments = content.replace(/<!--[\s\S]*?-->/g, '')
  const withoutTaskMarkers = withoutComments.replace(/^\s*[-*]\s+\[[ xX]\]\s*/gm, '')
  return /[\p{L}\p{N}\p{Script=Han}]/u.test(withoutTaskMarkers)
}

export function validatePromotionPr(payload) {
  const pullRequest = payload?.pull_request
  const errors = []

  if (!pullRequest) {
    return {
      author: 'pull-request-author',
      errors: ['事件载荷中缺少 pull_request 数据。'],
      valid: false,
    }
  }

  const author = pullRequest.user?.login || 'pull-request-author'
  const baseRef = pullRequest.base?.ref
  const headRef = pullRequest.head?.ref
  const baseRepository = pullRequest.base?.repo?.full_name
  const headRepository = pullRequest.head?.repo?.full_name

  if (baseRef !== 'main') {
    errors.push(`base 必须是 \`main\`，当前为 \`${baseRef || 'unknown'}\`。`)
  }

  if (headRef !== 'dev' || !baseRepository || headRepository !== baseRepository) {
    errors.push(
      `head 必须是同仓库的 \`dev\`；当前为 \`${headRepository || 'unknown'}:${headRef || 'unknown'}\`。`,
    )
  }

  const title = pullRequest.title?.trim() || ''
  const titleMatch = title.match(/^release: promote dev to main \((\d{4}-\d{2}-\d{2})\)$/)
  if (!titleMatch || !isValidCalendarDate(titleMatch[1])) {
    errors.push('标题必须使用 `release: promote dev to main (YYYY-MM-DD)`，并包含有效日期。')
  }

  const body = pullRequest.body || ''
  const sections = sectionContents(body)

  for (const section of REQUIRED_SECTIONS) {
    const content = sections.get(section)
    if (!content) {
      errors.push(`正文缺少 \`## ${section}\`。`)
    } else if (!hasSubstantiveContent(content)) {
      errors.push(`\`## ${section}\` 尚未填写实际内容。`)
    }
  }

  if (/<!--[\s\S]*?-->/.test(body)) {
    errors.push('正文仍包含未删除的 HTML 模板提示。')
  }

  if (/^\s*[-*]\s+\[\s\]/m.test(body)) {
    errors.push('正文仍包含未确认的复选框。')
  }

  return { author, errors, valid: errors.length === 0 }
}

export function renderPromotionReport(result) {
  const mention = `@${result.author}`

  if (result.valid) {
    return `${REPORT_MARKER}
## Promotion PR policy

${mention}，晋级 PR 的来源分支、标题和正文均符合当前规范。

- ✅ 同仓库 \`dev → main\`
- ✅ 标准晋级标题
- ✅ 所有必需章节已填写，且没有残留模板提示或未确认复选框

Copilot review 仅提供建议；合并仍需要 \`@miracleqihe\` 的人工批准，并使用 **Create a merge commit**。

_此评论由工作流自动维护，请勿手动编辑。_`
  }

  const items = result.errors.map((error) => `- ${error}`).join('\n')
  return `${REPORT_MARKER}
## Promotion PR policy

${mention}，这个晋级 PR 尚未满足合并规范：

${items}

请修改 PR 标题或正文；工作流会在更新后重新检查并覆盖这条评论。

_此评论由工作流自动维护，请勿手动编辑。_`
}

function runCli() {
  const eventPath = process.env.GITHUB_EVENT_PATH || process.argv[2]
  const reportPath = process.env.REPORT_PATH || process.argv[3] || 'promotion-pr-policy.md'

  if (!eventPath) {
    console.error('GITHUB_EVENT_PATH or an event file argument is required.')
    process.exitCode = 2
    return
  }

  const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
  const result = validatePromotionPr(payload)
  const report = renderPromotionReport(result)

  fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true })
  fs.writeFileSync(reportPath, `${report}\n`)

  for (const error of result.errors) {
    console.error(`::error title=Promotion PR policy::${error}`)
  }

  if (!result.valid) {
    process.exitCode = 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli()
}
