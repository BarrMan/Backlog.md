---
task_schema_version: 2
id: BACK-283
title: Fix TUI board duplicating cards after external status changes
status: Done
assignee:
  - '@codex'
created_date: '2025-10-03 19:08'
updated_date: '2025-10-03 19:16'
labels: []
dependencies: []
description: >-
  ## Summary

  Fix the TUI Kanban board so that when task statuses are toggled via CLI while
  the board is open, columns do not visually show duplicate cards.


  ## Context

  See GitHub issue https://github.com/MrLesk/Backlog.md/issues/383.


  ## Notes

  - Ensure rendering updates fully replace stale list entries.

  - Validate against toggling tasks between In Progress and Done while the TUI
  is open.
implementation_notes: >-
  - Adjusted board refresh logic to trigger a full column rebuild whenever task
  membership or ordering changes, preventing stale rows from lingering in the
  TUI.

  - Added unit coverage for the new rebuild heuristic to guard regression
  scenarios.

  - Verified fix manually by flipping task statuses while the TUI runs and ran
  bun run check ., bunx tsc --noEmit, bun test.
acceptance_criteria:
  - index: 1
    text: >-
      Reproduce the issue by flipping a task status via CLI while TUI is open
      and confirm no duplicate cards remain.
    checked: true
  - index: 2
    text: Add automated coverage or a regression script to guard against stale rows.
    checked: true
  - index: 3
    text: Document the fix in the task notes.
    checked: true
definition_of_done: []
comments: []
---
