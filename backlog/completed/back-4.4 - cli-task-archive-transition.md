---
task_schema_version: 2
id: BACK-4.4
title: 'CLI: Task Archiving and State Transitions'
status: Done
assignee:
  - '@MrLesk'
reporter: '@MrLesk'
created_date: '2025-06-04'
updated_date: '2025-06-08'
labels:
  - cli
  - command
milestone: m-1
dependencies:
  - task-4.1
parent_task_id: task-4
description: |-
  Add commands for finalizing and moving tasks:

  - `backlog task archive <task-id>` and `backlog draft archive <task-id>`
  - `backlog draft promote` (move a draft to tasks)
  - `backlog task demote` (move a task back to drafts)
acceptance_criteria:
  - index: 1
    text: Archived tasks are moved to `.backlog/archive/` with history preserved.
    checked: true
  - index: 2
    text: Promote/demote commands relocate files between drafts and tasks.
    checked: true
  - index: 3
    text: Commits clearly state the action performed.
    checked: true
definition_of_done: []
comments: []
---
