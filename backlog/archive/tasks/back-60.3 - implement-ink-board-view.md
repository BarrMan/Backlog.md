---
task_schema_version: 2
id: BACK-60.3
title: Implement Ink board view
status: To Do
assignee: []
created_date: '2025-06-14'
labels:
  - cli
dependencies: []
parent_task_id: task-60
description: >-
  Port the Kanban board UI to an Ink component. Reuse existing ASCII board
  generator but display inside <Scrollable>.
acceptance_criteria:
  - index: 1
    text: Board view renders using Ink
    checked: false
  - index: 2
    text: Supports horizontal and vertical layouts
    checked: false
  - index: 3
    text: Fallback to plain text when not TTY
    checked: false
definition_of_done: []
comments: []
---
