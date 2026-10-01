---
completed_date: '2025-06-09'
task_schema_version: 2
id: BACK-23
title: 'CLI: Kanban board order tasks by ID ASC'
status: Done
assignee: []
created_date: '2025-06-09'
updated_date: '2025-06-09'
labels: []
dependencies: []
description: >-
  Sort tasks within each status column by numeric task ID in ascending order
  when rendering the board.
implementation_notes: >-
  - Added `idSegments` helper function to parse task IDs into numeric segments
  for proper sorting.

  - Implemented `compareIds` function that compares tasks by their numeric ID
  segments, handling both simple IDs (task-1, task-2) and complex decimal IDs
  (task-4.1, task-4.2).

  - Tasks are sorted using `list.slice().sort(compareIds)` within each status
  column in the `generateKanbanBoard` function.

  - Sorting works correctly with both horizontal and vertical board layouts.

  - Added comprehensive test "sorts tasks by numeric id within each status" to
  verify task-2 appears before task-10.

  - Successfully resolved merge conflicts with vertical layout and export
  functionality while preserving all features.
acceptance_criteria:
  - index: 1
    text: Tasks in each status column are sorted by numeric task ID ascending.
    checked: true
  - index: 2
    text: >-
      Sorting occurs after collecting tasks from all sources (local or remote,
      if implemented).
    checked: true
  - index: 3
    text: >-
      Board output consistently displays tasks in ascending order regardless of
      branch order.
    checked: true
definition_of_done: []
comments: []
---
