---
task_schema_version: 2
id: BACK-355.02
title: 'CLI: Add --type flag to task create and edit commands'
status: Done
assignee:
  - '@codex-types-cli'
created_date: '2026-01-01 23:37'
updated_date: '2026-07-10 19:33'
labels:
  - cli
dependencies:
  - task-355.01
parent_task_id: BACK-355
priority: medium
description: >-
  Extend CLI commands to support the type field, allowing users to specify and
  modify task types from the command line.
implementation_plan: >-
  1. Centralize configured task-type values, case-insensitive canonicalization,
  and valid-value formatting in one shared utility; reuse it from Core and CLI
  surfaces.

  2. Add --type to task create/edit, pass values through Core validation, and
  add configured type selection with an explicit untyped option to the shared
  Clack create/edit wizard.

  3. Add configured task-type shell completion and dynamic help schema/examples
  sourced from the project config.

  4. Expose types through read-only config get/list, without adding a config set
  surface.

  5. Show [type] in plain task-list rows when present while preserving omission
  for untyped tasks; retain the existing Type line in plain detail output.

  6. Add focused utility, wizard, completion, config, help, and CLI integration
  tests, then run targeted tests, typecheck, Biome, build, and the full suite.
implementation_notes: >-
  Implemented one shared task-type configuration resolver and reused it from
  Core, dynamic CLI help, shell completion, and the Clack create/edit wizard.
  CLI create/edit now accept --type with configured-value canonicalization; edit
  and the wizard can clear the value; untyped tasks remain untyped. Plain task
  lists show a compact [type] badge, while shared plain details show Type only
  when present. config get types and config list expose configured/default
  values; config set remains unsupported.


  Validation: 47 focused tests passed; bunx tsc --noEmit passed; bun run check .
  passed across 311 files; bun run build passed; full bun test passed 1496 with
  2 documented interactive TUI skips and 0 failures; compiled dist/backlog
  create/edit/list/config/help smoke passed.


  Independent review follow-up: plain task-list rows now share one formatter, so
  --sort priority preserves the same priority and type badges as grouped plain
  output. Create/edit help examples now quote the first configured task type
  instead of hard-coding default values; custom Bug/Epic projects advertise only
  valid commands.


  Review-fix validation: 35 focused tests passed; bunx tsc --noEmit passed; bun
  run check . passed across 311 files; bun run build passed; full bun test
  passed 1496 with 2 documented interactive TUI skips and 0 failures.


  Exact-head simplicity cleanup: removed the unused exported
  resolveTaskTypeValues helper and its future-only unit test. BACK-355.04 will
  introduce the plural resolver together with its production list/search caller.
  Existing singular resolution, validation, help, completion, and output
  behavior is unchanged.


  Cleanup validation: rg confirms no resolveTaskTypeValues references remain; 19
  directly affected tests passed; bunx tsc --noEmit passed; bun run check .
  passed across 311 files; bun run build passed. A full 1496-test run had
  already passed on the immediately preceding head; this removal had no
  production caller, so the full suite was not repeated.


  Final scope cleanup: reduced taskType to its parameterless single-value help
  contract and removed completion support for undeclared --task-type.
  BACK-355.04 will add plural schema wording and task-type completion with the
  filtering commands that consume them. Current create/edit help and
  context-gated --type completion behavior is unchanged.


  Final cleanup validation: no multiple taskType call or task-type completion
  branch remains; 21 affected tests passed; bunx tsc --noEmit passed; bun run
  check . passed across 311 files; bun run build passed. Full suite was not
  repeated because this exact diff only deletes unreachable future hooks and the
  immediately preceding functional head passed 1496 tests with 0 failures.
final_summary: >-
  Added canonical CLI task-type support across create/edit flags, interactive
  selection, configured casing and validation, shell completion, help, read-only
  config output, and plain human-readable task output. Existing untyped tasks
  remain untyped. Verified with focused integration tests, typecheck, Biome,
  build, the full 1496-test suite, and compiled-binary smoke.
acceptance_criteria:
  - index: 1
    text: >-
      task create command accepts --type flag with autocomplete for configured
      types
    checked: true
  - index: 2
    text: task edit command accepts --type flag to modify existing task type
    checked: true
  - index: 3
    text: task list output displays type field (abbreviated in table view)
    checked: true
  - index: 4
    text: task view (plain mode) includes type in output
    checked: true
  - index: 5
    text: Invalid type values produce clear error message listing valid options
    checked: true
  - index: 6
    text: CLI help text documents the --type flag
    checked: true
definition_of_done: []
comments:
  - index: 1
    body: >-
      Implementation complete and ready for independent review; task remains In
      Progress until review and merge.
    created_date: '2026-07-09 22:13'
    author: '@codex-types-cli'
  - index: 2
    body: >-
      Addressed both independent review blockers; ready for exact-head re-review
      after push.
    created_date: '2026-07-09 22:24'
    author: '@codex-types-cli'
  - index: 3
    body: >-
      Removed the final review-blocking future-only API surface; ready for
      exact-head re-review after push.
    created_date: '2026-07-09 22:31'
    author: '@codex-types-cli'
  - index: 4
    body: >-
      Removed the remaining BACK-355.04-only help and completion hooks; ready
      for exact-head re-review after push.
    created_date: '2026-07-09 22:34'
    author: '@codex-types-cli'
---
