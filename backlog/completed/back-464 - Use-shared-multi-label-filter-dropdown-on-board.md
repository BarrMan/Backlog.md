---
task_schema_version: 2
id: BACK-464
title: Use shared multi-label filter dropdown on board
status: Done
assignee:
  - '@codex'
created_date: '2026-05-03 19:30'
updated_date: '2026-05-03 19:34'
labels:
  - web
  - filters
  - bug
dependencies: []
modified_files:
  - src/web/components/LabelFilterDropdown.tsx
  - src/web/components/TaskList.tsx
  - src/web/components/Board.tsx
  - src/web/components/BoardPage.tsx
  - src/web/App.tsx
  - src/test/web-task-list-labels-menu.test.tsx
  - src/test/web-board-filters.test.tsx
priority: high
description: >-
  Follow-up to BACK-463. The Kanban board label filter should not be a weaker
  single-select control while the All Tasks page has a richer multi-select
  labels dropdown. Extract the All Tasks labels dropdown into a shared web
  component and use it on both All Tasks and the Kanban board so users can
  filter the board by multiple labels with the same UX and styling.
implementation_plan: >-
  1. Commit the BACK-464 task file to `main` by itself, then branch for code
  changes.

  2. Extract the All Tasks labels dropdown into a shared `LabelFilterDropdown`
  component with the current button/menu styling, outside-click handling,
  selected-count display, empty-state, checkbox selection, and clear action.

  3. Replace TaskList's inline labels menu with the shared component without
  changing All Tasks label filter state or URL behavior.

  4. Change Board/BoardPage label filter state from single string to string
  array, read/write repeated `label` URL params, and filter board cards when any
  selected label matches.

  5. Replace Board's native label select with the shared labels dropdown beside
  the lane mode switch and keep Clear filters behavior.

  6. Update focused tests for All Tasks parity and Kanban multi-label
  filtering/URL persistence, then run targeted tests, typecheck, and Biome.
implementation_notes: >-
  Extracted the All Tasks labels menu into a shared `LabelFilterDropdown`
  component and replaced the inline All Tasks implementation with it.


  Replaced the Kanban board native single-label select with the shared
  multi-select labels dropdown. Board filters now carry `labels: string[]`,
  write repeated `label` URL params, read repeated `label` plus legacy `labels`
  CSV params, and match tasks that contain any selected label.


  Verification: `bun test src/test/web-board-filters.test.tsx
  src/test/web-task-list-labels-menu.test.tsx`, `bunx tsc --noEmit`, and `bun
  run check .` all pass.
final_summary: >-
  Summary:

  - Extracted the All Tasks labels dropdown into a shared `LabelFilterDropdown`
  component.

  - Reused that shared multi-select dropdown in both All Tasks and the Kanban
  board.

  - Changed Board/BoardPage label filtering from a single string to `labels:
  string[]`, with repeated `label` URL params and any-selected-label matching.

  - Updated focused web tests to cover no native Board label select, multi-label
  URL persistence, label OR filtering, and existing All Tasks dropdown behavior.


  Tests:

  - `bun test src/test/web-board-filters.test.tsx
  src/test/web-task-list-labels-menu.test.tsx`

  - `bunx tsc --noEmit`

  - `bun run check .`
acceptance_criteria:
  - index: 1
    text: >-
      All Tasks continues to render the same multi-select Labels dropdown
      behavior and visual treatment as before.
    checked: true
  - index: 2
    text: >-
      Kanban board uses the same shared Labels dropdown component instead of a
      native single-select label filter.
    checked: true
  - index: 3
    text: >-
      Kanban board supports selecting multiple labels and persists them in URL
      params using repeated `label` params, matching All Tasks filter semantics
      where possible.
    checked: true
  - index: 4
    text: >-
      Kanban board label filtering shows tasks that include any selected label,
      preserving existing assignee and priority filter behavior.
    checked: true
  - index: 5
    text: >-
      Clear filters clears all selected board labels along with assignee and
      priority filters.
    checked: true
  - index: 6
    text: >-
      Focused web tests cover shared All Tasks labels behavior and multi-label
      Kanban board filtering/URL persistence.
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
