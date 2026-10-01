---
task_schema_version: 2
id: BACK-185
title: Fix task listing incorrectly including README.md files
status: Done
assignee:
  - '@claude'
created_date: '2025-07-13'
labels: []
dependencies: []
description: >-
  Task listing was incorrectly fetching README.md and showing it as a broken
  task due to overly broad file patterns in utility functions. The issue was
  causing non-task markdown files to appear in task lists and fail parsing,
  creating a confusing user experience.
implementation_notes: >-
  Fixed by updating task-path.ts utility functions to use specific 'task-*.md'
  pattern instead of broad '*.md' pattern. This ensures only actual task files
  are discovered by the task management system while excluding README.md and
  other documentation files.
acceptance_criteria:
  - index: 1
    text: README.md files are no longer picked up by task listing functions
    checked: true
  - index: 2
    text: >-
      Task utility functions use specific 'task-*.md' pattern instead of broad
      '*.md' pattern
    checked: true
  - index: 3
    text: Existing task functionality remains unaffected
    checked: true
  - index: 4
    text: >-
      All task listing operations (active, drafts, archived, completed) use
      consistent patterns
    checked: true
definition_of_done: []
comments: []
---
