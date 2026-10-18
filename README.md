# claude-config

My personal Claude setup, shared across Work PC, Home PC and Laptop.

## On each computer (once)

1. Copy `CLAUDE.md` to `C:\Users\<you>\.claude\CLAUDE.md`
2. Copy `commands\setup-project.md` to `C:\Users\<you>\.claude\commands\setup-project.md`
3. In Claude (terminal), install the progress mod:

   ```
   /plugin install project-progress --marketplace <your-github-user>/claude-config
   ```

   Answer `y` to add the marketplace, then pick the "user" scope so it works in every project.

When I change something here: push, then on the other machines `git pull` and copy the two files again
(the mod updates through `/plugin`).

## In a project

| Type | What it does |
|---|---|
| `/setup-project Work PC` | First time: creates PROGRESS.md and the project CLAUDE.md |
| `/todo` | Show the steps |
| `/todo add Export invoices to PDF` | Add a step at the end |
| `/todo start 3` / `done 3` / `undo 3` | Set step 3 to in progress / done / to do |
| `/todo rename 3 New wording` | Reword step 3 |
| `/todo move 5 2` | Move step 5 to position 2 |
| `/todo drop 4` | Out of scope: moves it under "Out of scope" (kept on record) |
| `/todo remove 4` | Delete step 4 completely |

The bar above the prompt shows: `Project  ██████░░░░ 6/10  ·  Next: ...`
