---
task_schema_version: 2
id: BACK-531
title: Add creation-date sorting to board column menu
status: Done
assignee:
  - '@codex'
created_date: '2026-07-09 06:50'
updated_date: '2026-07-09 06:56'
labels: []
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/694'
ordinal: 168000
description: >-
  GitHub issue #694 asks for a Web board column menu action to sort tasks by
  creation date. Scope is intentionally narrow: add creation-date sort actions
  beside the existing Sort by Priority action, using the existing task
  createdDate field and current column reorder behavior without introducing a
  generic sorting framework.
implementation_plan: >-
  1. Add a small TaskColumn-local sort helper for creation date ordering,
  reusing the existing reorder payload flow.

  2. Extend the column actions menu with two creation-date actions: oldest first
  and newest first.

  3. Add focused TaskColumn DOM tests for both directions and missing-date
  fallback behavior.

  4. Run the Web column test, type-check, Biome, and relevant broader tests.
implementation_notes: >-
  Reproduced issue #694 by rendering TaskColumn with multiple tasks and opening
  the column menu; the only menu item is "Sort by Priority", with no
  creation-date sort action.


  Implemented two TaskColumn menu actions for creation-date sorting: oldest
  first and newest first. Both actions reuse the existing column reorder payload
  flow and keep missing/invalid created dates at the end with task ID as the
  deterministic tie-breaker.


  Validation passed: DOM reproduction now shows Sort by Priority, Sort by
  Creation Date (oldest first), and Sort by Creation Date (newest first); bun
  test src/test/web-task-column-sort.test.tsx; bunx tsc --noEmit; bun run check
  .; bun run build; bun test src/test/web-task-column-sort.test.tsx
  src/web/lib/lanes.test.ts src/test/board.test.ts src/test/board-ui.test.ts;
  bun test (1449 pass, 2 skip, 0 fail).
final_summary: >-
  Added creation-date sorting to the Web board column menu using the existing
  reorder behavior. Users can sort a column oldest-first or newest-first;
  missing created dates sort last and ties fall back to task ID. Added focused
  TaskColumn tests for both directions and fallback behavior.
acceptance_criteria:
  - index: 1
    text: >-
      Board column menu exposes creation-date sorting beside the existing
      priority sort action.
    checked: true
  - index: 2
    text: >-
      Creation-date sorting supports both oldest-first and newest-first ordering
      within the selected column.
    checked: true
  - index: 3
    text: >-
      Sorting uses each task createdDate and falls back predictably when a task
      has no created date.
    checked: true
  - index: 4
    text: The change is covered by focused Web board tests.
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
