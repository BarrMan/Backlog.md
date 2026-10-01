---
task_schema_version: 2
id: BACK-572
title: Clear task dependencies through the CLI
status: Done
assignee:
  - '@codex'
  - '@claude'
created_date: '2026-08-03 20:16'
updated_date: '2026-08-07 17:29'
labels: []
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/839'
priority: medium
type: bug
ordinal: 214000
description: >-
  Fix GitHub issue #839: task edit currently ignores an empty dependency value,
  reports success without changing the task, and offers no supported way to
  remove dependencies. Add a clear, consistent CLI workflow without allowing
  silent no-op edits.
implementation_plan: >-
  1. Add a clear-dependencies edit input that follows the existing clear-*
  validation pattern.

  2. Reject empty dependency flag values before constructing an edit, preventing
  false-success output.

  3. Cover clear, conflicting, and empty-value behavior at the CLI surface; run
  focused and repository checks.
implementation_notes: >-
  Implemented --clear-deps with matching conflict and empty-value validation.
  Verified with bun test src/test/cli-dependency.test.ts, bunx tsc --noEmit, bun
  run check ., and bun test (1880 passed, 5 skipped).


  Review follow-up (PR #840): fixed three defects in the --clear-deps change.

  1. hasEditFieldFlags() in src/cli.ts did not list --clear-deps, so in an
  interactive TTY 'task edit X --clear-deps' (without --plain) opened the edit
  wizard and never cleared dependencies; the flag is now part of the predicate.

  2. Empty dependency values were only rejected when the combined normalized
  list was empty, so '--depends-on "" --dep TASK-1' silently accepted the empty
  occurrence; each raw --depends-on/--dep occurrence is now validated
  individually.

  3. MCP task_edit treated a blank-only dependency array such as ["   "] as a
  full clear; buildTaskUpdateInput now mirrors the labels convention (blank-only
  is a no-op, explicit [] still clears).

  Coverage: CLI regression test runs the edit through a faked-TTY entry point
  without --plain, a CLI case for an empty value alongside a valid one, and an
  MCP test mirroring the existing blank-only labels test.
final_summary: >-
  Added task edit --clear-deps and rejected empty dependency values to prevent
  false-success edits. Verified by focused CLI regression coverage, type-check,
  Biome, and the full Bun suite (1880 passed, 5 skipped).
acceptance_criteria:
  - index: 1
    text: task edit --clear-deps removes all dependencies from an existing task
    checked: true
  - index: 2
    text: >-
      --clear-deps cannot be combined with --depends-on or --dep and does not
      mutate the task on invalid input
    checked: true
  - index: 3
    text: >-
      Empty --depends-on or --dep is rejected instead of reporting a successful
      no-op
    checked: true
  - index: 4
    text: CLI help and regression tests document and verify dependency clearing
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
