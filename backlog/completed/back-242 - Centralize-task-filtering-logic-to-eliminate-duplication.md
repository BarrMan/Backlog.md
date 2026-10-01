---
task_schema_version: 2
id: BACK-242
title: Centralize task filtering logic to eliminate duplication
status: Done
assignee:
  - '@codex'
created_date: '2025-08-23 18:46'
updated_date: '2025-08-26 20:29'
labels:
  - refactoring
  - backend
  - cli
dependencies: []
ordinal: 0
description: >-
  Both the CLI task list command and the web server handlers implement their own
  task filtering by status and assignee. This duplication suggests the need for
  a shared filtering utility or an extension to FileSystem.listTasks that
  accepts filter criteria so both interfaces can reuse the logic.
implementation_notes: >-
  Centralized task filtering by status and assignee in
  FileSystem.listTasks(filter). Updated CLI task list and server task listing to
  reuse shared filtering. Added unit tests covering status and assignee filters.
  All tests pass.
acceptance_criteria:
  - index: 1
    text: >-
      Filtering by status and assignee is centralized in a shared helper or
      FileSystem API
    checked: true
  - index: 2
    text: CLI task list uses the shared filtering mechanism
    checked: true
  - index: 3
    text: Server task listing uses the shared filtering mechanism
    checked: true
  - index: 4
    text: Unit tests cover filtering for status and assignee
    checked: true
definition_of_done: []
comments: []
---
