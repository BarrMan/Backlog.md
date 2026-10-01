---
task_schema_version: 2
id: BACK-273.01
title: '273.01: Migrate domain types to rawContent'
status: Done
assignee:
  - '@codex'
created_date: '2025-09-19 18:33'
updated_date: '2025-09-19 19:47'
labels:
  - core
  - types
  - search
dependencies: []
parent_task_id: task-273
description: >-
  Rename legacy markdown fields across Task/Document/Decision to use rawContent
  and remove the remaining acceptanceCriteria string arrays. Update parsing,
  serialization, file-system loaders, and every consumer (CLI, TUI, web, tests)
  so the new shape is the single source of truth.
implementation_notes: >-
  - Replaced body fields with rawContent on Task/Document/Decision types and
  removed legacy acceptanceCriteria arrays.

  - Updated parser/serializer, filesystem loaders, and all CLI/TUI/web/server
  consumers to the new structure.

  - CLI now mutates acceptanceCriteriaItems directly instead of re-parsing
  markdown.

  - Tests: bun run check ., bunx tsc --noEmit, bun test.
acceptance_criteria:
  - index: 1
    text: >-
      Task, Document, and Decision types expose rawContent instead of body and
      no longer expose legacy acceptanceCriteria arrays.
    checked: true
  - index: 2
    text: >-
      Markdown parser and serializer round-trip rawContent and structured
      sections without regressions.
    checked: true
  - index: 3
    text: >-
      All references compile after the rename (bunx tsc --noEmit) and
      lint/format pass (bun run check .).
    checked: true
  - index: 4
    text: >-
      Existing tests updated to target rawContent (bun test target for affected
      suites).
    checked: true
definition_of_done: []
comments: []
---
