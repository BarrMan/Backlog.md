---
task_schema_version: 2
id: BACK-302
title: Support flexible ID formats for tasks and docs
status: Done
assignee:
  - '@codex'
created_date: '2025-10-17 22:09'
updated_date: '2025-10-18 20:30'
labels: []
dependencies: []
description: >-
  Align ID parsing with Issue #404 requirements so CLI, MCP, and APIs accept
  variations. Implement parsing normalization once in shared utilities and
  ensure both task and document lookups use it.
implementation_plan: >-
  1. Add shared ID normalization helpers that handle prefix casing and numeric
  padding.

  2. Refactor task/document lookup paths (CLI, core, filesystem, MCP, server) to
  use the helpers.

  3. Expand unit and integration tests to cover uppercase/padded inputs across
  tasks and documents.
implementation_notes: >-
  - Task and document comparisons now rely on dedicated helpers
  (`src/utils/task-path.ts` and `src/utils/document-id.ts`) so every caller
  works through a single normalization/equality path.

  - CLI commands use `Core.getDocumentContent`/`Core.loadTaskById` to avoid
  touching the filesystem directly; `loadTaskById` exists specifically to bypass
  long-lived watchers so short-lived CLI processes (and Windows CI) exit
  cleanly.

  - ID normalization is applied at construction-time (task creation, document
  saves) and whenever dependencies/parents are parsed, preventing accidental
  mixed-prefix storage.

  - Added MCP/server bindings to those helpers, so task/document tools accept
  case-insensitive and zero-padded IDs without duplicating logic.

  - Pending: coordinate with Claude for an additional review as requested.


  - Verified flexible ID handling for CLI, MCP, server, and filesystem pathways.
acceptance_criteria:
  - index: 1
    text: >-
      Task lookup accepts TASK-<id>, task-<id>, bare numeric id, and zero-padded
      variants.
    checked: true
  - index: 2
    text: >-
      Document lookup accepts DOC-<id>, doc-<id>, bare numeric id, and
      zero-padded variants.
    checked: true
  - index: 3
    text: Tests cover new parsing helper for both tasks and documents.
    checked: true
definition_of_done: []
comments: []
---
