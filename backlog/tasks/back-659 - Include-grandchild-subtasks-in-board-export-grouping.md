---
task_schema_version: 2
id: BACK-659
title: Include grandchild subtasks in board export grouping
status: Done
assignee:
  - '@claude'
created_date: '2026-08-30 15:23'
updated_date: '2026-08-30 15:45'
labels:
  - cli
  - bug
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/944'
ordinal: 291000
description: >-
  The markdown board export builds its children map keyed only by top-level
  parents (src/board.ts ~90-140), so a subtask whose parent is itself a subtask
  is silently dropped from the exported board (GitHub issue #944). Fix the
  grouping to include nested subtasks; rendering depth/shape choices should
  follow the existing export format.
implementation_plan: >-
  1. In generateKanbanBoardWithMetadata (src/board.ts), replace the single-level
  top+children flattening with a depth-first emit: after pushing a task,
  recursively push its own children from the children map (sorted by ID
  ascending, as today). Flat data has no nested children, so output stays
  byte-identical.

  2. Grandchildren keep the existing subtask rendering shape (single '└─ '
  prefix), matching the current export format.

  3. Add tests in src/test/board.test.ts: one pinning that a
  subtask-of-a-subtask appears in the export under its parent chain, one pinning
  the exact flat parent/child output unchanged.

  4. Verify: bunx tsc --noEmit, bun run check ., bun test.
implementation_notes: >-
  Root cause: generateKanbanBoardWithMetadata built each column as top-level
  tasks plus their direct children only; a subtask grouped under a parent that
  is itself a subtask (children map keyed by the intermediate id) was never
  emitted. Fix: depth-first pushWithChildren recursion over the existing
  children map; per-level ID-ascending sort kept. Flat output proven
  byte-identical: the new exact-output flat test passes against pre-fix board.ts
  (verified via git stash), while the nested test fails pre-fix and passes
  post-fix. Full suite: only 3 pre-existing tui-emoji-width failures remain,
  also failing on clean main in this environment.
final_summary: >-
  Fixed the markdown board export dropping subtasks of subtasks (issue #944) by
  flattening each column depth-first over the existing children map in
  src/board.ts instead of one level deep; grandchildren keep the existing '└─ '
  subtask shape. Verified with two new tests in src/test/board.test.ts: an
  exact-output test pinning the nested chain and an exact-output flat
  parent/child test that also passes against the pre-fix code, proving unchanged
  flat output. bunx tsc --noEmit, bun run check ., and board tests all pass.
acceptance_criteria:
  - index: 1
    text: A subtask of a subtask appears in the exported board markdown
    checked: true
  - index: 2
    text: Existing flat parent/child export output is unchanged
    checked: true
  - index: 3
    text: A test pins the nested case
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
