---
task_schema_version: 2
id: BACK-459
title: Add priority sorting to Kanban columns
status: Done
assignee:
  - '@codex'
created_date: '2026-05-02 07:42'
updated_date: '2026-05-02 17:58'
labels: []
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/pull/626'
modified_files:
  - src/web/components/TaskColumn.tsx
  - src/test/web-task-column-sort.test.tsx
  - src/web/styles/style.css
priority: high
description: ''
implementation_notes: >-
  Added a column actions menu that emits a full-column reorder payload sorted by
  priority, reusing the existing task priority sorter. The action delegates
  persistence to the existing reorder endpoint, which writes ordinals back to
  the task markdown files.
final_summary: >-
  Implemented a new 'Sort by Priority' action in the Kanban column header menu.
  The action reorders tasks by High > Medium > Low > None, sends the sorted task
  IDs through the existing reorder API, and persists the new order through the
  existing ordinal system. Added focused React/JSDOM coverage for the emitted
  reorder payload.
acceptance_criteria:
  - index: 1
    text: Column header should have a menu button
    checked: true
  - index: 2
    text: Dropdown menu should have 'Sort by Priority' option
    checked: true
  - index: 3
    text: Tasks in column should be reordered by High > Medium > Low > None
    checked: true
  - index: 4
    text: New order should be persisted to Markdown files via ordinals
    checked: true
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: true
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: true
  - index: 3
    text: bun test (or scoped test) passes
    checked: true
comments: []
---
