---
task_schema_version: 2
id: BACK-235
title: Consolidate duplicate AC sections and overwrite Implementation Notes
status: Done
assignee:
  - '@codex'
created_date: '2025-08-17 16:05'
updated_date: '2025-08-26 17:20'
labels:
  - cli
  - bug
dependencies: []
priority: high
description: >-
  Fix two related content consistency issues:


  1) Acceptance Criteria consolidation: The AC update logic now consolidates any
  duplicate AC sections (legacy header-only or marked with AC:BEGIN/AC:END) into
  one marked section at the first AC location, renumbered and stable.


  2) Implementation Notes overwrite: Editing with --notes replaces the entire
  Implementation Notes section content (no append). If missing, the section is
  created and placed after Implementation Plan if present, else after Acceptance
  Criteria or Description.


  Tests updated accordingly; viewers unaffected.
implementation_plan: >-
  1. Update serializer: overwrite Implementation Notes on edit

  2. Preserve section insertion order when missing (after Plan, else
  AC/Description)

  3. Update tests to expect overwrite behavior (no append)

  4. Run Biome check + tests; adjust as needed

  5. Document behavior via task notes
implementation_notes: >-
  Changed Implementation Notes behavior to overwrite on edit.


  Summary of changes:

  - src/markdown/serializer.ts: updateTaskImplementationNotes now replaces the
  entire "Implementation Notes" section content when --notes is used.

  - Section creation preserved: when missing, the section is inserted after
  Implementation Plan if present, else after Acceptance Criteria or Description.

  - Tests updated: src/test/implementation-notes.test.ts and
  src/test/task-edit-preservation.test.ts now expect overwrite semantics.

  - Verified CLI/TUI viewers handle replaced content correctly; no duplicate
  sections created.

  - Ran Biome check and targeted tests: all green.


  Rationale: aligns with DoD/PR-style notes (single clean description).
acceptance_criteria:
  - index: 1
    text: >-
      When a task already has Implementation Notes, editing with --notes
      replaces the entire section content
    checked: true
  - index: 2
    text: >-
      When missing, Implementation Notes is created and placed after
      Implementation Plan if present, else after Acceptance Criteria or
      Description
    checked: true
  - index: 3
    text: >-
      Multi-line notes preserved; no duplicate Implementation Notes sections
      created
    checked: true
  - index: 4
    text: CLI and TUI viewers display the replaced content correctly
    checked: true
  - index: 5
    text: Update existing tests to expect overwrite semantics (no append)
    checked: true
  - index: 6
    text: >-
      Detect multiple AC sections (with markers) and consolidate to a single
      section when updating
    checked: true
  - index: 7
    text: >-
      If both legacy (no markers) and marked sections exist, migrate to one
      marked section
    checked: true
  - index: 8
    text: >-
      Guarantee: after any AC edit, the file contains exactly one AC section
      with correct numbering
    checked: true
  - index: 9
    text: >-
      Add tests: starting from content with duplicated AC sections, after an AC
      update only one section remains with expected content
    checked: true
definition_of_done: []
comments: []
---
