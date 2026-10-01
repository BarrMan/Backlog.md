---
task_schema_version: 2
id: BACK-470.1
title: Core task comment model and markdown persistence
status: Done
assignee:
  - '@codex'
created_date: '2026-05-31 17:32'
updated_date: '2026-05-31 17:59'
labels:
  - comments
  - core
  - markdown
  - search
dependencies: []
documentation:
  - src/types/index.ts
  - src/markdown/structured-sections.ts
  - src/markdown/parser.ts
  - src/markdown/serializer.ts
  - src/core/backlog.ts
  - src/core/search-service.ts
  - src/utils/task-search.ts
  - src/test/task-edit-preservation.test.ts
  - src/test/search-service.test.ts
parent_task_id: BACK-470
priority: medium
ordinal: 27000
description: >-
  Add the shared task comment capability underneath all public surfaces. A task
  comment is an ordered task-level entry with body text, timestamp, and optional
  author. Existing task files without comments must continue to parse and save
  normally, and unrelated task updates must preserve comments.
implementation_plan: >-
  1. Extend task domain types with structured append-only comments and task
  update input for comment appends.

  2. Add parsing/serialization support for a sentinel-delimited `## Comments`
  section, preserving legacy/no-comment tasks and markdown headings in comment
  bodies.

  3. Route comment append behavior through the existing core task update path so
  CLI, MCP, and server can share it.

  4. Include comment text in shared search indexes.

  5. Add focused tests for parse/serialize, preservation during unrelated edits,
  append behavior, section ordering, and search.
implementation_notes: >-
  Implemented shared task comment model, sentinel-delimited markdown
  persistence, parser/serializer integration, core append handling, and search
  indexing. Validation rejects reserved comment markers so malformed comment
  bodies cannot corrupt the structured comments section.
final_summary: >-
  Added the shared comment model and markdown persistence layer. Comments parse
  as ordered structured entries, append through the core task update path,
  survive unrelated edits, preserve markdown headings inside bodies, and
  participate in both task search implementations.
acceptance_criteria:
  - index: 1
    text: >-
      Loading a task with comments returns ordered structured comment data with
      body, timestamp, author when present, and stable display order.
    checked: true
  - index: 2
    text: >-
      Saving or editing unrelated task fields preserves comments without
      duplicating comments or reordering existing structured sections.
    checked: true
  - index: 3
    text: >-
      Adding a comment through the shared task update path assigns a stable
      identifier or index, records a timestamp, supports markdown body text, and
      updates the task updated date.
    checked: true
  - index: 4
    text: Comment text participates in the shared task search index.
    checked: true
  - index: 5
    text: >-
      Tests cover comment parsing, serialization, append behavior, unrelated
      edit preservation, section ordering, and tasks with markdown headings
      inside comment bodies.
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
