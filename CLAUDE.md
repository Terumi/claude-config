# Database — applies to ALL databases, including test databases
- Never run migrations, seeders, or any schema-altering process (DDL).
- Never INSERT, UPDATE, or DELETE records, and never run processes that write
  to a database (queue workers, cron/billing commands without --dry-run, tinker
  writes, factories).
- Never run test suites (php artisan test, phpunit, pest, etc.) — tests migrate
  and write to databases. Write and edit test files freely; I run them myself
  and will paste the output when needed.
- Read-only SELECT queries (tinker, psql, artisan db:show/db:table) are fine
  for debugging — no need to ask.

# Secrets
- Never read .env files, and never surface their values by any other means
  (config:show, dumping env()/config() secrets, error pages). Reasoning about
  config structure via config/*.php is fine.

# Filesystem
- Never change files outside the folder we are working in.
  (Exception: ~/.claude config files, only when I explicitly ask.)

# Workflow
- File searches inside the working folder are always fine, even multi-line —
  don't ask about them.

# Personal working style (applies to every project)

## Before changing anything
- Give a short numbered plan (3-6 steps, plain words) and wait for my OK.

## While working
- One short line per step, e.g. "Step 2/5: writing migration file". No long output dumps.
- If you use a command, package or Laravel feature I might not know, explain it in one sentence.
- Never install packages, change config, or touch unrelated files without asking.

## At the end
- List changed files + one line why each.
- Tell me what to test, including the exact command(s) for me to run (migrations, tests, etc.),
  since you don't run them yourself.

## Progress tracking
- At session start: if PROGRESS.md exists, read it and tell me in max 3 lines where we left off
  and what's next. If it doesn't exist, suggest running /setup-project.
- At session end: update PROGRESS.md (tick steps, update "Last session" and "Next step").
- If I ask about a project whose code is not on this computer, say so plainly.
  Don't clone or recreate anything unless I ask.
