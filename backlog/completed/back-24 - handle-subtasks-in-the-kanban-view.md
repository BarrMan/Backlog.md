---
completed_date: '2025-06-09'
task_schema_version: 2
id: BACK-24
title: Handle subtasks in the Kanban view
status: Done
assignee: []
created_date: '2025-06-09'
updated_date: '2025-06-09'
labels: []
dependencies: []
description: >-
  Display subtasks indented with pipes | and em dashes — under their parent
  task. Subtask IDs show the pipe prefix while titles are cleanly spaced.
  Includes configurable column width settings for optimal display formatting.
implementation_notes: >-
  * Updated `generateKanbanBoard()` in `src/board.ts` to group subtasks under
    their parent when both share the same status.
  * Subtasks use enhanced formatting: IDs prefixed with `  |—` (2 spaces + pipe
  + em dash), 
    titles indented with 6 spaces total for optimal visual alignment.
  * Added configurable column width via `maxColumnWidth` parameter and
  `max_column_width` 
    in config.yml (default: 20 for terminal, 80 for export).
  * Added new unit test `nests subtasks under their parent when statuses match`
    in `src/test/board.test.ts`.
  * Successfully integrated subtask functionality with ID sorting (task 23),
  vertical layout (task 21), and export features (task 25).

  * Enhanced sorting to use `compareIds` for both parent tasks and subtasks,
  ensuring proper numeric ordering.

  * Subtask functionality works seamlessly across all board layouts
  (horizontal/vertical) and export operations.

  * Board export supports both terminal and markdown formats with proper column
  width constraints.
acceptance_criteria:
  - index: 1
    text: Subtasks appear under their parent task in the Kanban board
    checked: true
  - index: 2
    text: Pipes and em dashes visually indent subtasks for clarity
    checked: true
  - index: 3
    text: Subtask IDs prefixed with `  |—` (2 spaces + pipe + em dash)
    checked: true
  - index: 4
    text: Subtask titles indented with 6 spaces total for optimal alignment
    checked: true
  - index: 5
    text: Column width configurable via `max_column_width` in config.yml
    checked: true
definition_of_done: []
comments: []
---
