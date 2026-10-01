---
task_schema_version: 2
id: BACK-279
title: Add cleanup functionality to web UI for managing completed tasks
status: Done
assignee:
  - '@claude'
created_date: '2025-09-26 19:29'
updated_date: '2025-09-27 12:23'
labels: []
dependencies: []
priority: medium
description: >-
  The CLI has a cleanup command that moves old Done tasks to the completed
  folder to declutter the board. This functionality should be available in the
  web UI with cleanup buttons in strategic locations. The cleanup process asks
  users to select an age threshold (1 day, 1 week, 2 weeks, etc.), shows a
  preview of tasks to be moved, and upon confirmation moves them to the
  completed folder using the same core logic as the CLI command. This helps
  users maintain a clean board by archiving old completed tasks in bulk.
implementation_plan: |-
  1. Analyze existing CLI cleanup logic and core methods
  2. Create server API endpoints for cleanup preview and execution
  3. Build CleanupModal component with age selector UI
  4. Add cleanup button to Done column in Board view
  5. Add cleanup button to TaskList header for Done tasks
  6. Implement preview functionality showing tasks to be cleaned
  7. Add confirmation dialog and bulk cleanup execution
  8. Implement success toast notifications
  9. Handle error cases and edge scenarios
  10. Test all cleanup flows and UI interactions
implementation_notes: >-
  ## Implementation Complete


  - Added server API endpoints /api/tasks/cleanup and /api/tasks/cleanup/execute

  - Created CleanupModal component with age selector (1 day to 1 year)

  - Added cleanup button to Done column in Board view

  - Added cleanup button to TaskList header when Done filter is active

  - Implemented task preview with titles and dates

  - Added confirmation dialog before cleanup execution

  - Integrated success toast notifications

  - Handled edge cases: no Done tasks, no old tasks, API errors

  - Both Board and TaskList views refresh automatically after cleanup


  ### Files Modified:

  - src/server/index.ts - Added cleanup API endpoints

  - src/web/lib/api.ts - Added API client methods

  - src/web/components/CleanupModal.tsx - New modal component

  - src/web/components/Board.tsx - Added cleanup integration

  - src/web/components/TaskColumn.tsx - Added cleanup button

  - src/web/components/TaskList.tsx - Added cleanup integration


  All tests pass, TypeScript checks complete, and code is formatted per project
  standards.
acceptance_criteria:
  - index: 1
    text: >-
      Add server endpoint /api/tasks/cleanup that accepts age parameter and
      returns preview
    checked: true
  - index: 2
    text: >-
      Add server endpoint /api/tasks/cleanup/execute that performs the bulk
      cleanup operation
    checked: true
  - index: 3
    text: >-
      Create CleanupModal component with age selector matching CLI options (1
      day to 1 year)
    checked: true
  - index: 4
    text: >-
      Show preview of tasks to be cleaned up with their titles and dates in the
      modal
    checked: true
  - index: 5
    text: >-
      Add cleanup button at the bottom of Done column in Board view (icon with
      tooltip)
    checked: true
  - index: 6
    text: Add cleanup button in TaskList view header when showing Done tasks
    checked: true
  - index: 7
    text: Display confirmation dialog showing count of tasks to be moved
    checked: true
  - index: 8
    text: Execute bulk cleanup via API and refresh board/list after completion
    checked: true
  - index: 9
    text: Show success toast indicating number of tasks moved to completed folder
    checked: true
  - index: 10
    text: 'Handle edge cases: no Done tasks, no old tasks, API errors'
    checked: true
definition_of_done: []
comments: []
---
