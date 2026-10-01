---
task_schema_version: 2
id: BACK-215.05
title: 'TUI sequences: tests and stability'
status: Done
assignee:
  - '@codex'
created_date: '2025-08-23 19:12'
updated_date: '2025-08-26 19:38'
labels:
  - sequences
dependencies: []
parent_task_id: task-215
description: >-
  Add tests for rendering, navigation, and task moves; ensure no crashes and
  smooth behavior for large data sets.
implementation_plan: >-
  1. Add core helper to check Unsequenced eligibility; reuse in TUI\n2. Add
  tests: eligibility, computeSequences coverage, and join/insert moves already
  present\n3. Add a headless TUI content test for Unsequenced ordering\n4. Run
  lint/types/tests; fix issues\n5. Mark task Done with notes
implementation_notes: >-
  Added tests for Unsequenced eligibility and leveraged existing coverage for
  sequences plain output, headless fallback, join and insert-between moves, and
  reorder. Introduced canMoveToUnsequenced in core and integrated in TUI to
  block invalid Unsequenced moves. Verified no crashes, types, and linting; ran
  full test suite (no env overrides).
acceptance_criteria:
  - index: 1
    text: Unit/integration tests cover rendering and navigation
    checked: true
  - index: 2
    text: Tests cover move flows and dependency updates
    checked: true
  - index: 3
    text: No crash or unhandled errors during typical flows
    checked: true
  - index: 4
    text: Tests cover Unsequenced bucket rendering in TUI and --plain output
    checked: true
  - index: 5
    text: >-
      Tests verify join semantics: moving into a sequence sets moved deps to
      previous sequence only; other tasks unchanged
    checked: true
  - index: 6
    text: >-
      Tests block moving to Unsequenced when task has deps/dependees; shows
      clear message
    checked: true
  - index: 7
    text: >-
      Tests ensure moving from Unsequenced to Sequence 1 anchors with ordinal
      when deps remain empty
    checked: true
definition_of_done: []
comments: []
---
