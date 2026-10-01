---
task_schema_version: 2
id: BACK-98
title: Invert task order in Done column only
status: Done
assignee:
  - '@Cursor'
created_date: '2025-06-20'
updated_date: '2025-06-20'
labels:
  - ui
  - enhancement
dependencies: []
description: >-
  Currently all tasks are sorted in ascending order by ID. This task is to
  change the Done column to show tasks in descending order (most recently
  completed first) while keeping all other columns in ascending order.
implementation_notes: >-
  - Modified `src/ui/board.ts` to change the sort order for the "Done" column to
  be descending.

  - Applied the same logic to `src/board.ts` to ensure that exported boards also
  reflect the new sort order.

  - Kept the ascending sort order for all other columns.
acceptance_criteria:
  - index: 1
    text: Done column shows tasks in descending order by ID
    checked: true
  - index: 2
    text: Other status columns remain in ascending order
    checked: true
  - index: 3
    text: Board view reflects the new ordering
    checked: true
  - index: 4
    text: Exported boards show the correct ordering
    checked: true
definition_of_done: []
comments: []
---
