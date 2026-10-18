import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { ProgressSummary, Proposal } from '../types'
import * as P from './progress'

const FILE = 'PROGRESS.md'
const summary = atom({ plugin: 'project-progress', key: 'summary' } as const, null)
const proposal = atom({ plugin: 'project-progress', key: 'proposal' } as const, null)

const SPLIT_RULES =
  'You split one task into the concrete sub-steps needed to finish it. Reply with only a list: one sub-step per line, each starting with "- ", 3 to 8 short items in the order to do them. No introduction, no notes.'

const HELP = [
  'Usage:',
  '  /todo                    show the to-dos and their sub-steps',
  '  /todo add <text>         add a new to-do at the end',
  '  /todo start <n>          make to-do n (or sub-step n.k) the one in progress [~]',
  '  /todo next <n>           same as start',
  '  /todo done <n>           mark it done [x] (a to-do with sub-steps: all of them)',
  '  /todo undo <n>           mark it to do again [ ]',
  '  /todo rename <n> <text>  change the wording of step n',
  '  /todo move <n> <to>      move to-do n (with its sub-steps) to position <to>',
  '  /todo breakdown <n>      Claude proposes sub-steps for to-do n',
  '  /todo accept             write the proposed sub-steps under their to-do',
  '  /todo drop <n>           out of scope: moves it to "Out of scope" (kept on record)',
  '  /todo remove <n>         delete it completely (with its sub-steps)',
].join('\n')

const folderName = async ($: Engine) => {
  const cwd = await $.session.cwd()
  return cwd.split(/[\\/]/).filter(Boolean).pop() ?? 'Project'
}

const load = async ($: Engine): Promise<P.Doc | null> => {
  const text = await $.fs.read(FILE).catch(() => null)
  if (typeof text !== 'string') return null
  return P.parse(text, await folderName($))
}

const refresh = async ($: Engine) => {
  const doc = await load($)
  const next: ProgressSummary | null = doc ? P.summarize(doc) : null
  await update($, summary, () => next)
}

const today = async ($: Engine) => new Date(await $.clock.now()).toISOString().slice(0, 10)

// Claude proposes sub-steps for a to-do; nothing is written until /todo accept.
const breakdown = async ($: Engine, doc: P.Doc, ref: string) => {
  const step = doc.steps[P.resolve(doc, ref)]!
  if (step.parent !== null) return { text: 'Break down a to-do (e.g. /todo breakdown 2), not a sub-step.' }
  const others = P.topLevel(doc).map(j => doc.steps[j]!.text).filter(t => t !== step.text)
  const reply = await $.model.complete({
    model: 'sonnet',
    system: SPLIT_RULES,
    prompt: `Project: ${doc.name}\nTo-do to split: ${step.text}\nOther to-dos in this project, for context only:\n${others.map(t => `- ${t}`).join('\n')}`,
    timeoutMs: 60000,
  })
  if (!reply.isAnswered) return { text: `Claude could not split ${ref} (${reply.reason}). Try again.` }
  const texts = reply.text
    .split(/\r?\n/)
    .flatMap(l => {
      const m = /^\s*(?:[-*]|\d+[.)])\s+(.*\S)\s*$/.exec(l)
      return m ? [m[1]!] : []
    })
    .slice(0, 8)
  if (texts.length === 0) return { text: `Claude gave no sub-steps for ${ref}. Try again.` }
  await update($, proposal, () => ({ ref, parentText: step.text, texts }))
  return {
    text:
      `Proposed sub-steps for ${ref} "${step.text}":\n` +
      texts.map((t, k) => `  ${ref}.${k + 1}  ${t}`).join('\n') +
      `\n\nWrite them with /todo accept, or ask again with /todo breakdown ${ref}.`,
  }
}

