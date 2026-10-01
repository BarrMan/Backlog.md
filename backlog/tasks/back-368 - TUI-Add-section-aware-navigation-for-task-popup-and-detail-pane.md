---
task_schema_version: 2
id: BACK-368
title: 'TUI: Add section-aware navigation for task popup and detail pane'
status: To Do
assignee:
  - '@codex'
created_date: '2026-01-19 21:32'
labels:
  - tui
  - ux
  - enhancement
dependencies: []
documentation:
  - src/ui/board.ts
  - src/ui/task-viewer-with-search.ts
  - src/ui/sequences.ts
  - src/ui/task-viewer-with-search.ts#L1118
priority: medium
description: >-
  ### Why

  Scrolling long task details is slow and disorienting in the TUI. Users lose
  context and have to hold the arrow key to reach the bottom, especially in the
  kanban task popup and the task list detail pane. We need fast, discoverable
  navigation that preserves orientation while reading sectioned task content.


  ### What

  Provide section-aware navigation in both the kanban task popup and the task
  list detail pane so users can quickly jump between structured sections and see
  where they are in the document. Navigation should rely on common keys (not
  Page Up/Down), and the UI should indicate the current/next section as the user
  scrolls.
acceptance_criteria:
  - index: 1
    text: >-
      Both the kanban task popup and the task list detail pane expose a
      section-aware navigation affordance (e.g., indicator or list) tied to the
      structured sections in a task.
    checked: false
  - index: 2
    text: >-
      Users can jump between sections using common keyboard shortcuts that are
      shown in the UI help/legend (no Page Up/Down requirement).
    checked: false
  - index: 3
    text: >-
      As the user scrolls, the UI shows which section is currently in view (or
      the next section boundary).
    checked: false
  - index: 4
    text: >-
      Behavior works with tasks that include Description, Implementation Plan,
      Implementation Notes, Final Summary, and checklists.
    checked: false
  - index: 5
    text: No regression to existing navigation or scrolling behavior in the TUI.
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
