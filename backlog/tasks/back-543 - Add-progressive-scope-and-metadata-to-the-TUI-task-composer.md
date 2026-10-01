---
task_schema_version: 2
id: BACK-543
title: Add progressive scope and metadata to the TUI task composer
status: To Do
assignee:
  - '@alex-agent'
created_date: '2026-07-12 22:10'
labels:
  - tui
  - enhancement
milestone: m-8
dependencies:
  - BACK-430
priority: medium
type: enhancement
ordinal: 190000
description: >-
  Extend the reviewed TUI composer with progressively disclosed scope and
  metadata after the production first slice is established. Keep capture
  readable, validate the complete payload before persistence, and exclude
  lifecycle-only execution and completion fields from creation.
acceptance_criteria:
  - index: 1
    text: >-
      The composer supports assignee, labels, active milestone, parent,
      dependencies, references, acceptance criteria, and per-task Definition of
      Done using the configured or canonical choices for each field.
    checked: false
  - index: 2
    text: >-
      Scope and metadata are progressively disclosed so title and description
      remain the primary capture experience while all included fields remain
      discoverable before review.
    checked: false
  - index: 3
    text: >-
      Repeatable fields support adding, editing, removing, and clearing values
      with unambiguous keyboard and focus behavior.
    checked: false
  - index: 4
    text: >-
      Parent, dependency, milestone, and other canonical validation or identity
      ambiguity is resolved before Create, and validation failure produces no
      partial writes.
    checked: false
  - index: 5
    text: >-
      Plan, implementation notes, and final summary are absent from task
      creation because they belong to later lifecycle stages.
    checked: false
  - index: 6
    text: >-
      A complete review state precedes the explicit Create action, and Cancel
      exits without creating or modifying a task or draft.
    checked: false
  - index: 7
    text: >-
      Validation and persistence failures preserve all entered values for
      correction or retry.
    checked: false
  - index: 8
    text: >-
      Keyboard, focus, and scrolling behavior is verified in rendered TUI QA at
      normal and narrow terminal sizes.
    checked: false
  - index: 9
    text: >-
      Automated tests cover payload mapping, configured choices,
      repeatable-field add/edit/remove/clear semantics, ambiguity and validation
      failures, cancellation, and absence of lifecycle-only creation fields.
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
