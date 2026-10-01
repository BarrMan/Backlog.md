---
task_schema_version: 2
id: BACK-273.03
title: '273.03: Build core Fuse search service'
status: Done
assignee:
  - '@codex'
created_date: '2025-09-19 18:33'
updated_date: '2025-09-20 14:52'
labels:
  - core
  - search
dependencies: []
parent_task_id: task-273
description: >-
  Implement a reusable search module that consumes the shared content store,
  builds a Fuse.js index for tasks, documents, and decisions, and exposes a
  query API that returns a typed SearchResult with optional status and priority
  filters.
implementation_notes: >-
  - Added Fuse-backed SearchService wired to the ContentStore and unified
  SearchResult filtering.

  - Extended shared types and Core accessor so CLI/TUI/server can reuse the
  service.

  - Tests: bunx tsc --noEmit; bun run check .; bun test search-service.test.ts.


  - Reset initialization state when ContentStore fails so retries are possible.
acceptance_criteria:
  - index: 1
    text: >-
      Search service indexes tasks/docs/decisions with rawContent + titles using
      Fuse.js and returns ordered SearchResult objects.
    checked: true
  - index: 2
    text: >-
      Index automatically refreshes when the content store emits updates without
      full reloads.
    checked: true
  - index: 3
    text: >-
      Filtering by status/priority leverages the same service (no separate list
      filtering logic).
    checked: true
  - index: 4
    text: >-
      bun run check ., bunx tsc --noEmit, and targeted bun test suites cover
      search behavior.
    checked: true
definition_of_done: []
comments: []
---
