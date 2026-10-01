---
task_schema_version: 2
id: BACK-4.3
title: 'CLI: Task Editing'
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
  - task-4.2
parent_task_id: task-4
description: |-
  Implement editing of existing tasks:

  - `backlog task edit <task-id>`
acceptance_criteria:
  - index: 1
    text: 'Updates to title, description, status, labels, and assignee are persisted.'
    checked: true
  - index: 2
    text: The command respects YAML frontmatter formatting.
    checked: true
  - index: 3
    text: A commit records the changes to the task file.
    checked: true
definition_of_done: []
comments: []
---
