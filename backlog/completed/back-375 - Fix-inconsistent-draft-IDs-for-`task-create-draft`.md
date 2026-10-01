---
task_schema_version: 2
id: BACK-375
title: Fix inconsistent draft IDs for `task create --draft`
status: Done
assignee:
  - '@codex'
created_date: '2026-02-08 21:43'
updated_date: '2026-02-08 21:45'
labels:
  - bug
  - cli
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/507'
priority: high
description: >-
  Investigate and fix mismatch between `draft create` and `task create --draft`
  where the latter creates `draft-task-*` files and prints TASK IDs. Ensure both
  commands produce consistent DRAFT IDs and add regression test coverage for CLI
  path.
implementation_notes: >-
  Root cause was in `task create` CLI flow generating a Task ID unconditionally
  before draft creation, which produced `draft-task-*` filenames after draft
  normalization. Updated `task create` to generate Draft IDs when `--draft` is
  set and to report `task.id` consistently in output. Added CLI regression tests
  that exercise the exact failing path (`draft create` followed by `task create
  --draft`) and plain output behavior.
final_summary: >-
  Fixed inconsistent draft identity handling for `task create --draft` by
  generating Draft IDs in the CLI path and reporting the normalized created ID
  in output. Added regression coverage in
  `src/test/draft-create-consistency.test.ts` to verify filename prefix, ID
  sequencing, and `--plain` output for draft creation.
acceptance_criteria:
  - index: 1
    text: >-
      `backlog task create --draft <title>` creates a draft file with
      `draft-<n>` filename pattern (no `draft-task-` prefix).
    checked: true
  - index: 2
    text: >-
      CLI output for `task create --draft` reports the created draft ID using
      DRAFT prefix.
    checked: true
  - index: 3
    text: >-
      A regression test covers the `task create --draft` CLI path so this bug is
      caught in CI.
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
