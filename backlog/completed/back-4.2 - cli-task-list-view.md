---
task_schema_version: 2
id: BACK-4.2
title: 'CLI: Task Listing and Viewing'
status: Done
assignee:
  - '@MrLesk'
reporter: '@MrLesk'
created_date: '2025-06-04'
labels:
  - cli
  - command
milestone: m-1
dependencies:
  - task-4.1
parent_task_id: task-4
description: >-
  Add commands to browse tasks:


  - `backlog task list` / `backlog tasks list` to show tasks.

  - `backlog task view <task-id>` or `backlog task <task-id>` to show a specific
  task.
acceptance_criteria:
  - index: 1
    text: Listing shows tasks grouped by status.
    checked: true
  - index: 2
    text: Viewing displays task details with Markdown formatting.
    checked: true
  - index: 3
    text: Commands do not modify task files.
    checked: true
definition_of_done: []
comments: []
---
