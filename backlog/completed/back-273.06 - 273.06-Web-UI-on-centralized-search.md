---
task_schema_version: 2
id: BACK-273.06
title: '273.06: Web UI on centralized search'
status: Done
assignee:
  - '@codex'
created_date: '2025-09-19 18:34'
updated_date: '2025-09-21 21:35'
labels:
  - web
  - search
  - ui
dependencies: []
parent_task_id: task-273
description: >-
  Update the React app to consume search results from the new API/store, remove
  local Fuse usage, and add the search field plus status/priority dropdowns to
  the task list header with shared filter behavior and highlight links
  preserved.
implementation_notes: >-
  - Web app loads tasks/documents/decisions via the centralized search snapshot
  (replaces direct REST loaders).

  - All Tasks view now calls /api/search for search/status/priority filtering
  with URL sync, counts, and clear/reset controls.

  - Sidebar search uses the shared search API (no in-browser Fuse) with
  debounce, loading, and empty/error states.

  - Tests: bun run check ., bunx tsc --noEmit, bun test.
acceptance_criteria:
  - index: 1
    text: >-
      Sidebar and All Tasks list load data via the centralized API/search
      service without any in-browser Fuse index.
    checked: true
  - index: 2
    text: >-
      Task list header displays a shared search input plus status and priority
      dropdowns wired to the centralized search/filter API.
    checked: true
  - index: 3
    text: >-
      Dropdown filters reuse the same status and priority values as CLI/TUI and
      support combined filtering alongside search.
    checked: true
  - index: 4
    text: >-
      Filter state (search, status, priority) persists when navigating between
      task details and returning to the All Tasks view.
    checked: true
  - index: 5
    text: >-
      Filter changes update the URL query parameters so filtered views remain
      bookmarkable.
    checked: true
  - index: 6
    text: >-
      Interface exposes a clear/reset control that removes all active search and
      filter inputs.
    checked: true
  - index: 7
    text: >-
      All Tasks view displays a 'Showing X of Y tasks' style count while
      preserving highlight and deep-link behavior from search results.
    checked: true
  - index: 8
    text: >-
      bun run check ., bunx tsc --noEmit, and bun test cover the updated
      components.
    checked: true
definition_of_done: []
comments: []
---
