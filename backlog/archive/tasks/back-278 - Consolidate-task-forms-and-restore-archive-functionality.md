---
task_schema_version: 2
id: BACK-278
title: Consolidate task forms and restore archive functionality
status: To Do
assignee: []
created_date: '2025-09-26 19:25'
labels: []
dependencies: []
priority: high
description: >-
  The web UI currently uses two different components for task management:
  TaskForm for creating new tasks and TaskDetailsModal for editing existing
  tasks. This duplication makes maintenance harder and the archive functionality
  was accidentally lost when TaskDetailsModal replaced TaskForm for editing
  (task-247). TaskDetailsModal provides a superior UX with its preview mode,
  inline editing, and organized layout. We should consolidate by extending
  TaskDetailsModal to handle both create and edit modes, add back the archive
  button in the right sidebar, and remove the redundant TaskForm component.
acceptance_criteria:
  - index: 1
    text: Make task prop optional in TaskDetailsModal to support create mode
    checked: false
  - index: 2
    text: >-
      Add title field editing when in create mode (currently title is only in
      header)
    checked: false
  - index: 3
    text: Add onArchive prop and handler to TaskDetailsModal interface
    checked: false
  - index: 4
    text: Add archive button at bottom of right sidebar (below Dependencies section)
    checked: false
  - index: 5
    text: 'Show archive button only when editing existing task, not when creating'
    checked: false
  - index: 6
    text: Update App.tsx to use TaskDetailsModal for both create and edit modes
    checked: false
  - index: 7
    text: Handle form validation for required fields when creating new task
    checked: false
  - index: 8
    text: >-
      Preserve all existing UX improvements (preview mode, inline editing,
      keyboard shortcuts)
    checked: false
  - index: 9
    text: Test both create and edit flows work correctly with all features
    checked: false
  - index: 10
    text: Remove TaskForm component after migration is complete
    checked: false
definition_of_done: []
comments: []
---
