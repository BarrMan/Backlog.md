---
task_schema_version: 2
id: BACK-528
title: Fix All Tasks ID sorting for subtasks
status: Done
assignee:
  - '@codex'
created_date: '2026-07-09 05:56'
updated_date: '2026-07-09 07:36'
labels: []
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/734'
modified_files:
  - src/web/components/TaskList.tsx
  - src/utils/task-sorting.ts
  - src/test/web-task-list-labels-menu.test.tsx
  - src/test/task-sorting.test.ts
ordinal: 168000
description: >-
  GitHub issue #734 reports that the web UI All Tasks table sorts dotted subtask
  IDs such as BACK-354.01 by only the trailing suffix, placing them near
  unrelated root tasks. The All Tasks table should use the same hierarchical
  task ID ordering used elsewhere so subtasks appear immediately after their
  parent task.
implementation_plan: >-
  1. Reproduce the All Tasks dotted-ID ordering bug with a focused Web UI
  regression test.

  2. Replace TaskList’s local trailing-number ID comparator with the shared
  hierarchical compareTaskIds helper.

  3. Run the targeted Web UI test, task-sorting test, type-check, and project
  check before publishing the PR.
implementation_notes: >-
  Reproduced issue #734 with a focused TaskList Web UI test: before the fix,
  ascending ID sort returned task-1, task-3.01, task-2, task-3.02, task-3.
  Replaced TaskList’s local trailing-number parser with the shared
  compareTaskIds helper so dotted subtask IDs sort hierarchically. Validation
  passed: bun test src/test/web-task-list-labels-menu.test.tsx; bun test
  src/test/task-sorting.test.ts; bunx tsc --noEmit; bun run check .; bun test
  (1446 pass, 2 skip, 0 fail).


  PR #741 review follow-up: preserved the locale/numeric fallback when
  compareTaskIds returns equality for distinct task IDs, so nonnumeric IDs like
  task-alpha/task-beta sort deterministically without regressing dotted subtask
  ordering. Added a focused nonnumeric ID regression test. Additional validation
  passed: bun test src/test/web-task-list-labels-menu.test.tsx
  src/test/task-sorting.test.ts; bun test src/test/build.test.ts; bun run check
  .; bunx tsc --noEmit.


  Simplification pass moved the deterministic fallback into the shared
  compareTaskIds helper so TaskList and other task ID sort paths use one
  implementation. Revalidated with bun test
  src/test/web-task-list-labels-menu.test.tsx src/test/task-sorting.test.ts
  src/test/build.test.ts; bunx tsc --noEmit; bun run check .


  PR #741 second review follow-up: fixed default ID-desc sorting so root task
  groups still sort descending while parent tasks remain before dotted subtasks.
  Added shared compareTaskIdsDescending coverage and a TaskList default-sort
  regression. Validation passed: bun test
  src/test/web-task-list-labels-menu.test.tsx src/test/task-sorting.test.ts; bun
  test src/test/build.test.ts; bunx tsc --noEmit; bun run check .
final_summary: >-
  Fixed All Tasks ID sorting for dotted subtasks by reusing the shared
  hierarchical task ID comparator in TaskList. Added a Web UI regression test
  covering task-3, task-3.01, and task-3.02 ordering; targeted checks,
  type-check, Biome, and the full Bun test suite pass.
acceptance_criteria:
  - index: 1
    text: >-
      All Tasks ID sorting orders root tasks and dotted subtasks hierarchically,
      for example TASK-001, TASK-002, TASK-003, TASK-003.01, TASK-003.02.
    checked: true
  - index: 2
    text: >-
      The Web UI table reuses the existing hierarchical task ID comparator
      instead of maintaining a divergent numeric suffix parser.
    checked: true
  - index: 3
    text: >-
      A regression test covers dotted subtask ID ordering in the All Tasks table
      sorting behavior.
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
