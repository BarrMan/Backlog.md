---
task_schema_version: 2
id: BACK-433
title: Make task edit preserve unrelated file details
status: Done
assignee:
  - '@alex-agent'
created_date: '2026-04-25 12:15'
updated_date: '2026-04-25 17:31'
labels:
  - cli
  - core
  - bug
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/603'
priority: high
description: >-
  Track GitHub issue #603: editing one field should not rename, recase, or
  otherwise rewrite unrelated task file details.
implementation_plan: >-
  1. Preserve existing task file paths during task updates while keeping
  create-time filename generation unchanged.

  2. Preserve existing on-disk task ID casing during existing-file writes while
  keeping normalized IDs for loaded API results.

  3. Update serialization so parsed body sections and checklists are rewritten
  only when their values actually change.

  4. Cover issue #603 with a label-only regression fixture that preserves
  filename, id casing, legacy description, and unrelated sections.
implementation_notes: >-
  Implemented preservation in saveTask and serializeTask, then added a
  regression fixture matching GitHub issue #603. Targeted tests, TypeScript,
  changed-file Biome, affected suites, and full bun test passed before merge.
  After later package formatting cleanup landed on main, project-wide bun run
  check . now exits successfully with existing optional-chain warnings only.
final_summary: >-
  Summary:

  - Preserved existing task file paths and on-disk task ID casing during task
  updates.

  - Avoided rewriting unrelated task metadata/content when editing a single
  field.

  - Added regression coverage for the issue #603 label-only edit case.


  Validation:

  - Targeted regression tests

  - Affected suites

  - bun test

  - bunx tsc --noEmit

  - bun run check . on current main
acceptance_criteria:
  - index: 1
    text: >-
      Editing a single task field preserves the task ID casing, filename
      identity, and unrelated metadata/content.
    checked: true
  - index: 2
    text: A label-only edit does not inject or remove unrelated markers or sections.
    checked: true
  - index: 3
    text: >-
      Regression tests cover the issue's task create/edit script or an
      equivalent fixture.
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
