# Context for Claude working in this repo

Handoff from a Claude (Cowork) chat on 2026-10-18. Read this before changing anything here.

## What this repo is
My personal Claude setup, shared across three machines (Work PC, Home PC, Laptop).
I'm Tasos, a Laravel developer. I use Claude Code in the PhpStorm terminal.

## Goals behind it
- Less noise: plan first, one short line per step, explain unfamiliar things, no surprises.
- Clear progress per project: each project repo has a PROGRESS.md (steps checklist), and a progress bar shows above the prompt.
- One Claude across machines: rules and tools live in this repo; each machine pulls it.

## What's in here
- `CLAUDE.md`: my global rules (DB safety, secrets, filesystem, working style, progress tracking).
  Copied on each machine to `C:\Users\<me>\.claude\CLAUDE.md`. Note: when Claude runs inside THIS repo it also reads it as project instructions.
- `commands/setup-project.md`: the `/setup-project [machine]` command. Copied to `C:\Users\<me>\.claude\commands\`.
  Creates a project's CLAUDE.md (with `@PROGRESS.md`) and a PROGRESS.md in the fixed layout below.
- `plugins/project-progress/`: a Claude Code mod (function hooks, early-access API).
  - `hooks/progress.ts`: pure parse/edit helpers for PROGRESS.md (keeps CRLF, updates Progress/Next step lines).
  - `hooks/register.tsx`: registers `/todo` (list/add/start/done/undo/rename/move/drop/remove), refreshes on session start and turn end, draws the AbovePrompt band.
  - `hooks/todo.test.ts`: tests. Run `claude plugin test plugins/project-progress` and `claude plugin validate plugins/project-progress`.
- `.claude-plugin/marketplace.json`: makes this repo a plugin marketplace named `tasos-claude-config`.

## PROGRESS.md layout the mod reads
```
# <Project name>
- Repo: ...
- Machine(s): ...
- Goal: ...
- Progress: X/Y steps
- Next step: ...
- Last session: YYYY-MM-DD ...

## Steps
- [x] done
- [~] in progress
- [ ] to do

## Out of scope
```

## Install (repo is private, so install from the local clone)
```
git clone https://github.com/Terumi/claude-config.git C:\dev\claude-config
/plugin marketplace add C:\dev\claude-config
/plugin install project-progress@tasos-claude-config      (user scope)
```
Update: `git pull`, then `/plugin marketplace update tasos-claude-config`.

## Open items
- Replace the example `github.com/microbase/invoicing` in `hooks/todo.test.ts` with a neutral one (e.g. github.com/example/invoicing).
- Confirm the band appears in a project with a PROGRESS.md after install.
- Later: an all-projects overview (tracker) built from each repo's PROGRESS.md.
