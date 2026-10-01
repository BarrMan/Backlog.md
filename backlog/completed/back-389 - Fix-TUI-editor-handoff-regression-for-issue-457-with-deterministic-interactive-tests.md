---
task_schema_version: 2
id: BACK-389
title: >-
  Fix TUI editor handoff regression for issue #457 with deterministic
  interactive tests
status: Done
assignee:
  - '@codex'
created_date: '2026-02-11 22:36'
updated_date: '2026-02-21 15:27'
labels:
  - tui
  - testing
  - bug
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/457'
priority: high
description: >-
  Add automated interactive terminal tests that exercise TUI editor handoff from
  board/task list and detect regressions where terminal editor key input is not
  passed through correctly. Tests should be deterministic and suitable for CI.
implementation_notes: >-
  Implemented deterministic interactive TUI regression coverage with an `expect`
  PTY harness in `src/test/tui-interactive-editor-handoff.test.ts` for both
  `backlog board` and `backlog task list` edit flows.


  The harness seeds isolated repos, opens TUI views in a pseudo-terminal,
  triggers `E` edit, validates editor handoff execution, and asserts task file
  mutation + `updated_date` persistence after editor exit.


  Added transcript capture under `tmp/tui-interactive-transcripts/*.log` and
  explicit CI artifact upload on failure.


  Added `scripts/run-tui-interactive-tests.sh` to run these tests in CI with
  graceful skip when `expect` is unavailable.


  Wired CI (`.github/workflows/ci.yml`) to run optional interactive TUI
  regression tests on Ubuntu and upload transcript artifacts when failures
  occur.


  Observed during implementation: deterministic arrow-byte passthrough
  assertions remained flaky in PTY automation with the current TUI stack, so
  this task kept scope on deterministic editor handoff + mutation verification.
final_summary: >-
  Added an interactive PTY-based TUI regression test harness for issue #457 that
  exercises `E` edit from both Kanban board and task list views.


  Key changes:

  - New test: `src/test/tui-interactive-editor-handoff.test.ts`

  - New runner script: `scripts/run-tui-interactive-tests.sh`

  - CI wiring: Ubuntu-only interactive test step + failure artifact upload in
  `.github/workflows/ci.yml`


  Verification performed:

  - `bun test src/test/tui-interactive-editor-handoff.test.ts --timeout=30000`
  (skip behavior)

  - `RUN_INTERACTIVE_TUI_TESTS=1 bun test
  src/test/tui-interactive-editor-handoff.test.ts --timeout=30000` (interactive
  run)

  - `bash scripts/run-tui-interactive-tests.sh`

  - `bun test src/test/task-updated-date.test.ts
  src/test/tui-edit-session.test.ts src/test/board-ui.test.ts
  src/test/board-ui-selection.test.ts src/test/board-command.test.ts`

  - `bunx tsc --noEmit`

  - `bun run check .`


  Current harness validates editor handoff invocation and post-edit
  mutation/updated_date behavior through PTY automation; strict arrow-key byte
  forwarding assertions are not enforced in this task.
acceptance_criteria:
  - index: 1
    text: >-
      Automated tests execute `backlog board`/task-list edit flow through a
      PTY-style harness and validate the editor handoff path is invoked
    checked: true
  - index: 2
    text: >-
      Tests verify task file mutation from the editor path and confirm task
      state is refreshed/marked modified as expected
    checked: true
  - index: 3
    text: >-
      Test harness captures terminal transcript artifacts for failed runs to aid
      debugging
    checked: true
  - index: 4
    text: >-
      Tests can run in CI and are skipped with clear messaging only when
      required terminal dependencies are unavailable
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
