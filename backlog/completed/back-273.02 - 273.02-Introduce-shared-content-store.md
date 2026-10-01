---
task_schema_version: 2
id: BACK-273.02
title: '273.02: Introduce shared content store'
status: Done
assignee:
  - '@codex'
created_date: '2025-09-19 18:33'
updated_date: '2025-09-19 21:37'
labels:
  - core
  - infra
  - search
dependencies: []
parent_task_id: task-273
description: >-
  Create a core content store that eagerly loads tasks, documents, and decisions
  once per process and keeps them in sync via file system watchers. Expose
  subscription and snapshot APIs so CLI, TUI, and the Bun server can consume a
  single cache.
implementation_notes: >-
  - Added ContentStore with Bun-aware recursive watcher fallback for
  tasks/docs/decisions.

  - Exposed Core.getContentStore() for future consumers without reintroducing
  legacy body payloads.

  - Added targeted tests covering initialization plus incremental updates for
  tasks, nested docs, and decisions.

  - bun test, bunx tsc --noEmit, bun run check .
acceptance_criteria:
  - index: 1
    text: >-
      Content store loads tasks/docs/decisions on startup and exposes typed
      getters plus an event/subscription API.
    checked: true
  - index: 2
    text: >-
      File change events (tasks, docs, decisions) trigger in-memory updates
      without reloading everything.
    checked: true
  - index: 3
    text: >-
      Existing loaders (CLI list, server handlers) can opt into the store
      without breaking current behavior; legacy direct FS calls are wrapped or
      routed through the store.
    checked: true
  - index: 4
    text: >-
      bun run check ., bunx tsc --noEmit, and targeted bun test suites pass for
      the new store.
    checked: true
definition_of_done: []
comments: []
---
