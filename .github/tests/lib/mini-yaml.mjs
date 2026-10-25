// Structured YAML parser for the declared workflow subset (R5-A).
//
// Supports: block maps, block sequences (items at deeper or equal indent,
// including `- key: value` maps), plain / single-quoted / double-quoted
// scalars, flow sequences and maps on one line, block scalars (`|`/`>` with
// `+`/`-` chomping and indentation indicators), comments outside quotes.
// Sequence items are parsed by replacing the `- ` marker with two spaces
// (column-preserving) and recursing over a sub-reader, so nested block
// scalars are handled by the same code path.
//
// Everything outside the subset throws YamlParseError with a line number:
// anchors (&x), aliases (*x), multi-document streams, tabs in indentation,
// duplicate keys inside one mapping. Callers must treat a parse error as a
// violation (fail closed) — an unparseable workflow is never "zero
// violations".

export class YamlParseError extends Error {}

const BLOCK_HEADER = /^[|>](?:[+-]?[0-9]?|[0-9][+-]?)?$/

function stripComment(line) {
  let q = null
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (q === '"' && ch === '\\') { i++; continue }
      if (ch === q) q = null
      continue
    }
    if (ch === '"' || ch === "'") { q = ch; continue }
    if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i)
  }
  return line
}

function splitFlow(body) {
  const parts = []
  let depth = 0
  let q = null
  let cur = ''
  for (const ch of body) {
    if (q) { cur += ch; if (ch === q) q = null; continue }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue }
    if (ch === '{' || ch === '[') { depth++; cur += ch; continue }
    if (ch === '}' || ch === ']') { depth--; cur += ch; continue }
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) parts.push(cur)
  return parts.map((p) => p.trim()).filter(Boolean)
}

function unquote(s) {
  const t = s.trim()
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'")
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1)
  return t
}

function parseFlowScalar(s) {
  const t = s.trim()
  if (t.startsWith('[') && t.endsWith(']')) {
    return { kind: 'seq', flow: true, items: splitFlow(t.slice(1, -1)).map((x) => parseFlowScalar(x)) }
  }
  if (t.startsWith('{') && t.endsWith('}')) {
    const entries = []
    for (const part of splitFlow(t.slice(1, -1))) {
      const m = part.match(/^([^:]+):\s*(.*)$/)
      if (!m) throw new YamlParseError(`unparseable flow mapping entry: ${part}`)
      entries.push([unquote(m[1]), parseFlowScalar(m[2])])
    }
    return { kind: 'map', flow: true, entries }
  }
  return unquote(t)
}

function applyChomping(text, chomp) {
  if (chomp === '-') return text.replace(/\n+$/, '')
  if (chomp === '+') return text
  return text.replace(/\n*$/, '\n')
}

