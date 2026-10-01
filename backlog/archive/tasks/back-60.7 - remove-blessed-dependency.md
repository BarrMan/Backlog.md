---
task_schema_version: 2
id: BACK-60.7
title: Remove blessed dependency
status: To Do
assignee: []
created_date: '2025-06-14'
labels:
  - cli
dependencies: []
parent_task_id: task-60
description: 'Delete blessed-specific code, types and tests. Update CI and package.json.'
acceptance_criteria:
  - index: 1
    text: blessed removed from dependencies and bun.lock
    checked: false
  - index: 2
    text: Build and tests pass without blessed
    checked: false
  - index: 3
    text: Documentation updated
    checked: false
definition_of_done: []
comments: []
---
