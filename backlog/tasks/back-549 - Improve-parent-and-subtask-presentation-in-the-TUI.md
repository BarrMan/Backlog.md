---
task_schema_version: 2
id: BACK-549
title: Improve parent and subtask presentation in the TUI
status: To Do
assignee: []
created_date: '2026-07-16 21:50'
labels: []
dependencies: []
ordinal: 196000
description: >-
  Improve how the TUI presents existing parent and subtask relationships across
  list, board, and task detail views. Make hierarchy, status, progress, and
  keyboard navigation clear in normal and narrow terminals while preserving the
  current task model and mutation behavior.
acceptance_criteria:
  - index: 1
    text: >-
      List, board, and task detail views clearly distinguish parent tasks from
      child tasks and show each related task’s ID, title, and status.
    checked: false
  - index: 2
    text: >-
      Parent progress summarizes completed children using the project’s
      configured terminal-status semantics, while tasks with no children retain
      an uncluttered no-child state.
    checked: false
  - index: 3
    text: >-
      Keyboard navigation between parent and child tasks preserves predictable
      selection, scrolling, focus, and focus return when entering and leaving
      details.
    checked: false
  - index: 4
    text: >-
      Children in different statuses, tasks with many children, and tasks with
      nested descendants remain discoverable and readable across list, board,
      and detail views.
    checked: false
  - index: 5
    text: >-
      The change does not alter task or subtask creation, editing, ordering,
      movement behavior, or the semantics of parent-child relationships.
    checked: false
  - index: 6
    text: >-
      Normal and narrow terminal layouts avoid clipping hierarchy, identifiers,
      status, progress, and navigation cues, and their contextual help remains
      usable.
    checked: false
  - index: 7
    text: >-
      Rendered QA covers list, board, and task detail views in normal and narrow
      terminals for no-child, cross-status, many-child, and nested-child cases.
    checked: false
  - index: 8
    text: >-
      Automated tests cover hierarchy rendering, terminal-status progress,
      keyboard navigation, selection and focus return, and no-child,
      cross-status, many-child, nested, and narrow-layout edge cases.
    checked: false
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: false
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: false
  - index: 3
    text: bun test (or scoped test) passes
    checked: false
comments: []
---
