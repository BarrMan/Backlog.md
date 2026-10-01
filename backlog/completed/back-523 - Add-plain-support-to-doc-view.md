---
task_schema_version: 2
id: BACK-523
title: Add plain support to doc view
status: Done
assignee:
  - '@gpt-5'
created_date: '2026-07-08 20:15'
updated_date: '2026-07-08 20:16'
labels: []
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/723'
  - 'https://github.com/MrLesk/Backlog.md/pull/729'
modified_files:
  - src/cli.ts
  - src/test/cli-doc-view.test.ts
ordinal: 116000
description: >-
  Add a non-interactive plain-text path for `backlog doc view` so agents,
  scripts, pipes, and CI can read Backlog documents through the public CLI
  without launching the interactive viewer.
implementation_plan: >-
  1. Follow the existing CLI plain-output pattern used by other read commands.

  2. Add `--plain` to `backlog doc view`, using `isPlainRequested(options) ||
  shouldAutoPlain` before falling back to the scrollable viewer.

  3. Update the command help schema and examples.

  4. Add focused CLI tests for explicit `--plain` and non-TTY auto-plain
  behavior.

  5. Verify with focused tests, typecheck, and Biome.
implementation_notes: >-
  Created after PR #729 implementation review to attach the required Backlog
  task record to the existing scoped GitHub issue #723 and PR.


  Verification on PR #729 branch:

  - `bun test src/test/cli-doc-view.test.ts` passed (2 tests).

  - `bunx tsc --noEmit` passed.

  - `bun run check .` passed.

  - `bun run cli doc view --help` shows `--plain` and the `backlog doc view
  doc-1 --plain` example.

  - Full `bun test` was attempted; it hit the existing
  `src/test/cli-priority-filtering.test.ts` timeout in `case insensitive
  priority filtering`, which also reproduces when that unrelated file is run
  alone.
final_summary: >-
  Added `--plain` support to `backlog doc view`, including non-TTY auto-plain
  behavior and command help/schema documentation. Verified with the focused
  doc-view CLI test, TypeScript check, Biome check, and help output inspection.
  Full-suite verification was attempted, but an unrelated priority-filtering
  timeout reproduces outside this PR scope.
acceptance_criteria:
  - index: 1
    text: >-
      `backlog doc view <docId> --plain` prints the document content to stdout
      without launching the interactive viewer
    checked: true
  - index: 2
    text: >-
      `backlog doc view <docId>` automatically emits plain output when stdout is
      not a TTY
    checked: true
  - index: 3
    text: >-
      `backlog doc view --help` documents the `--plain` option and includes a
      plain-output example
    checked: true
  - index: 4
    text: >-
      Focused CLI tests cover explicit plain output and non-TTY auto-plain
      behavior for document view
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
