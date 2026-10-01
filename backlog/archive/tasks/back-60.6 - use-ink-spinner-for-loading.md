---
task_schema_version: 2
id: BACK-60.6
title: Use Ink spinner for loading
status: To Do
assignee: []
created_date: '2025-06-14'
labels:
  - cli
dependencies: []
parent_task_id: task-60
description: >-
  Simplify loading.ts by replacing blessed screens with an Ink <Spinner>
  component. Provide fallback to console output when not TTY.
acceptance_criteria:
  - index: 1
    text: Loading screens use Ink spinner
    checked: false
  - index: 2
    text: Works when Ink unavailable (non-TTY)
    checked: false
definition_of_done: []
comments: []
---
