---
task_schema_version: 2
id: BACK-266
title: Fix Implementation Notes heading truncation in web UI
status: Done
assignee:
  - '@codex'
created_date: '2025-09-16 19:16'
updated_date: '2025-09-17 21:06'
labels:
  - web-ui
  - bug
dependencies: []
priority: high
description: >-
  GitHub issue #356 (https://github.com/MrLesk/Backlog.md/issues/356) reports
  that Markdown headings inside the Implementation Notes section disappear after
  save/view because the parser stops at the next `##`. Update
  parsing/serialization so notes support nested headings without dropping
  content, keeping web UI preview/edit intact.
implementation_plan: >-
  1. Introduce sentinel comments around Implementation Notes when serializing
  and teach the parser to read them, falling back for legacy tasks.

  2. Update markdown serializer/append helpers and API responses to use the new
  structure, ensuring save/append flows remain stable.

  3. Add regression tests (parser, serializer, web UI integration) proving
  headings inside notes continue to render.
implementation_notes: >-
  ## Summary

  - Unified structured-section handling across description, plan, notes, and
  acceptance criteria.

  - Removed raw-body fallbacks in TUI/web; rely solely on parsed fields to avoid
  sentinel leaks.

  - Simplified serializer updates to touch only targeted sections without extra
  parsing.


  ## Testing

  - bunx tsc --noEmit

  - bun run check src/markdown/parser.ts src/markdown/serializer.ts
  src/markdown/structured-sections.ts src/test/acceptance-criteria.test.ts

  - bun test src/test/acceptance-criteria.test.ts
  src/test/implementation-notes.test.ts

  - bun test (full suite)
acceptance_criteria:
  - index: 1
    text: >-
      H2 or deeper headings inside Implementation Notes render fully in the task
      modal preview and edit modes.
    checked: true
  - index: 2
    text: >-
      Parser prefers Implementation Notes sentinel markers and still supports
      legacy tasks without them.
    checked: true
  - index: 3
    text: >-
      Serializer emits a single sentinel-wrapped Implementation Notes block;
      append/replace flows do not duplicate markers.
    checked: true
  - index: 4
    text: >-
      Automated tests cover nested heading scenarios for parser, serializer, and
      web UI.
    checked: true
definition_of_done: []
comments: []
---
