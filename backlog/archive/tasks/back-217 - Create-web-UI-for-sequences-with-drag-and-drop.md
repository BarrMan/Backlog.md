---
task_schema_version: 2
id: BACK-217
title: Create web UI for sequences with drag-and-drop
status: To Do
assignee: []
created_date: '2025-07-27'
updated_date: '2026-07-04 17:40'
labels:
  - sequences
  - web-ui
  - frontend
dependencies:
  - task-213
description: >-
  Implement sequences in the web UI together with minimal local server endpoints
  so the feature can be exercised end-to-end. The server acts as a thin bridge
  to the core sequence computation (task-213); all logic remains in core and UI.
implementation_notes: >-
  Align web UI with TUI/CLI: Unsequenced bucket, join semantics, blocked moves
  to Unsequenced unless isolated. Insert-between drop zones tracked separately.


  sequences feature removed by owner decision
acceptance_criteria:
  - index: 1
    text: >-
      Server exposes GET /sequences and POST /sequences/move using
      computeSequences; updates persisted
    checked: false
  - index: 2
    text: Web page lists sequences clearly using server data
    checked: false
  - index: 3
    text: >-
      Users can move tasks within/between sequences; dependencies update via
      server
    checked: false
  - index: 4
    text: Frontend tests cover rendering and move flows
    checked: false
  - index: 5
    text: >-
      Server and UI adopt { unsequenced, sequences } shape; Unsequenced rendered
      first
    checked: false
  - index: 6
    text: >-
      Join semantics in web UI: moving into a sequence sets moved deps to
      previous sequence only; do not modify other tasks
    checked: false
  - index: 7
    text: >-
      Moving to Unsequenced allowed only if task is isolated; show clear error
      otherwise
    checked: false
definition_of_done: []
comments: []
---
