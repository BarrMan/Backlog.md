---
task_schema_version: 2
id: BACK-282
title: Fix TUI detail pane loading state regression
status: Done
assignee:
  - '@codex'
created_date: '2025-09-29 20:29'
updated_date: '2025-09-30 19:26'
labels:
  - bug
dependencies: []
priority: medium
description: >-
  The TUI task detail pane sometimes displays a persistent “Loading task
  content…” placeholder even though task data is local. This happens when rapid
  selection changes cause older read operations to be cancelled via the stale
  request guard, leaving the shared detailLoading flag stuck at true.


  We need to reset the loading flag when a request is superseded so the UI never
  shows the placeholder indefinitely.
implementation_notes: >-
  - Added a pending-load counter so superseded reads clear the loading
  placeholder only after all requests settle.

  - Confirmed the detail pane stops showing the placeholder once file reads
  finish, even after rapid navigation and filter changes.

  - Tests: bun test


  - Replaced legacy task viewer with the search-enabled version across the
  CLI/TUI and exported shared helpers from a single module.


  - Restored list↔detail focus handling so borders highlight correctly and
  left/right navigation works in the enhanced viewer.


  - Restored Esc handling in kanban detail popup and auto-focuses the content
  area so closing works consistently.


  - Show an explicit no-results message in the detail pane and suppress stale
  task details when filters return zero items.


  - Fixed Kanban popup focus so arrow/PageUp/PageDown scroll again and the list
  detail view shows a contextual “no results” message when filters empty the
  list.


  - Reworked pane highlighting to follow blessed focus defaults and kept
  scrolling keys responsive in both list/detail and kanban popup.
acceptance_criteria:
  - index: 1
    text: >-
      Reproduce the regression and confirm the loading placeholder appears only
      while content is actually being read.
    checked: true
  - index: 2
    text: >-
      Ensure rapid selection changes and filter toggles update the detail pane
      without leaving stale loading text.
    checked: true
  - index: 3
    text: >-
      Add automated coverage or regression test if feasible, or document manual
      verification steps.
    checked: true
definition_of_done: []
comments: []
---
