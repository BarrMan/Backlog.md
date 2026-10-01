---
task_schema_version: 2
id: BACK-236
title: Fix TUI Unicode rendering for CJK (Chinese shows as ?)
status: Done
assignee:
  - '@codex'
created_date: '2025-08-17 16:30'
updated_date: '2025-09-03 21:07'
labels:
  - tui
  - bug
  - unicode
dependencies: []
priority: high
description: >-
  Chinese characters are rendered as question marks in the terminal board view
  (see GitHub issue #283). This is likely due to Blessed not being configured
  for full Unicode width handling.\n\nApproach:\n- Enable Blessed's full Unicode
  support on all TUI screens (fullUnicode: true in createScreen).\n- Verify
  rendering in board and task list/detail views.\n- Ensure no code path replaces
  non-ASCII with fallback characters.\n\nRepro (pre-fix):\n1) backlog task
  create "测试中文" --plain\n2) backlog board\nExpected: characters display
  correctly, not as question marks.
implementation_plan: >-
  Enable Blessed's full Unicode support on all TUI screens (fullUnicode: true in
  createScreen).\nVerify rendering in board and task list/detail views.\nEnsure
  no code path replaces non-ASCII with fallback characters.
implementation_notes: >-
  - Enabled fullUnicode: true in TUI screen factory (neo-neo-bblessed) to fix
  CJK rendering.\n- Resolved merge conflict in src/ui/tui.ts by consolidating
  bblessed program/screen usage.\n- Added unit test
  src/test/unicode-rendering.test.ts to verify Chinese text passes through
  unchanged.\n- Verified all TUI views construct screens via createScreen()
  (board, task viewer, list, loading, overview).\n- Searched codebase to ensure
  no non-ASCII replacement/sanitization on titles or content.\n- Ran Biome
  checks and full test suite; built CLI binary successfully.\n\nManual verify
  (macOS Terminal + iTerm2):\n- backlog task create "测试中文" --plain\n- bun run
  cli board -> ensure characters render correctly in board + task detail.\n\nIf
  both manual checks pass, mark AC #2 and #4 complete and set status Done.
acceptance_criteria:
  - index: 1
    text: 'Set fullUnicode: true in the TUI screen factory and apply consistently'
    checked: true
  - index: 2
    text: >-
      Verify Chinese titles render correctly in board and task list/detail
      (macOS Terminal/iTerm2)
    checked: true
  - index: 3
    text: >-
      No replacement of non-ASCII characters in code (titles are passed through
      unchanged)
    checked: true
  - index: 4
    text: 'Manual repro steps succeed: "测试中文" shows correctly in backlog board'
    checked: true
definition_of_done: []
comments: []
---
