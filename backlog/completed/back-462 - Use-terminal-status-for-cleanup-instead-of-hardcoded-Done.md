---
task_schema_version: 2
id: BACK-462
title: Use terminal status for cleanup instead of hardcoded Done
status: Done
assignee:
  - '@codex'
created_date: '2026-05-03 18:18'
updated_date: '2026-05-03 18:52'
labels:
  - bug
  - web
  - cleanup
dependencies: []
modified_files:
  - src/utils/terminal-status.ts
  - src/core/backlog.ts
  - src/server/index.ts
  - src/cli.ts
  - src/web/components/Board.tsx
  - src/web/components/TaskColumn.tsx
  - src/web/components/TaskList.tsx
  - src/test/cleanup.test.ts
  - src/test/server-cleanup-endpoint.test.ts
  - src/test/web-board-filters.test.tsx
  - src/test/web-task-column-sort.test.tsx
  - src/test/web-task-list-labels-menu.test.tsx
  - src/test/terminal-status.test.ts
priority: high
description: >-
  Cleanup must apply to the terminal Kanban status defined by the configured
  statuses array, not only a literal `Done` status. Users can rename the final
  workflow column to values such as `Closed`, and the web cleanup affordance
  plus backend cleanup selection should still agree on that terminal column.
implementation_plan: >-
  1. Add one pure terminal-status helper based on the final configured status.

  2. Use that helper in backend cleanup selection plus server and CLI cleanup
  flows.

  3. Use the same terminal-status rule for web board and task-list cleanup
  affordances.

  4. Add regression tests for a non-`Done` terminal status in core cleanup,
  server cleanup, board, task column, and task list.

  5. Run targeted tests, typecheck, and Biome.
implementation_notes: >-
  Verification completed: targeted cleanup/web tests passed (20 tests), `bunx
  tsc --noEmit` passed, and `bun run check .` passed.


  Addressed first Codex review feedback: terminal-status comparisons now
  normalize case and surrounding whitespace so bookmarked URLs such as
  `?status=closed` still show the cleanup affordance for configured `Closed`.
  Added focused helper coverage for that behavior.


  Addressed follow-up Codex review feedback: terminal-status normalization
  preserves internal whitespace, so `In Progress` and `InProgress` remain
  distinct for cleanup selection.
final_summary: >-
  Implemented cleanup around the configured terminal status, defined as the last
  entry in the `statuses` array. The core cleanup selector, web/server
  endpoints, CLI cleanup preflight, board cleanup affordance, task column
  rendering, and task-list cleanup affordance now use the same terminal-status
  rule. Added regression coverage for `Closed` as the final status across core
  cleanup, server cleanup endpoints, Board, TaskColumn, and TaskList.


  Follow-up review fixes: bookmarked/shared URL status filters now match the
  terminal status case-insensitively while preserving internal whitespace, with
  helper/core cleanup regression coverage for similarly named statuses such as
  `In Progress` versus `InProgress`.
acceptance_criteria:
  - index: 1
    text: >-
      When the final configured status is renamed, the board cleanup affordance
      appears on that final column and not on earlier columns.
    checked: true
  - index: 2
    text: >-
      The cleanup preview and execute endpoints select tasks in the final
      configured status rather than requiring `Done`.
    checked: true
  - index: 3
    text: >-
      The task list cleanup affordance follows the same terminal-status rule
      when filtering by status.
    checked: true
  - index: 4
    text: >-
      Existing default `To Do`, `In Progress`, `Done` projects keep the current
      cleanup behavior.
    checked: true
  - index: 5
    text: Targeted tests cover a non-`Done` terminal status.
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
