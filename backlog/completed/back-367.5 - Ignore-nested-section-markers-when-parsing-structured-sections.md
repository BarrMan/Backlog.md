---
task_schema_version: 2
id: BACK-367.5
title: Ignore nested section markers when parsing structured sections
status: Done
assignee:
  - '@codex'
created_date: '2026-01-19 21:15'
updated_date: '2026-01-19 21:27'
labels:
  - bug
  - markdown
  - parser
  - tui
dependencies: []
parent_task_id: BACK-367
priority: medium
description: >-
  Structured section parsing currently matches section headers/markers even when
  they appear inside other structured sections (e.g., a Final Summary example
  embedded in Description). This causes UI surfaces (TUI task popup / list side
  panel) to show the example instead of the real Final Summary. Fix parsing so
  structured section extraction ignores matches that fall inside other
  structured sections, keeping section behavior consistent and top-level only.


  Scope: Parsing only (no UI changes). Apply to all structured sections
  (Description/Plan/Notes/Final Summary). Also update MCP workflow instructions
  to say follow-up work should be created as a subtask of the parent task.
implementation_plan: >-
  ## Plan

  1) Inspect current structured section parsing in
  `src/markdown/structured-sections.ts` to identify how section ranges are
  determined.

  2) Add a helper that computes ranges for each structured section (based on
  sentinel/legacy matches) and a filter that discards candidate matches
  occurring inside any *other* section range.

  3) Update `extractStructuredSection()` to select the first valid match outside
  other section ranges.

  4) Add regression test in `src/test/final-summary.test.ts` with Description
  containing a Final Summary example and a real Final Summary later; ensure
  extraction returns the real section.

  5) Update MCP workflow instructions to state follow-up work should be created
  as a subtask of the parent task.

  6) Run scoped tests: `bun test src/test/final-summary.test.ts` (plus
  formatter/lint if required by touched files).
implementation_notes: >-
  Summary: Updated structured section extraction to ignore matches nested inside
  other sections by computing section ranges and skipping nested matches, so
  examples embedded in Description no longer override real sections. Added
  regression test for Final Summary example inside Description. Updated MCP
  overview to instruct follow-up work as subtasks.


  Tests: bun test src/test/final-summary.test.ts; bunx tsc --noEmit; bun run
  check .
acceptance_criteria:
  - index: 1
    text: >-
      Structured section extraction ignores matches that appear inside other
      structured section ranges (for all structured sections).
    checked: true
  - index: 2
    text: >-
      If a task contains a Final Summary example inside Description plus a real
      Final Summary later, the extracted value is the real section.
    checked: true
  - index: 3
    text: Tests cover nested-section example scenarios for Final Summary parsing.
    checked: true
  - index: 4
    text: >-
      MCP workflow instructions note that follow-up work should be created as a
      subtask, not a new top-level task.
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
