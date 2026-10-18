import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { ProgressSummary } from '../types'
import * as P from './progress'

const FILE = 'PROGRESS.md'
const summary = atom({ plugin: 'project-progress', key: 'summary' } as const, null)

const HELP = [
  'Usage:',
  '  /todo                    show the steps',
  '  /todo add <text>         add a new step at the end',
  '  /todo start <n>          make step n the one in progress [~] (or /todo next <n>)',
  '  /todo done <n>           mark step n done          [x]',
  '  /todo undo <n>           mark step n to do again   [ ]',
  '  /todo rename <n> <text>  change the wording of step n',
  '  /todo move <n> <to>      move step n to position <to>',
  '  /todo drop <n>           out of scope: moves it to "Out of scope" (kept on record)',
  '  /todo remove <n>         delete step n completely',
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'todo',
      description: "View or edit this project's steps in PROGRESS.md",
      argumentHint: '[add|start|done|undo|rename|move|drop|remove] [n] [text]',
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

  // Tells Claude where the project stands on each request, so its first reply can report it.
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    const doc = await load($)
    if (!doc || doc.steps.length === 0) return result
    const s = P.summarize(doc)
    const text = [
      `Project progress (${FILE}): ${s.done}/${s.total} steps done.`,
      `Step in progress: ${s.current ?? 'none (no step is marked [~])'}.`,
      `Next to do: ${s.next ?? 'none'}.`,
      `In your reply to the person's first message of this session, open with a 2-3 line report of that: where the project stands and what is next. Keep working on the step in progress unless they say otherwise, and tick steps in ${FILE} as they finish.`,
    ].join('\n')
    return { sections: [...result.sections, { id: 'project-progress:status', text, scope: 'session' }] }
  })

  on('command.run', { command: 'todo' }, async ($, e) => {
    const doc = await load($)
    if (!doc) {
      return { text: `No ${FILE} in this folder. Run /setup-project to create one (start Claude in the project's root folder).` }
    }

    const [verb = 'list', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const n = Number(rest[0])
    const tail = rest.slice(1).join(' ').trim()
    const all = rest.join(' ').trim()

    let text: string
    let did: string
    try {
      switch (verb.toLowerCase()) {
        case 'list':
        case 'ls':
          return { text: P.listing(doc) }
        case 'help':
          return { text: HELP }
        case 'add':
          if (!all) throw new Error('Write the step after "add", e.g. /todo add Export invoices to PDF')
          text = P.add(doc, all)
          did = `added "${all}"`
          break
        case 'start':
        case 'next':
          text = P.setStatus(doc, n, 'doing')
          did = `marked step ${n} in progress`
          break
        case 'done':
          text = P.setStatus(doc, n, 'done')
          did = `marked step ${n} done`
          break
        case 'undo':
        case 'reopen':
          text = P.setStatus(doc, n, 'todo')
          did = `marked step ${n} to do`
          break
        case 'rename':
          if (!tail) throw new Error('Write the new wording, e.g. /todo rename 3 Export invoices as PDF')
          text = P.rename(doc, n, tail)
          did = `renamed step ${n} to "${tail}"`
          break
        case 'move':
          text = P.move(doc, n, Number(rest[1]))
          did = `moved step ${n} to position ${rest[1]}`
          break
        case 'drop':
          did = `moved step ${n} ("${doc.steps[n - 1]?.text}") to Out of scope`
          text = P.drop(doc, n, await today($))
          break
        case 'remove':
        case 'rm':
          did = `deleted step ${n} ("${doc.steps[n - 1]?.text}")`
          text = P.remove(doc, n)
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
