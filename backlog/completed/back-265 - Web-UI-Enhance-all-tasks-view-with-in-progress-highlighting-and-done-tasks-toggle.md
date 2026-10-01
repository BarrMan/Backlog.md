---
task_schema_version: 2
id: BACK-265
title: >-
  Web UI: Enhance all tasks view with in-progress highlighting and done tasks
  toggle
status: Done
assignee:
  - '@web-ui-agent'
created_date: '2025-09-15 17:54'
updated_date: '2025-09-15 17:54'
labels:
  - ui
  - enhancement
dependencies: []
description: >-
  Improve the all tasks view in the web UI to make in-progress tasks visually
  distinct and add a toggle filter to show/hide done tasks (hidden by default)
acceptance_criteria:
  - index: 1
    text: >-
      In-progress tasks are visually distinguished from other tasks in the all
      tasks view
    checked: true
  - index: 2
    text: Toggle filter for done tasks is added to the UI
    checked: true
  - index: 3
    text: Done tasks are hidden by default when the page loads
    checked: true
  - index: 4
    text: Toggle state persists during the session
    checked: true
  - index: 5
    text: >-
      Visual indicators are accessible and work with different themes/color
      schemes
    checked: true
definition_of_done: []
comments: []
---
