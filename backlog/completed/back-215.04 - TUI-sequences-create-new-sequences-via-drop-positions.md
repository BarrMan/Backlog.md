---
task_schema_version: 2
id: BACK-215.04
title: 'TUI sequences: create new sequences via drop positions'
status: Done
assignee:
  - '@codex'
created_date: '2025-08-23 19:12'
updated_date: '2025-08-26 19:25'
labels:
  - sequences
dependencies: []
parent_task_id: task-215
description: >-
  Allow creating a new sequence by placing a task between existing sequences
  (top/bottom included) and update dependencies accordingly.
implementation_plan: >-
  1. Core: add insert-between helper updating moved deps and next-sequence deps;
  handle K=0/K=N; dedup; anchor with ordinal when needed\n2. UI: move mode shows
  drop zones (Before Seq 1, Between K and K+1, After last); arrows cycle;
  highlight borders; footer shows target\n3. Apply: Enter applies insert-between
  via core helper; Unsequenced remains separate; Esc cancels\n4. Recompute:
  persist changed tasks, recompute sequences, rerender\n5. Edge cases: no
  sequences (anchor with ordinal), avoid self-deps, idempotent updates\n6.
  Verify ACs: drop zones visibility, new Sequence K+1 created, deps updated,
  clear indicators, cancel works
implementation_notes: >-
  Added insert-between drop zones only between numbered sequences; removed
  top/bottom zones and Shift shortcuts; implemented overlays with clear labels;
  fixed highlighting to avoid adjacent sequence highlight; used bold yellow
  border to emphasize targeted sequence; Enter applies insertion via
  adjustDependenciesForInsertBetween, Esc cancels; recompute + rerender after
  apply. Verified with type checks, lint, and tests.
acceptance_criteria:
  - index: 1
    text: >-
      Show drop zones only between numbered sequences (Unsequenced is not a
      sequence)
    checked: true
  - index: 2
    text: >-
      Dropping between Sequence K and K+1 creates a new Sequence K+1 containing
      the moved task; sequences at and after K+1 shift down by one
    checked: true
  - index: 3
    text: >-
      Dependencies updated: moved task depends on prior sequence (K); all tasks
      in the next sequence depend on the moved task
    checked: true
  - index: 4
    text: Clear visual drop indicators while moving; apply on drop; cancel with Esc
    checked: true
definition_of_done: []
comments: []
---
