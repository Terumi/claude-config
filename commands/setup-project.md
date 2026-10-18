---
description: Set up PROGRESS.md (and a project CLAUDE.md) for this repo
argument-hint: "[machine(s), e.g. Work PC]"
---

Set up this repo for my structured workflow. Show me your plan first and wait for my OK before writing anything. Do not commit.

1. Project CLAUDE.md: create it if missing (keep any existing content). Put only project-specific info here:
   stack/versions, how to run and test, key folders, conventions. My personal working style is already global, so don't repeat it.
   Add the line `@PROGRESS.md` so the progress file is always loaded.

2. PROGRESS.md: inspect the code, git log and any TODOs, then propose the steps.
   Show me the proposed steps and let me correct them before writing the file.
   Use exactly this layout (my /todo command and progress bar read it):

   ```
   # <Project name>
   - Repo: <git remote URL>
   - Machine(s): $ARGUMENTS
   - Goal: <one line>
   - Progress: X/Y steps
   - Next step: <one line>
   - Last session: <YYYY-MM-DD> <one line>

   ## Steps
   - [x] a finished step
   - [~] the step in progress
   - [ ] a step still to do

   ## Out of scope
   ```

   Steps are short (under ~8 words), one line each, in the order they should be done.
