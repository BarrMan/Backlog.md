---
task_schema_version: 2
id: BACK-452
title: 'Add TUI keyboard shortcuts: Yank, Complete, Archive, and Help Menu'
status: Done
assignee:
  - '@alex-agent'
created_date: '2026-04-28 12:53'
updated_date: '2026-05-03 11:38'
labels: []
dependencies: []
priority: medium
description: >-
  Implement 'y' to yank task ID, 'c' to complete task, 'a' to archive task with
  confirmation, and '?' to show a help popup in the TUI board.
final_summary: >-
  Merged PR #615 after repairing the contributor branch to a scoped BACK-452
  diff, fixing the task-list shortcut state issue, removing an unrelated
  .gitignore update, and addressing Codex feedback by making the shared help
  popup show task-list-specific shortcuts when opened from the task viewer.
  Validation included bunx tsc --noEmit, bun run check ., focused TUI tests,
  full bun test from the worker pass, green GitHub CI across
  macOS/Ubuntu/Windows, and Codex no-major-issues approval.
acceptance_criteria:
  - index: 1
    text: Yank (y/Y) copies task ID to clipboard with footer notification.
    checked: true
  - index: 2
    text: Complete (c/C) shows confirmation popup and moves task to completed.
    checked: true
  - index: 3
    text: Archive (a/A) shows confirmation popup and archives task on success.
    checked: true
  - index: 4
    text: Help (?) shows popup with all keyboard shortcuts.
    checked: true
  - index: 5
    text: 'Footer is updated to include [?] Help.'
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
