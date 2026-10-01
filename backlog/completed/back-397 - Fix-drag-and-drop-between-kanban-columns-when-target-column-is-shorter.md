---
task_schema_version: 2
id: BACK-397
title: Fix drag-and-drop between kanban columns when target column is shorter
status: Done
assignee:
  - '@codex'
created_date: '2026-02-22 17:22'
updated_date: '2026-02-22 17:22'
labels:
  - bug
  - web-ui
  - kanban
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/543'
  - 'https://github.com/MrLesk/Backlog.md/pull/544'
priority: high
description: >-
  Web Kanban drag-and-drop fails when moving a task from a long source column to
  a shorter adjacent target column unless dropped near the top. Root cause is
  that TaskColumn did not fill the stretched wrapper height, so
  onDragOver/onDrop handlers were not reachable across the full visible column
  area.
final_summary: >-
  Linked issue #543 and PR #544. Verified reproduction on main and confirmed fix
  on PR branch: adding `h-full` to TaskColumn removes wrapper/column height
  mismatch and restores drop targeting across full column height in both All
  Tasks and Milestone modes. Verified build and tests for merge gate.
acceptance_criteria:
  - index: 1
    text: >-
      In All Tasks mode, dragging from the bottom of a long column to a shorter
      adjacent column succeeds
    checked: true
  - index: 2
    text: >-
      In Milestone mode, target columns accept drops across their full visual
      height
    checked: true
  - index: 3
    text: >-
      TaskColumn root fills its wrapper height so drag events are captured in
      stretched regions
    checked: true
  - index: 4
    text: >-
      Build passes with `bun run build` and tests pass with `bun test` in
      CI/expected environment
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
