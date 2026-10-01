---
task_schema_version: 2
id: BACK-52
title: 'CLI: Filter tasks list by status or assignee'
status: Done
assignee:
  - '@codex'
created_date: '2025-06-13'
updated_date: '2025-06-13'
labels: []
dependencies: []
description: Add filtering options to task list command
implementation_notes: >-
  Added filtering options to `backlog task list` command in
  `src/cli.ts:253-268`:

  - `--status <status>`: Filters tasks by exact status match

  - `--assignee <assignee>`: Filters tasks by assignee (checks if user is in
  assignee array)


  Both filters can be used together. Works with `--plain` and interactive UI
  modes.


  Tests added in `src/test/cli.test.ts:265-339` verify both filtering options.
acceptance_criteria:
  - index: 1
    text: '`backlog task list --status "To Do"` filters by status'
    checked: true
  - index: 2
    text: '`backlog task list --assignee user` filters by assignee'
    checked: true
definition_of_done: []
comments: []
---
