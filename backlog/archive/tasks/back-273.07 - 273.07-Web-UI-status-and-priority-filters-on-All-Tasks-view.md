---
task_schema_version: 2
id: BACK-273.07
title: '273.07: Web UI status and priority filters on All Tasks view'
status: To Do
assignee: []
created_date: '2025-09-21 18:13'
updated_date: '2025-09-21 18:13'
labels:
  - web
  - ui
  - search
dependencies:
  - task-273.05
parent_task_id: task-273
priority: medium
description: >-
  Add status and priority filter dropdowns to the All Tasks view in the web UI,
  similar to the TUI implementation. These should connect to the centralized
  search service via the server endpoints established in task-273.05.
acceptance_criteria:
  - index: 1
    text: All Tasks view displays status filter dropdown with live filtering
    checked: false
  - index: 2
    text: All Tasks view displays priority filter dropdown with live filtering
    checked: false
  - index: 3
    text: Filters use the same status/priority values as CLI and TUI for consistency
    checked: false
  - index: 4
    text: >-
      Filter state is preserved when navigating between tasks and returning to
      All Tasks view
    checked: false
  - index: 5
    text: >-
      Filters work in combination (can filter by both status AND priority
      simultaneously)
    checked: false
  - index: 6
    text: >-
      Filter changes update the URL query parameters for bookmarkable filtered
      views
    checked: false
  - index: 7
    text: Clear/reset functionality to remove all active filters
    checked: false
  - index: 8
    text: 'Filtered task count is displayed (e.g., ''Showing 5 of 23 tasks'')'
    checked: false
definition_of_done: []
comments: []
---
