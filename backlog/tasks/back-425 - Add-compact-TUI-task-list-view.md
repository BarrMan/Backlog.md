---
task_schema_version: 2
id: BACK-425
title: Add compact TUI task list view
status: To Do
assignee:
  - '@alex-agent'
created_date: '2026-04-25 12:14'
labels:
  - tui
  - enhancement
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/509'
priority: low
description: >-
  Track GitHub issue #509: provide a compact terminal task list that summarizes
  tasks and opens details on demand.
acceptance_criteria:
  - index: 1
    text: A compact TUI list summarizes tasks without opening the full board layout.
    checked: false
  - index: 2
    text: >-
      Selecting a task opens the existing task detail view or a modal with full
      details.
    checked: false
  - index: 3
    text: Core filters and navigation remain usable in the compact view.
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
