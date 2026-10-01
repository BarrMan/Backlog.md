---
task_schema_version: 2
id: BACK-551
title: Show acceptance criteria completion on TUI task summaries
status: Done
assignee:
  - '@codex'
created_date: '2026-07-17 21:36'
updated_date: '2026-08-10 05:38'
labels:
  - tui
dependencies: []
modified_files:
  - src/ui/acceptance-criteria-progress.ts
  - src/ui/board.ts
  - src/ui/task-viewer-with-search.ts
  - src/test/tui-acceptance-criteria-progress.test.ts
type: feature
ordinal: 195000
description: >-
  Help people understand how much accepted task scope has been verified while
  scanning in-progress work in the TUI. In-progress task summaries and cards
  should show a compact completion bar followed by the exact checked/total
  acceptance-criteria fraction. This is a TUI presentation feature only; it does
  not change task state or CLI and MCP output.
implementation_plan: >-
  1. Add one pure TUI acceptance-criteria progress formatter that derives
  checked and total counts from acceptanceCriteriaItems, renders only In
  Progress tasks, and selects a 10- or 5-cell bar from available row width.

  2. Reuse the formatter in board cards and interactive task-list summaries
  while preserving status, identity, selection, cross-branch styling, and
  responsive rerendering.

  3. Add deterministic rendering tests for partial, empty, fully checked,
  non-progress, wide, and constrained cases across both summary surfaces.

  4. Run focused tests, TypeScript, Biome, build, and unchanged CLI JSON
  coverage; inspect the final diff for simplification and scope.
implementation_notes: >-
  Implemented a shared, color-independent TUI formatter that reads
  acceptanceCriteriaItems live and renders responsive 10-cell or 5-cell
  completion bars only for In Progress tasks. Board cards and task-list
  summaries reuse it; progress-bearing list rows use the existing active-status
  icon so constrained layouts retain task identity.


  Verification: 61 focused TUI, board, selection, and CLI JSON tests passed; 32
  MCP task tests passed; 4 loopback browser/server tests passed outside the
  sandbox; bunx tsc --noEmit, bun run check ., bun run build, and git diff
  --check passed. Rendered PTY QA at 120x30 and 80x24 verified board and list
  wide/compact bars, uncluttered no-criteria tasks, and fully checked tasks
  retaining the active status. The full suite attempt also hit the pre-existing
  TUI watcher timeout, reproduced from unchanged HEAD, plus sandbox-only port
  binding failures; the port tests passed when rerun with loopback access.
final_summary: >-
  Added a shared responsive acceptance-criteria progress indicator to TUI board
  cards and task-list summaries. It derives checked/total values directly from
  each task, uses 10 cells on wide rows and 5 on constrained rows, omits tasks
  without criteria, and preserves active-status meaning without relying on
  color. Verified with 93 focused TUI/CLI JSON/MCP tests, 4 loopback server
  tests, PTY rendering at 120x30 and 80x24, TypeScript, Biome, build, and diff
  checks.
acceptance_criteria:
  - index: 1
    text: >-
      In-progress task summaries and cards in the TUI show a compact completion
      bar followed by the exact checked/total fraction, for example [██████░░░░]
      4/7.
    checked: true
  - index: 2
    text: The visible indicator has no AC label and no percentage.
    checked: true
  - index: 3
    text: >-
      The completion value is derived live from checked and total acceptance
      criteria and is not persisted as separate progress state.
    checked: true
  - index: 4
    text: >-
      The bar uses 10 cells when available terminal width permits and 5 cells in
      constrained layouts.
    checked: true
  - index: 5
    text: >-
      A task with no acceptance criteria does not display 0% or otherwise imply
      measurable completion.
    checked: true
  - index: 6
    text: >-
      A task with every acceptance criterion checked still retains and clearly
      presents its actual In Progress status rather than implying that the task
      is Done.
    checked: true
  - index: 7
    text: >-
      Colors are theme-safe, and the bar plus exact fraction remain
      understandable when color is unavailable.
    checked: true
  - index: 8
    text: CLI and MCP output remain unchanged.
    checked: true
  - index: 9
    text: >-
      TUI rendering tests cover partial completion, no acceptance criteria, all
      criteria checked while still In Progress, and both supported bar widths.
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
