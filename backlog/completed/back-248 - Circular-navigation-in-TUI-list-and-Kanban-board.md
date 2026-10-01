---
task_schema_version: 2
id: BACK-248
title: Circular navigation in TUI list and Kanban board
status: Done
assignee:
  - '@codex'
created_date: '2025-09-02 20:42'
updated_date: '2025-09-04 20:28'
labels:
  - ui
  - tui
  - kanban
dependencies: []
description: >-
  In the TUI task list, navigating up from the first item should wrap to the
  last item, and navigating down from the last item should wrap to the first.
  Apply the same circular up/down behavior within each column of the Kanban
  board.
implementation_plan: |-
  1. Add circular up/down in GenericList (wrap at ends)
  2. Add circular up/down in Kanban columns (board.ts)
  3. Handle single/empty edge cases without errors
  4. Minimal tests for list/board selection wrap
implementation_notes: >-
  Implemented circular navigation in TUI task list (GenericList) and Kanban
  columns (board.ts). Up from first wraps to last; Down from last wraps to
  first. Single/empty cases keep selection stable and do not crash.
acceptance_criteria:
  - index: 1
    text: 'TUI list: Up from first item selects the last item.'
    checked: true
  - index: 2
    text: 'TUI list: Down from last item selects the first item.'
    checked: true
  - index: 3
    text: >-
      TUI list: With a single item, up/down keeps the same selection (no
      errors).
    checked: true
  - index: 4
    text: 'TUI list: With zero items, navigation produces no errors or crashes.'
    checked: true
  - index: 5
    text: >-
      Kanban board: Within a column, Up from the first item selects the last
      item in that column.
    checked: true
  - index: 6
    text: >-
      Kanban board: Within a column, Down from the last item selects the first
      item in that column.
    checked: true
  - index: 7
    text: >-
      Kanban board: Columns with a single item keep the selection stable on
      up/down (no errors).
    checked: true
  - index: 8
    text: >-
      Kanban board: Empty column navigation does not crash and leaves selection
      state consistent.
    checked: true
definition_of_done: []
comments: []
---