const accept = async ($: Engine, doc: P.Doc) => {
  const held: Proposal | null = await read($, proposal)
  if (!held) return { text: 'Nothing is proposed. Run /todo breakdown <n> first.' }
  const i = P.resolve(doc, held.ref)
  if (doc.steps[i]!.text !== held.parentText) {
    return { text: `Step ${held.ref} has changed since it was split. Run /todo breakdown ${held.ref} again.` }
  }
  const text = P.setChildren(doc, i, held.texts)
  await $.fs.write(FILE, text)
  await update($, proposal, () => null)
  const updated = P.parse(text, doc.name)
  await update($, summary, () => P.summarize(updated))
  return {
    text: `Done: added ${held.texts.length} sub-steps under ${held.ref} "${held.parentText}".\n\n${P.listing(updated)}`,
    context: [
      `The person accepted these sub-steps for ${held.ref} in ${FILE}: ${held.texts.join('; ')}. Work through them in order.`,
    ],
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'todo',
      description: "View or edit this project's steps in PROGRESS.md",
      argumentHint: '[add|start|done|undo|rename|move|drop|remove|breakdown|accept] [n] [text]',
    })
    await refresh($)
    return result
  })

  // Claude may have ticked steps during the turn: re-read the file.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  // Tells Claude where the project stands on each request: it reports that on the first
  // reply, and switches the step in progress when the work moves to another to-do.
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    const doc = await load($)
    if (!doc || doc.steps.length === 0) return result
    const s = P.summarize(doc)
    const text = [
      `Project progress (${FILE}):`,
      P.listing(doc),
      `Step in progress: ${s.current ?? 'none (no step is marked [~])'}.`,
      `If the person's work in this conversation is clearly for a different to-do or sub-step than the one marked [~], switch: in ${FILE} mark that one [~] and the old one [ ] (only one [~] at a time), then say so in one line. Don't switch for small side questions. Tick steps [x] in ${FILE} as they finish.`,
      `In your reply to the person's first message of this session, open with a 2-3 line report: where the project stands and what is next.`,
    ].join('\n')
    return { sections: [...result.sections, { id: 'project-progress:status', text, scope: 'session' }] }
  })

  on('command.run', { command: 'todo' }, async ($, e) => {
    const doc = await load($)
    if (!doc) {
      return { text: `No ${FILE} in this folder. Run /setup-project to create one (start Claude in the project's root folder).` }
    }

    const [verb = 'list', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const ref = rest[0] ?? ''
    const tail = rest.slice(1).join(' ').trim()
    const all = rest.join(' ').trim()
    const titleOf = () => doc.steps[P.resolve(doc, ref)]!.text

    let text: string
    let did: string
    try {
      switch (verb.toLowerCase()) {
        case 'list':
        case 'ls':
          return { text: P.listing(doc) }
        case 'help':
          return { text: HELP }
        case 'breakdown':
          return await breakdown($, doc, ref)
        case 'accept':
          return await accept($, doc)
        case 'add':
          if (!all) throw new Error('Write the step after "add", e.g. /todo add Export invoices to PDF')
          text = P.add(doc, all)
          did = `added "${all}"`
          break
        case 'start':
        case 'next':
          text = P.setStatus(doc, ref, 'doing')
          did = `marked step ${ref} in progress`
          break
        case 'done':
          text = P.setStatus(doc, ref, 'done')
          did = `marked step ${ref} done`
          break
        case 'undo':
        case 'reopen':
          text = P.setStatus(doc, ref, 'todo')
          did = `marked step ${ref} to do`
          break
        case 'rename':
          if (!tail) throw new Error('Write the new wording, e.g. /todo rename 3 Export invoices as PDF')
          text = P.rename(doc, ref, tail)
          did = `renamed step ${ref} to "${tail}"`
          break
        case 'move':
          text = P.move(doc, ref, Number(rest[1]))
          did = `moved step ${ref} to position ${rest[1]}`
          break
        case 'drop':
          did = `moved step ${ref} ("${titleOf()}") to Out of scope`
          text = P.drop(doc, ref, await today($))
          break
        case 'remove':
        case 'rm':
          did = `deleted step ${ref} ("${titleOf()}")`
          text = P.remove(doc, ref)
          break
        default:
          return { text: `Unknown action "${verb}".\n\n${HELP}` }
      }
    } catch (err) {
      return { text: `${err instanceof Error ? err.message : String(err)}\n\n${P.listing(doc)}` }
    }

    await $.fs.write(FILE, text)
    const updated = P.parse(text, doc.name)
    await update($, summary, () => P.summarize(updated))
    return {
      text: `Done: ${did}.\n\n${P.listing(updated)}`,
      context: [
        `The person edited ${FILE} with /todo (${did}). That file is now the agreed plan: follow it, and don't re-add steps they dropped or removed.`,
      ],
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, summary)
    if (e.props.hasSurvey || s === null || s.total === 0) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const clip = (t: string) => (t.length > 40 ? `${t.slice(0, 39)}…` : t)

    return (
      <Box>
        <Text bold>{s.name}  </Text>
        <Text>{P.bar(s.done, s.total)} {s.done}/{s.total}</Text>
        <Text dimColor>
          {s.current ? `  ·  Now: ${clip(s.current)}` : ''}
          {`  ·  Next: ${s.next ? clip(s.next) : 'all done'}  ·  /todo to edit`}
        </Text>
      </Box>
    )
  })
}
