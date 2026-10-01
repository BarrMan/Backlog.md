---
task_schema_version: 2
id: BACK-58
title: Unify task list view to use task viewer component
status: Done
assignee:
  - '@codex'
created_date: '2025-06-14'
updated_date: '2025-06-14'
labels: []
dependencies: []
description: >-
  Replace the current task list UI with the same detailed view used by 'task
  view <task-id>' for consistent presentation
implementation_notes: >-
  Successfully unified the task list view to use the same enhanced UI as the
  task viewer component. The implementation involved:


  1. **Created `viewTaskEnhancedWithFilteredTasks` function** in
  `/Users/agavr/projects/Backlog.md/src/ui/task-viewer.ts` - A variant of
  `viewTaskEnhanced` that accepts filtered tasks instead of loading all tasks.


  2. **Updated task list command** in
  `/Users/agavr/projects/Backlog.md/src/cli.ts` - Replaced the `selectList`
  approach with direct use of the enhanced viewer for consistent presentation.


  3. **Code reuse achieved** - The implementation leverages the existing
  `generateDetailContent` function and all related formatting utilities from the
  task viewer, ensuring consistency.


  **Key benefits:**

  - Unified user experience between `backlog task list` and `backlog task view
  <id>`

  - Enhanced detail view with proper sections (metadata, description, acceptance
  criteria)

  - Preserved all existing functionality including filtering and keyboard
  navigation

  - Clean code reuse with no duplication


  **Testing completed:**

  - All 220 tests pass with no regressions

  - Interactive UI works correctly with split-pane layout

  - Plain text output (`--plain` flag) remains unchanged

  - Filtering by status and assignee works as expected
acceptance_criteria:
  - index: 1
    text: >-
      Task list command (`backlog task list`) uses the same enhanced UI as the
      individual task viewer
    checked: true
  - index: 2
    text: >-
      Left pane shows task list with same navigation functionality as current
      implementation
    checked: true
  - index: 3
    text: >-
      Right pane shows detailed task view with all sections (header, metadata,
      description, acceptance criteria)
    checked: true
  - index: 4
    text: Task selection in left pane updates the detail view in right pane
    checked: true
  - index: 5
    text: >-
      All existing keyboard shortcuts and navigation work (Tab, arrows, Esc/q to
      quit)
    checked: true
  - index: 6
    text: Plain text output (`--plain` flag) remains unchanged
    checked: true
  - index: 7
    text: >-
      Code reuses the `generateDetailContent` function and related formatting
      from task-viewer.ts
    checked: true
  - index: 8
    text: >-
      No regression in current task list filtering functionality (status,
      assignee filters)
    checked: true
definition_of_done: []
comments: []
---
