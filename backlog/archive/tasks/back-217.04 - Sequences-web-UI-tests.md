---
task_schema_version: 2
id: BACK-217.04
title: 'Sequences web UI: tests'
status: To Do
assignee: []
created_date: '2025-08-23 19:13'
updated_date: '2026-07-04 17:40'
labels:
  - sequences
dependencies: []
parent_task_id: BACK-217
description: >-
  Add tests verifying sequences render correctly and move flows trigger
  appropriate API calls and UI updates.
implementation_notes: sequences feature removed by owner decision
acceptance_criteria:
  - index: 1
    text: Rendering tests validate list page behavior
    checked: false
  - index: 2
    text: Move flow tests verify API calls and UI updates
    checked: false
  - index: 3
    text: No regressions in existing UI tests
    checked: false
  - index: 4
    text: Tests cover Unsequenced rendering and sequencing order in the web UI
    checked: false
  - index: 5
    text: >-
      Tests cover join semantics and blocked moves to Unsequenced (isolated
      only)
    checked: false
  - index: 6
    text: >-
      No regressions; large datasets scroll smoothly and preserve focus after
      move
    checked: false
definition_of_done: []
comments: []
---
