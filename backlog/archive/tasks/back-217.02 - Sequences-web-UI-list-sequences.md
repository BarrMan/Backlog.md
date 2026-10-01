---
task_schema_version: 2
id: BACK-217.02
title: 'Sequences web UI: list sequences'
status: To Do
assignee: []
created_date: '2025-08-23 19:13'
updated_date: '2026-07-04 17:40'
labels:
  - sequences
dependencies: []
parent_task_id: BACK-217
description: >-
  Add a Sequences page that fetches data from the server and displays sequences
  vertically with clear labeling.
implementation_notes: sequences feature removed by owner decision
acceptance_criteria:
  - index: 1
    text: Sequences page reachable from navigation
    checked: false
  - index: 2
    text: Displays sequences from server with task titles
    checked: false
  - index: 3
    text: Handles empty/large datasets gracefully
    checked: false
  - index: 4
    text: >-
      Page renders Unsequenced bucket first (when present), then numbered
      sequences
    checked: false
  - index: 5
    text: Handles large/empty datasets; no layout jitter when Unsequenced is absent
    checked: false
definition_of_done: []
comments: []
---
