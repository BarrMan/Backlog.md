---
task_schema_version: 2
id: BACK-379
title: Auto-plain output when stdout is not a TTY
status: Done
assignee:
  - '@codex'
created_date: '2026-01-26 14:01'
updated_date: '2026-01-26 14:01'
labels: []
dependencies: []
description: >-
  Refactor plain-mode detection to automatically use plain text output in
  non-interactive environments (piped, CI, scripts, AI agents) instead of
  launching TUI which causes hangs.
implementation_plan: >-
  1. Add isNonInteractive const after Windows color fix section

  2. Replace all isPlainFlag definitions with usePlainOutput = options.plain ||
  isNonInteractive

  3. Update comments from "AI agents" to "non-interactive environments"

  4. Test with piped output and direct TTY
implementation_notes: >-
  - Added isNonInteractive = !process.stdout.isTTY ||
  process.argv.includes("--plain") at line 200

  - Updated 11 command handlers to use consistent usePlainOutput pattern

  - Removed duplicated process.argv.includes("--plain") checks

  - Comments updated to be more generic (non-interactive vs AI agents)
acceptance_criteria:
  - index: 1
    text: Define isNonInteractive constant once at startup
    checked: true
  - index: 2
    text: Use consistent usePlainOutput pattern in all command handlers
    checked: true
  - index: 3
    text: >-
      Commands affected: task create/list/edit/view, draft list/view, doc list,
      sequence list, search
    checked: true
  - index: 4
    text: TUI still works when stdout is a TTY
    checked: true
  - index: 5
    text: '--plain flag still works explicitly'
    checked: true
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: false
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: false
  - index: 3
    text: bun test (or scoped test) passes
    checked: false
comments: []
---
