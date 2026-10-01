---
task_schema_version: 2
id: BACK-367.01
title: CLI and plain text formatter integration for Final Summary field
status: Done
assignee:
  - '@codex'
created_date: '2026-01-18 12:19'
updated_date: '2026-01-19 19:16'
labels:
  - cli
  - enhancement
dependencies:
  - BACK-367
documentation:
  - src/cli.ts
  - src/formatters/task-plain-text.ts
parent_task_id: BACK-367
priority: medium
description: >-
  ### Scope


  Integrate the `finalSummary` field into the CLI commands and plain text output
  formatter.


  **Depends on:** BACK-367 (core infrastructure must be complete first)


  ### CLI Commands


  **`task create` command:**

  - Add `--final-summary <text>` flag to set initial final summary


  **`task edit` command:**

  - Add `--final-summary <text>` flag to set/replace final summary

  - Add `--append-final-summary <text>` flag to append to existing final summary

  - Add `--clear-final-summary` flag to remove final summary


  Follow the same patterns used for `--plan`, `--notes`, `--append-notes`,
  `--clear-notes`.


  ### Plain Text Formatter


  Update `src/formatters/task-plain-text.ts` to display the Final Summary
  section:

  - Display after Implementation Notes

  - Use consistent formatting with other sections

  - Only show if finalSummary is non-empty


  ### Reference Files


  - `src/cli.ts` - CLI command definitions and option parsing

  - `src/formatters/task-plain-text.ts` - Plain text output formatting

  - Look at how `--notes`, `--append-notes`, `--plan` flags are implemented
implementation_plan: >-
  - Review CLI flags for notes/plan in `src/cli.ts` and mirror patterns for
  `--final-summary`, `--append-final-summary`, `--clear-final-summary` in
  create/edit flows.

  - Wire new args through `src/types/task-edit-args.ts` and
  `src/utils/task-edit-builder.ts` to map to `finalSummary`,
  `appendFinalSummary`, `clearFinalSummary`.

  - Update `src/formatters/task-plain-text.ts` to render Final Summary after
  Implementation Notes only when present.

  - Add CLI-focused tests in `src/test/cli-final-summary.test.ts` and/or extend
  existing CLI plain output tests to cover set/append/clear and section
  ordering.

  - Run targeted tests: `bun test src/test/cli-final-summary.test.ts` (plus any
  updated test files).
implementation_notes: >-
  Summary: Added CLI flags for final summary on create/edit, wired task edit
  inputs, and surfaced Final Summary in plain text output. Added CLI tests for
  create/set/append/clear and plain output ordering.


  Tests: bun test src/test/cli-final-summary.test.ts
final_summary: >-
  ## Summary

  CLI now supports writing and viewing Final Summary in tasks.


  ## Changes

  - Added `--final-summary`, `--append-final-summary`, and
  `--clear-final-summary` to task create/edit.

  - Rendered Final Summary in plain-text task output after Notes.

  - Added CLI coverage to verify flag behavior and output rendering.


  ## Testing

  - Covered by the project test run in the parent task: `bun test`.
acceptance_criteria:
  - index: 1
    text: CLI `task create` supports `--final-summary <text>` flag
    checked: true
  - index: 2
    text: CLI `task edit` supports `--final-summary <text>` flag (set/replace)
    checked: true
  - index: 3
    text: CLI `task edit` supports `--append-final-summary <text>` flag
    checked: true
  - index: 4
    text: CLI `task edit` supports `--clear-final-summary` flag
    checked: true
  - index: 5
    text: >-
      Plain text formatter displays Final Summary section after Implementation
      Notes when present
    checked: true
  - index: 6
    text: Plain text formatter omits Final Summary section when field is empty
    checked: true
  - index: 7
    text: >-
      CLI tests in `src/test/cli-final-summary.test.ts` cover all flag
      combinations
    checked: true
definition_of_done: []
comments: []
---
