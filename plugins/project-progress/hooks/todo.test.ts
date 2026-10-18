import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import * as P from './progress'

const SAMPLE = [
  '# Invoicing Portal',
  '- Repo: github.com/microbase/invoicing',
  '- Progress: 1/3 steps',
  '- Next step: PDF export',
  '',
  '## Steps',
  '- [x] Auth module',
  '- [~] PDF export',
  '- [ ] Deploy',
  '',
  '## Notes',
  'keep me',
].join('\r\n')

describe('progress.ts', () => {
  test('parses steps, name and summary', () => {
    const doc = P.parse(SAMPLE, 'x')
    expect(doc.name).toBe('Invoicing Portal')
    expect(P.summarize(doc)).toEqual({ name: 'Invoicing Portal', done: 1, total: 3, next: 'PDF export' })
  })

  test('add keeps CRLF and updates the Progress line', () => {
    const out = P.add(P.parse(SAMPLE, 'x'), 'Email invoices')
    expect(out.includes('- [ ] Deploy\r\n- [ ] Email invoices\r\n')).toBe(true)
    expect(out.includes('- Progress: 1/4 steps')).toBe(true)
    expect(out.includes('keep me')).toBe(true)
  })

  test('done updates Next step', () => {
    const out = P.setStatus(P.parse(SAMPLE, 'x'), 2, 'done')
    expect(out.includes('- [x] PDF export')).toBe(true)
    expect(out.includes('- Next step: Deploy')).toBe(true)
    expect(out.includes('- Progress: 2/3 steps')).toBe(true)
  })

  test('drop moves the step to Out of scope, which no longer counts', () => {
    const out = P.drop(P.parse(SAMPLE, 'x'), 3, '2026-10-18')
    expect(out.endsWith('## Out of scope\r\n- Deploy (dropped 2026-10-18)')).toBe(true)
    const again = P.parse(out, 'x')
    expect(P.summarize(again).total).toBe(2)
    const out2 = P.drop(again, 2, '2026-10-19')
    expect(out2.endsWith('- Deploy (dropped 2026-10-18)\r\n- PDF export (dropped 2026-10-19)')).toBe(true)
  })

  test('remove, rename and move', () => {
    const doc = P.parse(SAMPLE, 'x')
    expect(P.remove(doc, 1).includes('Auth module')).toBe(false)
    expect(P.rename(doc, 3, 'Deploy to prod').includes('- [ ] Deploy to prod')).toBe(true)
    const moved = P.parse(P.move(doc, 3, 1), 'x')
    expect(moved.steps.map(s => s.text)).toEqual(['Deploy', 'Auth module', 'PDF export'])
  })

  test('bad step number explains the range', () => {
    expect(() => P.setStatus(P.parse(SAMPLE, 'x'), 9, 'done')).toThrow('Steps go from 1 to 3')
  })
})

const withFile = (on: On, initial: string | null) => {
  const files: { text: string | null } = { text: initial }
  on('fs.read', () => {
    if (files.text === null) return { deny: 'ENOENT: no such file' }
    return { value: files.text }
  })
  on('fs.write', (_$, e) => {
    files.text = e.text
    return { value: undefined }
  })
  on('session.cwd', () => ({ value: 'C:\\work\\invoicing' }))
  on('clock.now', () => ({ value: Date.parse('2026-10-18T09:00:00Z') }))
  return files
}

const run = ($: Engine, args: string) =>
  $.command.run({
    command: 'todo',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  })

describe('/todo command', () => {
  test('lists, adds and drops', async ($, on) => {
    const files = withFile(on, SAMPLE)
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('session.start', () => ({ cwd: 'C:\\work\\invoicing' }))

    const list = await run($, '')
    expect(list.text?.includes(' 2. [~] PDF export')).toBe(true)

    const added = await run($, 'add Email invoices')
    expect(added.text?.startsWith('Done: added "Email invoices"')).toBe(true)
    expect(files.text?.includes('- [ ] Email invoices')).toBe(true)

    await run($, 'drop 3')
    expect(files.text?.includes('- Deploy (dropped 2026-10-18)')).toBe(true)

    const bad = await run($, 'done 42')
    expect(bad.text?.startsWith('There is no step 42')).toBe(true)
  })

  test('without PROGRESS.md it points to /setup-project', async ($, on) => {
    withFile(on, null)
    const res = await run($, '')
    expect(res.text?.includes('/setup-project')).toBe(true)
  })
})

test('the band shows name, bar and next step on terminal and desktop', async ($, on) => {
  withFile(on, SAMPLE)
  await run($, 'done 2')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'project-progress',
      surface,
      component: 'AbovePrompt',
      // only hasSurvey matters to this band; the rest is layout the engine fills in
      props: { hasSurvey: false } as never,
    })
    expect(await ui.find({ type: 'Text', text: /Invoicing Portal/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2\/3/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Next: Deploy/ })).toBeDefined()
    await ui.unmount()
  }
})
