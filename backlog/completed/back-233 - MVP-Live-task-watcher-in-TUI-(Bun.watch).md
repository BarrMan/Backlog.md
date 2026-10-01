---
task_schema_version: 2
id: BACK-233
title: 'MVP: Live task watcher in TUI (Bun.watch)'
status: Done
assignee:
  - '@codex'
created_date: '2025-08-17 15:27'
updated_date: '2025-08-26 20:26'
labels:
  - tui
  - watcher
  - mvp
dependencies: []
priority: high
description: >-
  Add live updates to the task list and board UIs by watching the local tasks
  folder with Bun.watch.


  Detect and handle: (1) new task files, (2) edits to existing task files, and
  (3) task removals (moves to completed).


  Update only the affected tasks in the UI while preserving any active filters.


  Watch is enabled by default in interactive TUI views.


  Also extend the local web UI: use a generic watch function in the server to
  detect changes and broadcast a "tasks-updated" event via WebSocket; the React
  app listens and triggers a full tasks refresh on receipt.


  Scope: local tasks folder.
implementation_notes: >-
  Implemented shared Bun.watch-based task watcher utility used by TUI and
  server. TUI unified view performs incremental updates for add/change/remove
  without losing filters; server broadcasts 'tasks-updated' via WebSocket; React
  listens and triggers full refresh. Verified via tests; no regressions
  observed.
acceptance_criteria:
  - index: 1
    text: Use Bun.watch to watch only backlog/tasks (no extra deps)
    checked: true
  - index: 2
    text: >-
      On new task file: appears in task list/board without losing current
      filters
    checked: true
  - index: 3
    text: >-
      On task edit: updates the affected task in task list/board without
      resetting filters
    checked: true
  - index: 4
    text: >-
      On task removal (moved out of tasks): disappears from task list/board;
      selection remains sensible
    checked: true
  - index: 5
    text: Avoid full dataset reload on single-file events (incremental refresh)
    checked: true
  - index: 6
    text: Watch is enabled by default in interactive TUI views
    checked: true
  - index: 7
    text: Create a generic watcher utility shared by TUI and server
    checked: true
  - index: 8
    text: Server uses watcher and broadcasts 'tasks-updated' via WebSocket
    checked: true
  - index: 9
    text: React app listens for 'tasks-updated' and triggers a full tasks refresh
    checked: true
definition_of_done: []
comments: []
---
