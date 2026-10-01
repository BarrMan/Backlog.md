---
task_schema_version: 2
id: BACK-275
title: Show all configured status columns in TUI kanban board
status: To Do
assignee: []
created_date: '2025-09-26 19:06'
labels: []
dependencies: []
priority: high
description: >-
  The TUI kanban board currently only displays columns for statuses that have
  tasks, hiding empty status columns. This is inconsistent with the web UI which
  shows all configured statuses regardless of task presence. Empty columns need
  to be visible for users to understand the full workflow and to enable dragging
  tasks to empty statuses. The TUI should read the configured statuses from the
  project configuration and display all columns, showing "No tasks in [Status]"
  for empty ones, matching the web UI behavior.
acceptance_criteria:
  - index: 1
    text: Read configured statuses from backlog.yml config
    checked: false
  - index: 2
    text: Update prepareBoardColumns to include all configured statuses
    checked: false
  - index: 3
    text: 'Ensure empty columns display with ''No tasks in [Status]'' message'
    checked: false
  - index: 4
    text: Maintain proper column width distribution for all columns
    checked: false
  - index: 5
    text: Preserve existing task sorting and grouping logic
    checked: false
  - index: 6
    text: Test with various status configurations including custom statuses
    checked: false
definition_of_done: []
comments: []
---
