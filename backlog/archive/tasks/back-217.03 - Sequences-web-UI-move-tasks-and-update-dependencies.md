---
task_schema_version: 2
id: BACK-217.03
title: 'Sequences web UI: move tasks and update dependencies'
status: To Do
assignee: []
created_date: '2025-08-23 19:13'
updated_date: '2026-07-04 17:40'
labels:
  - sequences
dependencies: []
parent_task_id: BACK-217
description: >-
  Enable moving tasks within/between sequences; call the move endpoint to update
  dependencies and refresh state.
implementation_notes: sequences feature removed by owner decision
acceptance_criteria:
  - index: 1
    text: >-
      Dragging (or keyboard) moves tasks using join semantics: set moved deps to
      previous sequence only; other tasks unchanged
    checked: false
  - index: 2
    text: >-
      Moving to Unsequenced allowed only if task is isolated; otherwise show
      clear error and do not move
    checked: false
  - index: 3
    text: >-
      After move, refresh state from server and preserve scroll/focus; provide
      success feedback
    checked: false
definition_of_done: []
comments: []
---
