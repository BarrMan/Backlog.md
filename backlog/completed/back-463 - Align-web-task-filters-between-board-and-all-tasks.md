---
task_schema_version: 2
id: BACK-463
title: Align web task filters between board and all tasks
status: Done
assignee:
  - '@codex'
created_date: '2026-05-03 19:15'
updated_date: '2026-05-03 19:21'
labels:
  - web
  - filters
  - bug
dependencies: []
modified_files:
  - src/web/components/TaskList.tsx
  - src/web/components/Board.tsx
  - src/test/web-task-list-labels-menu.test.tsx
  - src/test/web-board-filters.test.tsx
priority: high
description: >-
  Follow-up to manual BACK-441 testing. Remove the duplicate local free-text
  `Search tasks` input from the All Tasks page because the web UI already has
  global sidebar search. Reuse the All Tasks dropdown visual treatment for the
  Kanban board assignee, label, and priority filters, and place those board
  filters inline next to the `All Tasks` / `Milestone` lane mode switch instead
  of in a separate smaller filter row.
implementation_plan: >-
  1. Commit the BACK-463 task file to `main` by itself, then branch for code
  changes.

  2. In `TaskList.tsx`, remove the local `Search tasks` input, its state, and
  `query` URL/search plumbing only; leave status, priority, milestone, label,
  cleanup, and clear-filter behavior intact.

  3. In `Board.tsx`, move assignee/label/priority filter controls into the
  header group beside the lane mode segmented control and reuse the All Tasks
  dropdown classes (`h-10`, `rounded-lg`, gray border, stone focus ring,
  matching text/background colors). Keep clear filters nearby without changing
  URL semantics.

  4. Update focused tests for the missing All Tasks search input and board
  filters being inline/styled like All Tasks controls.

  5. Run targeted web tests, typecheck, Biome, and a local source browser/server
  smoke before opening the PR.
implementation_notes: >-
  Removed the All Tasks local `Search tasks` input and query-specific state/API
  plumbing, leaving status, priority, milestone, label, cleanup, and
  clear-filter controls intact.


  Moved Board assignee/label/priority filters beside the lane mode switch and
  aligned their select styling with the All Tasks dropdown sizing/focus
  treatment. URL-backed filter semantics remain unchanged.


  Verification: `bun test src/test/web-board-filters.test.tsx
  src/test/web-task-list-labels-menu.test.tsx`, `bunx tsc --noEmit`, and `bun
  run check .` all pass. Local server smoke on port 6431 served the updated
  bundle; Chrome DevTools attach was unavailable in this session.
final_summary: >-
  Summary:

  - Removed the duplicate All Tasks local `Search tasks` input and
  query-specific local filter plumbing so the page relies on the global web
  search.

  - Moved Kanban board assignee, label, and priority filters into the header
  controls beside `All Tasks` / `Milestone`, using the same All Tasks dropdown
  sizing/focus style family while preserving URL params.

  - Added focused tests for the removed All Tasks input and Board filter
  placement/styling.


  Tests:

  - `bun test src/test/web-board-filters.test.tsx
  src/test/web-task-list-labels-menu.test.tsx`

  - `bunx tsc --noEmit`

  - `bun run check .`
acceptance_criteria:
  - index: 1
    text: >-
      All Tasks no longer renders a local `Search tasks` input or writes `query`
      from that page's local controls.
    checked: true
  - index: 2
    text: >-
      All Tasks structured filters for status, priority, milestone, labels,
      cleanup, and clear filters still work.
    checked: true
  - index: 3
    text: >-
      Kanban board assignee, label, and priority filters use the same dropdown
      sizing/style family as the All Tasks page controls.
    checked: true
  - index: 4
    text: >-
      Kanban board filters sit beside the `All Tasks` / `Milestone` lane mode
      switch and keep URL persistence for `assignee`, `label`, and `priority`.
    checked: true
  - index: 5
    text: >-
      Focused web tests cover the removed All Tasks search input and the board
      filter placement/styling behavior.
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
