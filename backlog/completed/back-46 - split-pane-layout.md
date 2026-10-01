---
task_schema_version: 2
id: BACK-46
title: Split-pane layout
status: Done
assignee: []
created_date: '2025-06-11'
updated_date: '2025-06-13'
labels:
  - enhancement
dependencies: []
description: |-
  Goal: List on the left, detail on the right.

  Detailed work:
  - Add a parent grid layout, 30% width left / 70% right.
  - Left pane lists tasks; right pane shows currently selected task detail.
  - Arrow keys change list selection and refresh detail pane.
acceptance_criteria:
  - index: 1
    text: Down-arrow changes highlight and updates detail.
    checked: true
  - index: 2
    text: Resizing keeps the 30/70 ratio within ±2 columns.
    checked: true
definition_of_done: []
comments: []
---