// A reader over one logical document (real lines). Nested sequence items get
// their own reader over a column-aligned virtual document.
function makeReader(rawLines) {
  function readBlock(i, indent) {
    while (i < rawLines.length && !stripComment(rawLines[i]).trim()) i++
    if (i >= rawLines.length) return { node: null, i }
    const line = stripComment(rawLines[i])
    const li = line.length - line.trimStart().length
    if (li < indent) return { node: null, i }
    if (/^-($|\s)/.test(line.slice(li))) return readSeq(i, li)
    if (/^("[^"]+"|[A-Za-z_][A-Za-z0-9_-]*):(\s|$)/.test(line.slice(li))) return readMap(i, li)
    throw new YamlParseError(`unsupported structure at line ${i + 1}: ${line.trim().slice(0, 60)}`)
  }

  function readMap(i, indent, firstInline) {
    const entries = []
    const seen = new Set()
    let pendingFirst = firstInline !== undefined
    let synthetic = pendingFirst
    while (true) {
      let line
      let li
      if (synthetic) {
        line = ' '.repeat(indent) + firstInline
        li = indent
      } else {
        if (i >= rawLines.length) break
        if (!stripComment(rawLines[i]).trim()) { i++; continue }
        line = stripComment(rawLines[i])
        li = line.length - line.trimStart().length
        if (li < indent) break
        if (li > indent) throw new YamlParseError(`unexpected indentation at line ${i + 1}`)
        i++
      }
      const m = line.slice(li).match(/^("[^"]+"|[A-Za-z_][A-Za-z0-9_-]*):(?:\s*(.*))?$/)
      if (!m) throw new YamlParseError(`unsupported mapping line at line ${i + 1}: ${line.trim().slice(0, 60)}`)
      const key = unquote(m[1])
      if (seen.has(key)) throw new YamlParseError(`duplicate key "${key}" at line ${i + 1}`)
      seen.add(key)
      const inline = (m[2] ?? '').trim()
      if (inline === '') {
        // nested block at a deeper indent, or a sequence at this indent
        let j = i
        while (j < rawLines.length && !stripComment(rawLines[j]).trim()) j++
        if (j < rawLines.length) {
          const nl = stripComment(rawLines[j])
          const nli = nl.length - nl.trimStart().length
          if (nli > indent) {
            const r = readBlock(j, nli)
            entries.push([key, r.node])
            i = r.i
            if (synthetic) break
            continue
          }
          if (nli === indent && /^-($|\s)/.test(nl.slice(nli))) {
            const r = readSeq(j, nli)
            entries.push([key, r.node])
            i = r.i
            if (synthetic) break
            continue
          }
        }
        entries.push([key, null])
        if (synthetic) break
        continue
      }
      if (/^[|>]/.test(inline)) {
        if (!BLOCK_HEADER.test(inline)) throw new YamlParseError(`unrecognized block scalar header "${inline}" at line ${i + 1}`)
        const body = []
        let j = synthetic ? i + 1 : i // synthetic: i still points at the header line
        let contentIndent = null
        if (/^[|>][0-9]/.test(inline)) contentIndent = indent + parseInt(inline[1], 10)
        while (j < rawLines.length) {
          const l = rawLines[j]
          if (!l.trim()) { body.push(''); j++; continue }
          const lli = l.length - l.trimStart().length
          if (contentIndent === null) {
            if (lli <= indent) break
            contentIndent = lli
          }
          if (lli < contentIndent) break
          body.push(l.slice(contentIndent))
          j++
        }
        const chomp = inline.includes('-') ? '-' : inline.includes('+') ? '+' : ''
        const folded = inline[0] === '>'
        let text = body.join(folded ? ' ' : '\n')
        text = applyChomping(text, chomp)
        entries.push([key, { kind: 'block', text, style: inline }])
        i = j
        if (synthetic) break
        continue
      }
      entries.push([key, inline.startsWith('[') || inline.startsWith('{') ? parseFlowScalar(inline) : unquote(inline)])
      if (synthetic) break
    }
    return { node: { kind: 'map', entries }, i }
  }

  function readSeq(i, indent) {
    const items = []
    while (true) {
      if (i >= rawLines.length) break
      if (!stripComment(rawLines[i]).trim()) { i++; continue }
      const line = stripComment(rawLines[i])
      const li = line.length - line.trimStart().length
      if (li < indent) break
      if (li > indent) throw new YamlParseError(`unexpected indentation in sequence at line ${i + 1}`)
      if (!/^-($|\s)/.test(line.slice(li))) break
      const rest = line.slice(li + 2)
      // item extent: until the next `- ` at this indent or a shallower line
      let j = i + 1
      while (j < rawLines.length) {
        if (!stripComment(rawLines[j]).trim()) { j++; continue }
        const l2 = stripComment(rawLines[j])
        const l2i = l2.length - l2.trimStart().length
        if (l2i < indent) break
        if (l2i === indent && /^-($|\s)/.test(l2.slice(l2i))) break
        if (l2i > indent) { j++; continue }
        throw new YamlParseError(`unexpected structure in sequence at line ${j + 1}`)
      }
      const itemRaw = rawLines.slice(i, j)
      if (rest.trim() === '') {
        const sub = makeReader(itemRaw.slice(1))
        const r = sub.readBlock(0, indent + 1)
        items.push(r.node)
        i = j
        continue
      }
      const km = rest.trim().match(/^("[^"]+"|[A-Za-z_][A-Za-z0-9_-]*):(?:\s*(.*))?$/)
      if (km && !/^[[{]/.test(rest.trim())) {
        // column-preserving virtual document: `- ` becomes two spaces
        const virtual = itemRaw.map((l, idx) => (idx === 0 ? ' '.repeat(indent + 2) + rest : l))
        const sub = makeReader(virtual)
        const r = sub.readBlock(0, indent + 2)
        items.push(r.node)
        i = j
        continue
      }
      const trimmed = rest.trim()
      if (/^[|>]/.test(trimmed)) throw new YamlParseError(`block scalar header in a bare sequence item is not supported at line ${i + 1}`)
      items.push(trimmed.startsWith('[') || trimmed.startsWith('{') ? parseFlowScalar(trimmed) : unquote(trimmed))
      i = j
    }
    return { node: { kind: 'seq', items }, i }
  }

  return { readBlock }
}

export function parseYaml(text) {
  if (/^---\s*$/m.test(text) || /^\.\.\.\s*$/m.test(text)) throw new YamlParseError('multi-document streams are not supported')
  const rawLines = text.split('\n')
  for (const [i, l] of rawLines.entries()) {
    if (/^\t/.test(l)) throw new YamlParseError(`tab indentation at line ${i + 1}`)
    if (/(^|\s)&[A-Za-z0-9_-]/.test(l)) throw new YamlParseError(`YAML anchor at line ${i + 1}`)
    if (/(^|\s)[\[{,:-]\*[A-Za-z0-9_-]/.test(l)) throw new YamlParseError(`YAML alias at line ${i + 1}`)
  }
  const r = makeReader(rawLines).readBlock(0, 0)
  return r.node
}

// ---- accessors over the parsed tree ----------------------------------------

export function mapGet(node, key) {
  if (!node || node.kind !== 'map') return undefined
  const e = node.entries.find(([k]) => k === key)
  return e ? e[1] : undefined
}

export function asString(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v
  if (v && v.kind === 'block') return v.text
  return null
}

// Job-level view used by the governance contracts.
export function workflowJobs(tree) {
  const jobs = mapGet(tree, 'jobs')
  if (!jobs || jobs.kind !== 'map') return new Map()
  const out = new Map()
  for (const [id, node] of jobs.entries) {
    if (!node || node.kind !== 'map' || node.flow) { out.set(id, { raw: node, node, steps: [], flow: !!(node && node.flow) }); continue }
    const stepsNode = mapGet(node, 'steps')
    const steps = []
    if (stepsNode && stepsNode.kind === 'seq' && !stepsNode.flow) {
      for (const item of stepsNode.items) {
        if (item && item.kind === 'map') {
          steps.push({
            name: asString(mapGet(item, 'name')),
            if: asString(mapGet(item, 'if')),
            continueOnError: asString(mapGet(item, 'continue-on-error')),
            env: mapGet(item, 'env'),
            run: asString(mapGet(item, 'run')),
            node: item,
          })
        }
      }
    }
    out.set(id, {
      node,
      flow: !!node.flow,
      if: asString(mapGet(node, 'if')),
      permissions: mapGet(node, 'permissions'),
      needs: mapGet(node, 'needs'),
      environment: mapGet(node, 'environment'),
      steps,
    })
  }
  return out
}
