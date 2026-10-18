// Pure helpers: read and edit a PROGRESS.md without touching anything else in it.

export type Status = 'todo' | 'doing' | 'done'
export type Step = { line: number; status: Status; text: string }
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
  lines.forEach((l, i) => {
    if (stop !== -1 && i >= stop) return
    const m = STEP.exec(l)
    if (m) steps.push({ line: i, status: statusOf(m[2]!), text: m[3]!.trim() })
  })
  return { lines, eol, name, steps }
}

export const summarize = (doc: Doc): Summary => {
  const done = doc.steps.filter(s => s.status === 'done').length
  const current = doc.steps.find(s => s.status === 'doing')
  const next = doc.steps.find(s => s.status === 'todo')
  return {
    name: doc.name,
    done,
    total: doc.steps.length,
    current: current ? current.text : null,
    next: next ? next.text : null,
  }
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

const done = (doc: Doc, lines: string[]): string => refreshLines(lines).join(doc.eol)

const stepAt = (doc: Doc, n: number): Step => {
  const step = doc.steps[n - 1]
  if (!Number.isInteger(n) || !step) {
    throw new Error(`There is no step ${n}. Steps go from 1 to ${doc.steps.length}.`)
  }
  return step
}

const stepLine = (prefix: string, status: Status, text: string) =>
  `${prefix}[${MARK[status]}] ${text}`

// Only one step is in progress at a time: starting one sends any other back to to-do.
export const setStatus = (doc: Doc, n: number, status: Status): string => {
  const step = stepAt(doc, n)
  const lines = [...doc.lines]
  if (status === 'doing') {
    for (const other of doc.steps) {
      if (other === step || other.status !== 'doing') continue
      const prefix = STEP.exec(lines[other.line]!)![1]!
      lines[other.line] = stepLine(prefix, 'todo', other.text)
    }
  }
  const m = STEP.exec(lines[step.line]!)!
  lines[step.line] = stepLine(m[1]!, status, m[3]!)
  return done(doc, lines)
}

export const rename = (doc: Doc, n: number, text: string): string => {
  const step = stepAt(doc, n)
  const lines = [...doc.lines]
  const m = STEP.exec(lines[step.line]!)!
  lines[step.line] = stepLine(m[1]!, statusOf(m[2]!), text)
  return done(doc, lines)
}

export const add = (doc: Doc, text: string): string => {
  const lines = [...doc.lines]
  const last = doc.steps[doc.steps.length - 1]
  if (last) {
    const prefix = STEP.exec(lines[last.line]!)![1]!
    lines.splice(last.line + 1, 0, stepLine(prefix, 'todo', text))
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

export const remove = (doc: Doc, n: number): string => {
  const step = stepAt(doc, n)
  const lines = [...doc.lines]
  lines.splice(step.line, 1)
  return done(doc, lines)
}

// Moves the step out of the checklist into "## Out of scope", so the decision stays on record.
export const drop = (doc: Doc, n: number, date: string): string => {
  const step = stepAt(doc, n)
  const lines = [...doc.lines]
  lines.splice(step.line, 1)
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
  lines.splice(at, 0, `- ${step.text} (dropped ${date})`)
  return done(doc, lines)
}

// Reorders the checklist: step n goes to position `to`; other lines stay where they are.
export const move = (doc: Doc, n: number, to: number): string => {
  stepAt(doc, n)
  stepAt(doc, to)
  const lines = [...doc.lines]
  const texts = doc.steps.map(s => lines[s.line]!)
  const [moved] = texts.splice(n - 1, 1)
  texts.splice(to - 1, 0, moved!)
  doc.steps.forEach((s, i) => (lines[s.line] = texts[i]!))
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
  const rows = doc.steps.map((st, i) => `${String(i + 1).padStart(2)}. ${icon[st.status]} ${st.text}`)
  return [
    `${s.name}  ${bar(s.done, s.total)} ${s.done}/${s.total}`,
    ...(rows.length ? rows : ['   (no steps yet: /todo add <text>)']),
    ...(dropped ? [`   Out of scope: ${dropped} item${dropped === 1 ? '' : 's'}`] : []),
  ].join('\n')
}
