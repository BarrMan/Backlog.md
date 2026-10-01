---
task_schema_version: 2
id: BACK-460
title: Fix TUI selected-row readability in board and task list
status: Done
assignee:
  - '@codex'
created_date: '2026-04-01 09:28'
updated_date: '2026-05-03 12:13'
labels:
  - bug
  - tui
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/pull/587'
modified_files:
  - src/test/generic-list-selection.test.ts
  - src/test/strip-tags.test.ts
  - src/ui/board.ts
  - src/ui/components/generic-list.ts
  - src/ui/utils/strip-tags.ts
description: >-
  Selected rows in the terminal UI become hard to read in Catppuccin because
  inline blessed foreground tags override the list widget's selected-row
  foreground styling. The fix should be limited to TUI selected rows and avoid
  changing non-selected rendering or web/plain-text behavior.
implementation_plan: >-
  1. Add a small TUI utility that strips blessed foreground color tags while
  preserving structural tags.

  2. Use the utility only for actively selected rows in the board and
  GenericList paths.

  3. Preserve rich formatting for non-selected rows.

  4. Add focused tests for tag stripping and board item preservation.
final_summary: >-
  Implemented a TUI-only selected-row readability fix by stripping inline
  blessed foreground tags only for the active row in the board and GenericList
  paths. Added focused tests for tag stripping, board item preservation, and
  mouse-driven GenericList selection changes; validated the related
  TUI/task-viewer test suites, ran typecheck, and addressed Codex review
  feedback.
acceptance_criteria:
  - index: 1
    text: >-
      Selected rows in the board view remain readable when item text contains
      inline blessed foreground color tags
    checked: true
  - index: 2
    text: >-
      Selected rows in the task list view remain readable without changing
      non-selected row formatting
    checked: true
  - index: 3
    text: >-
      The fix is covered by focused automated tests and does not change web or
      plain-text output paths
    checked: true
definition_of_done: []
comments: []
---
