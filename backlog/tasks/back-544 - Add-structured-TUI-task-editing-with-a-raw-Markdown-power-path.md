---
task_schema_version: 2
id: BACK-544
title: Add structured TUI task editing with a raw Markdown power path
status: To Do
assignee:
  - '@alex-agent'
created_date: '2026-07-12 22:11'
labels:
  - tui
  - enhancement
milestone: m-8
dependencies:
  - BACK-543
priority: medium
type: enhancement
ordinal: 191000
description: >-
  Reuse the TUI composer as a structured editing model from board, list, and
  detail contexts while preserving raw Markdown editing as a separate power-user
  path. Exact shortcut mapping and lifecycle-field grouping require Alex plan
  review before implementation; this task intentionally does not choose them in
  advance.
acceptance_criteria:
  - index: 1
    text: >-
      Structured editing is available from the TUI board, list, and detail
      contexts and reuses the composer field model instead of introducing a
      separate form model.
    checked: false
  - index: 2
    text: >-
      The editor prefills the selected record accurately, preserves untouched
      content, and saves only fields the user changed.
    checked: false
  - index: 3
    text: >-
      Cancel and an unchanged submission perform no write, with clear no-change
      feedback.
    checked: false
  - index: 4
    text: >-
      Validation or persistence failure performs no partial write and preserves
      the edited values for correction or retry.
    checked: false
  - index: 5
    text: >-
      Status changes and task-to-Draft or Draft-to-task transitions use the
      canonical status, demotion, and promotion paths, including any resulting
      task ID change, without duplicating transition semantics in the TUI.
    checked: false
  - index: 6
    text: >-
      Lifecycle fields are available through staged editing when relevant, while
      creation continues to omit plan, implementation notes, and final summary
      without guessing which custom status names represent lifecycle stages.
    checked: false
  - index: 7
    text: >-
      Raw Markdown editing remains a separate, discoverable power-user action
      and returns to the same refreshed TUI context after the external editor
      exits.
    checked: false
  - index: 8
    text: >-
      A successful change refreshes the view exactly once and communicates
      changed, unchanged, transition, and error outcomes honestly, preserving or
      relocating focus when an ID changes.
    checked: false
  - index: 9
    text: >-
      Automated tests cover prefill, untouched-content preservation,
      changed-field saves, cancellation, no-change handling, validation and
      persistence errors, status and Draft transitions, ID changes,
      external-editor return, and single-refresh behavior.
    checked: false
  - index: 10
    text: >-
      Rendered keyboard QA covers structured editing and raw Markdown discovery,
      focus, scrolling, cancellation, transitions, and feedback at normal and
      narrow terminal sizes.
    checked: false
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: false
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: false
  - index: 3
    text: bun test (or scoped test) passes
    checked: false
comments: []
---
