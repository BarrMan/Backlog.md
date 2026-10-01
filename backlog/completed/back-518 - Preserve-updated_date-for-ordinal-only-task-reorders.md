---
task_schema_version: 2
id: BACK-518
title: Preserve updated_date for ordinal-only task reorders
status: Done
assignee:
  - '@codex'
created_date: '2026-07-02 20:39'
updated_date: '2026-07-02 20:46'
labels: []
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/684'
priority: high
ordinal: 113000
description: ''
implementation_plan: >-
  1. Centralize updated_date stamping in Core.updateTask so ordinal-only saves
  restore the prior updatedDate instead of stamping now.

  2. Add focused regression coverage for direct ordinal edits, direct ordinal
  plus content edits, updateTasksBulk ordinal-only saves, and reorderTask
  same-column reorders.

  3. Run targeted tests, typecheck, and Biome checks for touched files; update
  Backlog task status/acceptance criteria before commit/PR.
implementation_notes: >-
  Implemented timestamp preservation in Core.updateTask by comparing persisted
  task fields excluding ordinal and updatedDate. Validation passed: bun test
  src/test/reorder-utils.test.ts; bunx tsc --noEmit; bun run check .; bun test
  (1379 pass, 2 skip).
final_summary: >-
  Preserved updated_date for ordinal-only task saves across direct edits, bulk
  updates, and same-column reorder flows while keeping normal updated_date
  stamping for ordinal plus content/metadata edits. Added focused regression
  coverage and verified with targeted tests, typecheck, Biome, and the full test
  suite.
acceptance_criteria:
  - index: 1
    text: Editing only a task ordinal preserves the existing updated_date value
    checked: true
  - index: 2
    text: Editing only a task ordinal does not add updated_date when it was absent
    checked: true
  - index: 3
    text: >-
      Saving ordinal changes together with any non-order task field updates
      updated_date normally
    checked: true
  - index: 4
    text: >-
      Board reorder and sort bulk flows preserve updated_date for ordinal-only
      changes
    checked: true
  - index: 5
    text: Focused regression tests cover direct and bulk reorder behavior
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
