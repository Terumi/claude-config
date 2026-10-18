// Pure helpers: read and edit a PROGRESS.md without touching anything else in it.
// A to-do is a top-level checklist row; its sub-steps are indented rows under it.

export type Status = 'todo' | 'doing' | 'done'
// parent: index in doc.steps of the to-do this row belongs to; null for a to-do itself.
export type Step = { line: number; status: Status; text: string; prefix: string; parent: number | null }
export type Doc = { lines: string[]; eol: string; name: string; steps: Step[] }
export type Summary = {
  name: string
  done: number
  total: number
  current: string | null
  next: string | null
}

const STEP = /^(\s*[-*]\s+)\[( |x|X|~)\]\s+(.*)$/
const OUT_OF_SCOPE = /^#{1,6}\s+out of scope\b/i
const HEADING = /^#{1,6}\s+/
const MARK: Record<Status, string> = { todo: ' ', doing: '~', done: 'x' }
const SUB_PREFIX = '  - '

const statusOf = (mark: string): Status =>
  mark === '~' ? 'doing' : mark === ' ' ? 'todo' : 'done'

const outOfScopeLine = (lines: string[]) => lines.findIndex(l => OUT_OF_SCOPE.test(l))

export const parse = (text: string, fallbackName: string): Doc => {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const title = lines.find(l => /^#\s+\S/.test(l))
  const name = title ? title.replace(/^#\s+/, '').trim() : fallbackName
  const stop = outOfScopeLine(lines)
  const steps: Step[] = []
  let lastTodo = -1
  lines.forEach((l, i) => {
    if (stop !== -1 && i >= stop) return
    const m = STEP.exec(l)
    if (!m) return
    const prefix = m[1]!
    // An indented row right after a to-do is one of its sub-steps.
    const parent = /^\s/.test(prefix) && lastTodo !== -1 ? lastTodo : null
    if (parent === null) lastTodo = steps.length
    steps.push({ line: i, status: statusOf(m[2]!), text: m[3]!.trim(), prefix, parent })
  })
  return { lines, eol, name, steps }
}

export const topLevel = (doc: Doc): number[] =>
  doc.steps.flatMap((s, i) => (s.parent === null ? [i] : []))

export const childrenOf = (doc: Doc, i: number): number[] =>
  doc.steps.flatMap((s, j) => (s.parent === i ? [j] : []))

const hasChildren = (doc: Doc, i: number) => doc.steps.some(s => s.parent === i)

// The last line a to-do takes up: its own row, or its last sub-step.
const blockEnd = (doc: Doc, i: number): number =>
  Math.max(doc.steps[i]!.line, ...childrenOf(doc, i).map(j => doc.steps[j]!.line))

// "3" is the third to-do; "3.2" is its second sub-step. Returns the index in doc.steps.
export const resolve = (doc: Doc, ref: string): number => {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(ref.trim())
  if (!m) throw new Error(`"${ref}" is not a step number. Use 3 for a to-do, or 3.2 for its sub-step.`)
  const tops = topLevel(doc)
  const t = Number(m[1])
  if (t < 1 || t > tops.length) {
    throw new Error(`There is no step ${ref}. Steps go from 1 to ${tops.length}.`)
  }
  const i = tops[t - 1]!
  if (m[2] === undefined) return i
  const kids = childrenOf(doc, i)
  const k = Number(m[2])
  if (k < 1 || k > kids.length) {
    throw new Error(`There is no sub-step ${ref}. Step ${t} has ${kids.length} sub-step${kids.length === 1 ? '' : 's'}.`)
  }
  return kids[k - 1]!
}

// Leaves are the rows that get counted: to-dos without sub-steps, and every sub-step.
export const summarize = (doc: Doc): Summary => {
  const leaves = doc.steps.filter((_, i) => !hasChildren(doc, i))
  const done = leaves.filter(s => s.status === 'done').length
  const current = leaves.find(s => s.status === 'doing')
  const next = leaves.find(s => s.status === 'todo')
  return {
    name: doc.name,
    done,
    total: leaves.length,
    current: current ? current.text : null,
    next: next ? next.text : null,
  }
}

// A to-do with sub-steps shows done when they all are, in progress when one is.
const syncParents = (lines: string[]): string[] => {
  const d = parse(lines.join('\n'), '')
  const out = [...lines]
  d.steps.forEach((s, i) => {
    if (s.parent !== null || !hasChildren(d, i)) return
    const kids = d.steps.filter(k => k.parent === i)
    const status: Status = kids.every(k => k.status === 'done')
      ? 'done'
      : kids.some(k => k.status === 'doing')
        ? 'doing'
        : 'todo'
    out[s.line] = stepLine(s.prefix, status, s.text)
  })
  return out
}

// Keeps the "Progress: X/Y" and "Next step:" lines in step with the checklist.
// "Next step" names the step being worked on, or the next to-do when none is in progress.
const refreshLines = (lines: string[]): string[] => {
  const doc = parse(lines.join('\n'), '')
  const s = summarize(doc)
  return lines.map(l => {
    if (/^\s*[-*]?\s*\**progress\**\s*:/i.test(l)) return l.replace(/\d+\s*\/\s*\d+/, `${s.done}/${s.total}`)
    const m = /^(\s*[-*]?\s*\**next step\**\s*:\s*\**\s*)/i.exec(l)
    if (m) return m[1] + (s.current ?? s.next ?? 'all steps done')
    return l
  })
}

const done = (doc: Doc, lines: string[]): string => refreshLines(syncParents(lines)).join(doc.eol)

const stepLine = (prefix: string, status: Status, text: string) =>
  `${prefix}[${MARK[status]}] ${text}`

const put = (lines: string[], s: Step, status: Status, text = s.text) => {
  lines[s.line] = stepLine(s.prefix, status, text)
}

// Only one step is in progress at a time: starting one sends any other back to to-do.
export const setStatus = (doc: Doc, ref: string, status: Status): string => {
  const i = resolve(doc, ref)
  const kids = childrenOf(doc, i)
  if (kids.length && status === 'doing') {
    throw new Error(`Step ${ref} has sub-steps. Start one of them instead, e.g. ${ref}.1`)
  }
  const lines = [...doc.lines]
  if (status === 'doing') {
    doc.steps.forEach((s, j) => {
      if (j !== i && s.status === 'doing' && !hasChildren(doc, j)) put(lines, s, 'todo')
    })
  }
  put(lines, doc.steps[i]!, status)
  kids.forEach(j => put(lines, doc.steps[j]!, status))
  return done(doc, lines)
}

export const rename = (doc: Doc, ref: string, text: string): string => {
  const s = doc.steps[resolve(doc, ref)]!
  const lines = [...doc.lines]
  put(lines, s, s.status, text)
  return done(doc, lines)
}

export const add = (doc: Doc, text: string): string => {
  const lines = [...doc.lines]
  const tops = topLevel(doc)
  const last = tops[tops.length - 1]
  if (last !== undefined) {
    lines.splice(blockEnd(doc, last) + 1, 0, stepLine(doc.steps[last]!.prefix, 'todo', text))
    return done(doc, lines)
  }
  const stepsHeading = lines.findIndex(l => /^#{1,6}\s+steps\b/i.test(l))
  if (stepsHeading !== -1) {
    lines.splice(stepsHeading + 1, 0, stepLine('- ', 'todo', text))
    return done(doc, lines)
  }
  const out = outOfScopeLine(lines)
  const at = out === -1 ? lines.length : out
  lines.splice(at, 0, '## Steps', stepLine('- ', 'todo', text), '')
  return done(doc, lines)
}

// Removes a to-do with its sub-steps, or a single sub-step.
const cut = (doc: Doc, i: number): string[] => {
  const s = doc.steps[i]!
  const end = s.parent === null ? blockEnd(doc, i) : s.line
  const lines = [...doc.lines]
  lines.splice(s.line, end - s.line + 1)
  return lines
}

export const remove = (doc: Doc, ref: string): string => done(doc, cut(doc, resolve(doc, ref)))

// Moves the step out of the checklist into "## Out of scope", so the decision stays on record.
export const drop = (doc: Doc, ref: string, date: string): string => {
  const i = resolve(doc, ref)
  const text = doc.steps[i]!.text
  const lines = cut(doc, i)
  let out = outOfScopeLine(lines)
  if (out === -1) {
    while (lines.length && lines[lines.length - 1]!.trim() === '') lines.pop()
    lines.push('', '## Out of scope')
    out = lines.length - 1
  }
  let end = out + 1
  while (end < lines.length && !HEADING.test(lines[end]!)) end++
  let at = end
  while (at > out + 1 && lines[at - 1]!.trim() === '') at--
  lines.splice(at, 0, `- ${text} (dropped ${date})`)
  return done(doc, lines)
}

// Moves a to-do, with its sub-steps, to position `to` among the to-dos.
// Blank lines between to-dos stay where they are.
export const move = (doc: Doc, ref: string, to: number): string => {
  const i = resolve(doc, ref)
  if (doc.steps[i]!.parent !== null) throw new Error('Only a to-do can be moved, not a sub-step.')
  const tops = topLevel(doc)
  if (!Number.isInteger(to) || to < 1 || to > tops.length) {
    throw new Error(`There is no position ${to}. Steps go from 1 to ${tops.length}.`)
  }
  const starts = tops.map(t => doc.steps[t]!.line)
  const ends = tops.map(t => blockEnd(doc, t))
  const blocks = tops.map((_, k) => doc.lines.slice(starts[k], ends[k]! + 1))
  const gaps = tops.map((_, k) => (k < tops.length - 1 ? doc.lines.slice(ends[k]! + 1, starts[k + 1]) : []))
  const [moved] = blocks.splice(tops.indexOf(i), 1)
  blocks.splice(to - 1, 0, moved!)
  const region = blocks.flatMap((b, k) => [...b, ...gaps[k]!])
  const last = ends[ends.length - 1]!
  return done(doc, [...doc.lines.slice(0, starts[0]), ...region, ...doc.lines.slice(last + 1)])
}

// Replaces the sub-steps of to-do i with `texts`, all to do.
export const setChildren = (doc: Doc, i: number, texts: string[]): string => {
  const parent = doc.steps[i]!
  const lines = [...doc.lines]
  const block = texts.map(t => stepLine(SUB_PREFIX, 'todo', t))
  lines.splice(parent.line + 1, blockEnd(doc, i) - parent.line, ...block)
  return done(doc, lines)
}

export const bar = (doneCount: number, total: number, width = 10): string => {
  const filled = total === 0 ? 0 : Math.round((doneCount / total) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const listing = (doc: Doc): string => {
  const s = summarize(doc)
  const out = outOfScopeLine(doc.lines)
  const dropped =
    out === -1 ? 0 : doc.lines.slice(out + 1).filter(l => /^\s*[-*]\s+/.test(l)).length
  const icon: Record<Status, string> = { done: '[x]', doing: '[~]', todo: '[ ]' }
  const rows: string[] = []
  let pos = 0
  let sub = 0
  doc.steps.forEach((st, i) => {
    if (st.parent === null) {
      pos++
      sub = 0
      rows.push(`${String(pos).padStart(2)}. ${icon[st.status]} ${st.text}`)
      if (hasChildren(doc, i)) rows.push(`      ${'─'.repeat(24)}`)
    } else {
      sub++
      rows.push(`     ${pos}.${sub} ${icon[st.status]} ${st.text}`)
    }
  })
  return [
    `${s.name}  ${bar(s.done, s.total)} ${s.done}/${s.total}`,
    ...(rows.length ? rows : ['   (no steps yet: /todo add <text>)']),
    ...(dropped ? [`   Out of scope: ${dropped} item${dropped === 1 ? '' : 's'}`] : []),
  ].join('\n')
}
