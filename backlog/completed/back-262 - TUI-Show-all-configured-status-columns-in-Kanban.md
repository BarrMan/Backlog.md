---
task_schema_version: 2
id: BACK-262
title: 'TUI: Show all configured status columns in Kanban'
status: Done
assignee:
  - '@codex'
created_date: '2025-09-07 19:58'
updated_date: '2025-09-27 17:45'
labels:
  - tui
  - board
  - kanban
  - config
  - parity
dependencies: []
priority: medium
description: >-
  Web UI shows all statuses from config as columns in Kanban. The TUI board
  currently hides empty statuses and only renders columns that have tasks.
  Update the TUI Kanban to always render every status defined in
  backlog/config.yml, even when a column has zero tasks, preserving configured
  order. If tasks use unknown statuses (not in config), show those columns after
  the configured ones.
implementation_plan: >-
  1. Align TUI column preparation with config statuses by updating the helper
  that groups tasks so it always returns every configured status in order and
  appends any extra statuses from tasks afterward.

  2. Mirror the same ordering logic in the plain-text board generator so
  fallback output and exports include empty configured columns.

  3. Harden the TUI focus/update flow to cope with zero-task columns (e.g.,
  selection restoration and labels) so navigation works even when several
  columns are empty.

  4. Add tests that cover empty-column rendering/order for both column
  preparation and plain-text export, plus a navigation-focused scenario for
  updates with empty columns.

  5. Run lint, type-check, and the relevant Bun test suites to confirm the
  change meets DoD.
implementation_notes: >-
  - Added shared kanban status grouping helper to keep configured columns
  visible and append unknown statuses after them.

  - TUI board now consumes the shared grouping so empty columns render with (0)
  counts while navigation continues to work.

  - Plain-text board export mirrors the same ordering and retains the
  empty-state message when no tasks exist.

  - Tests: bun test board.test.ts; bun test cli.test.ts; bunx tsc --noEmit; bun
  run check .
acceptance_criteria:
  - index: 1
    text: >-
      TUI Kanban renders all statuses from backlog/config.yml as columns, even
      when empty
    checked: true
  - index: 2
    text: Column order matches the order in config.statuses
    checked: true
  - index: 3
    text: >-
      Empty columns display with title and (0) count; no crashes when selecting
      columns with no tasks
    checked: true
  - index: 4
    text: >-
      Statuses present on tasks but missing from config appear as extra columns
      after configured ones
    checked: true
  - index: 5
    text: >-
      When there are no tasks at all, the board still renders all configured
      columns and navigation works
    checked: true
  - index: 6
    text: Web UI behavior unchanged; change applies only to TUI
    checked: true
  - index: 7
    text: >-
      Type-check and lint pass; tests cover empty-column rendering and
      navigation
    checked: true
definition_of_done: []
comments: []
---
