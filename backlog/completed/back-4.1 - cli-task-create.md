---
task_schema_version: 2
id: BACK-4.1
title: 'CLI: Task Creation Commands'
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
  - task-3
parent_task_id: task-4
description: >-
  Implement commands for creating tasks, drafts, and subtasks:


  - `backlog task create` to add active tasks.

  - `backlog draft create` to create tasks in draft mode.

  - `backlog task create --parent <task-id>` to create a subtask under an
  existing task.
acceptance_criteria:
  - index: 1
    text: Commands create Markdown files in the correct directories.
    checked: true
  - index: 2
    text: Required metadata is captured from flags or prompts.
    checked: true
  - index: 3
    text: Subtasks are saved using decimal IDs under `.backlog/tasks/`.
    checked: true
  - index: 4
    text: Changes are committed with a descriptive message.
    checked: true
definition_of_done: []
comments: []
---
