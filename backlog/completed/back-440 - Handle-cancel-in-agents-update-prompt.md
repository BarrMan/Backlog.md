---
task_schema_version: 2
id: BACK-440
title: Handle cancel in agents update prompt
status: Done
assignee:
  - '@alex-agent'
created_date: '2026-04-25 21:55'
updated_date: '2026-04-25 22:00'
labels:
  - bug
  - cli
  - agents
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/192'
  - 'https://github.com/MrLesk/Backlog.md/pull/575'
priority: medium
description: >-
  Issue #192 and PR #575 cover the interactive `backlog agents
  --update-instructions` flow. When a user cancels the agent-instruction file
  multiselect prompt, Backlog.md should treat that as an explicit abort instead
  of continuing as though the user submitted an empty selection.


  This task tracks validating and merging PR #575. The fix should stay focused
  on the cancel path: cancelling the prompt exits cleanly, does not update
  instruction files, and preserves normal update behavior when files are
  selected.
implementation_notes: >-
  2026-04-25: PR #575 TTY verification used `/usr/bin/expect` with disposable
  initialized Backlog projects. Base/main cancellation reproduced the confusing
  empty-selection message; PR branch cancellation printed the explicit
  cancellation message and did not create CLAUDE.md/AGENTS.md/GEMINI.md/Copilot
  instruction files. Empty Enter and Space+Enter paths were also checked on the
  PR branch.
final_summary: >-
  Verified PR #575 for the `backlog agents --update-instructions` cancel path
  and tracked it under BACK-440. Reproduced the current main behavior with a
  real `expect` pseudo-terminal: pressing Escape at the multiselect prompt exits
  through the empty-selection path and prints `No files selected for update.`.
  Verified the PR branch changes that behavior to print `Agent instruction
  update cancelled.` and return without creating instruction files. Also
  verified Enter with no selection still prints `No files selected for update.`
  and Space+Enter still updates `CLAUDE.md` normally. Local validation passed:
  `bun test src/test/cli-agents.test.ts`, `bunx tsc --noEmit`, and `bun run
  check .`.
acceptance_criteria:
  - index: 1
    text: >-
      Cancelling the `backlog agents --update-instructions` multiselect exits
      the command cleanly with a clear cancellation message.
    checked: true
  - index: 2
    text: >-
      The cancel path does not create, rewrite, or stage agent instruction
      files.
    checked: true
  - index: 3
    text: >-
      Submitting an empty selection remains distinct from cancellation and does
      not regress existing no-selection behavior.
    checked: true
  - index: 4
    text: >-
      Selecting one or more instruction files still updates the requested files
      normally.
    checked: true
  - index: 5
    text: >-
      Verification includes an interactive TTY-style reproduction of the pre-fix
      problem and confirmation that the PR branch fixes it.
    checked: true
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: true
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: true
  - index: 3
    text: bun test (or scoped test) passes
    checked: true
comments: []
---
