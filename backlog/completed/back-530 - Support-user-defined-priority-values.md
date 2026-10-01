---
task_schema_version: 2
id: BACK-530
title: Support user-defined priority values
status: Done
assignee:
  - '@codex'
created_date: '2026-07-09 06:18'
updated_date: '2026-07-09 21:10'
labels: []
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/732'
ordinal: 168000
description: >-
  GitHub issue #732 requests configurable task priority values beyond the
  built-in high/medium/low set, for example Very High, High, Medium, Low, Very
  Low. Backlog.md should allow a project to define its priority list in
  configuration while preserving the current default priorities for existing
  projects.
implementation_plan: >-
  1. Merge origin/main through #741/#744 and preserve hierarchical task-ID
  sorting, creation-date sorting, and custom-priority behavior/tests.

  2. Fetch the advanced origin/main at 219f733 and merge it normally, preserving
  deterministic label-order behavior/tests without rebasing or force-pushing.

  3. Run custom-priority, TaskList, TaskColumn, task-sorting, label-order, and
  board-adjacent focused tests; then type-check, Biome, and build.

  4. Review/simplify the final merged result, update BACK-530 notes and final
  summary, return it to Done, push, and verify the remote SHA.
implementation_notes: >-
  Implemented custom priority configuration across config parsing, core
  validation, CLI/help/search/list/edit flows, MCP schemas/handlers, server API
  filters, statistics, TUI/web filters, display, and sorting. Parser now
  preserves arbitrary stored priorities, while write/filter paths validate
  against the configured ordered list.


  Validation passed: bunx tsc --noEmit; bun run check .; bun run build; bun test
  src/test/search-command-query.test.ts src/test/cli-priority-filtering.test.ts;
  bun test (1453 pass, 2 skip, 0 fail).


  PR #743 review follow-up started from 1dea690: addressing completion quoting,
  Web URL canonicalization, and configured priority None statistics collision in
  a dedicated clean worktree.


  PR #743 review follow-up completed. Bash completion now preserves
  newline-delimited multi-word priorities as single candidates with Bash
  3.2-compatible syntax in both committed and embedded scripts. Board and All
  Tasks canonicalize configured priority URL values case-insensitively after
  config loads and clear unsupported values without invalid searches. Statistics
  now stores missing priorities in noPriorityCount, leaving configured None and
  other custom values distinct.


  Validation: bun test src/commands/completion.test.ts
  src/test/statistics.test.ts src/test/web-board-filters.test.tsx
  src/test/web-task-list-labels-menu.test.tsx (32 pass, 0 fail); bunx tsc
  --noEmit; bun run check .; bun run build; compiled-binary Bash completion
  smoke test on Bash 3.2.


  PR #743 conflict-resolution follow-up started from 27a2390; merging current
  main after #741/#744 without rebasing or force-pushing.


  PR #743 conflict resolution completed against origin/main 6226251. TaskList
  now uses the shared hierarchical ascending/descending ID comparators while
  retaining configured priority filtering, display, and ranking. TaskColumn
  retains configured priority ordering through the shared reorder emitter and
  includes #744 oldest/newest creation-date actions. Added a direct
  custom-priority TaskColumn regression and included availablePriorities in
  TaskList sort memo dependencies.


  Merge validation: bun test src/commands/completion.test.ts
  src/test/priority.test.ts src/test/statistics.test.ts
  src/test/task-sorting.test.ts src/test/web-board-filters.test.tsx
  src/test/web-task-list-labels-menu.test.tsx
  src/test/web-task-column-sort.test.tsx (79 pass, 0 fail); bun test
  src/web/lib/lanes.test.ts src/test/board.test.ts src/test/board-ui.test.ts (27
  pass, 0 fail); bunx tsc --noEmit; bun run check .; bun run build.


  origin/main advanced to 219f733 after the first merge push; continuing with a
  second normal merge so the final PR head includes deterministic label
  ordering.


  Integrated the advanced origin/main at 219f733 with a second normal merge.
  Resolved the sole TaskList test-harness conflict by combining availableLabels
  and availablePriorities options, retaining deterministic locale-independent
  label sorting, hierarchical ID tests, and custom-priority URL tests in the
  same suite.


  Final validation: bun test src/commands/completion.test.ts
  src/test/priority.test.ts src/test/statistics.test.ts
  src/test/task-sorting.test.ts src/test/label-filter.test.ts
  src/test/task-search-label-filter.test.ts src/test/web-board-filters.test.tsx
  src/test/web-task-list-labels-menu.test.tsx
  src/test/web-task-column-sort.test.tsx (90 pass, 0 fail); bun test
  src/web/lib/lanes.test.ts src/test/board.test.ts src/test/board-ui.test.ts (27
  pass, 0 fail); label-filter tests pass under en_US.UTF-8, sv_SE.UTF-8, and
  tr_TR.UTF-8; bunx tsc --noEmit; bun run check .; bun run build.
final_summary: >-
  Completed configurable priority support and its Bash/Web/statistics fixes,
  then merged current main through 219f733 without rebasing or force-pushing.
  The final branch preserves hierarchical All Tasks ID sorting, board
  creation-date sorting, locale-independent deterministic label ordering, and
  all custom-priority behavior; focused tests, locale checks, TypeScript, Biome,
  and build pass.
acceptance_criteria:
  - index: 1
    text: >-
      Projects can configure an ordered list of task priorities, and existing
      projects without configuration continue to use high, medium, low.
    checked: true
  - index: 2
    text: >-
      CLI create, edit, list, search, help text, and task wizard accept and
      display configured priority values case-insensitively.
    checked: true
  - index: 3
    text: >-
      MCP task schemas and handlers expose and validate configured priority
      values instead of a fixed high/medium/low enum.
    checked: true
  - index: 4
    text: >-
      Web task filters and task editing surfaces use the configured priority
      list and reject unsupported priority filters consistently.
    checked: true
  - index: 5
    text: >-
      Priority parsing, sorting, and statistics handle configured priority
      values without dropping custom priorities.
    checked: true
  - index: 6
    text: >-
      Regression tests cover a custom priority list with values beyond
      high/medium/low.
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
