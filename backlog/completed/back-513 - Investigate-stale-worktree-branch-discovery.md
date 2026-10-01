---
task_schema_version: 2
id: BACK-513
title: Investigate stale worktree branch discovery
status: Done
assignee:
  - '@codex'
created_date: '2026-07-01 17:57'
updated_date: '2026-07-01 18:10'
labels:
  - bug
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/689'
modified_files:
  - src/core/backlog.ts
  - src/core/content-store.ts
  - src/test/worktree-refresh.test.ts
priority: medium
ordinal: 110000
description: >-
  Issue #689 reports that Backlog sees active branches/worktrees only at startup
  and does not refresh later when check_active_branches is true. Investigate
  whether the local branch/worktree task scanner caches state incorrectly,
  reproduce if feasible, and make the smallest safe fix.
implementation_plan: >-
  1. Reproduce the stale long-lived process path with a real git worktree:
  initialize a watcher-backed Core, query once, commit a task on a second
  worktree branch, then query again with check_active_branches enabled.

  2. Reuse ContentStore's existing cross-branch loader refresh instead of adding
  a new scanner or watcher layer.

  3. Refresh tasks before watcher-backed cross-branch reads/searches after
  initial startup, preserving CLI one-shot behavior and
  check_active_branches=false behavior.

  4. Run focused tests plus type/check validation as needed.
implementation_notes: >-
  Implemented the fix in the existing ContentStore/Core path. Diagnosis: direct
  branch scans were fresh, but watcher-backed long-lived Core instances served
  list/search results from the initialized ContentStore until a current-worktree
  filesystem event happened. Reused the loader-backed task refresh before
  watcher-backed cross-branch reads, and guarded no-op refreshes so unchanged
  snapshots do not notify clients.


  Validation: bun test src/test/worktree-refresh.test.ts; bun test
  src/test/content-store.test.ts src/test/search-service.test.ts; bun test
  src/test/find-task-in-branches.test.ts src/test/worktree-refresh.test.ts; bunx
  tsc --noEmit; bun run check . Full bun test run had 1341 pass / 2 skip / 1
  timeout in CLI Priority Filtering > case insensitive priority filtering;
  rerunning that single test passed.
final_summary: >-
  Fixed stale long-lived task reads for worktree branch changes by refreshing
  the existing loader-backed ContentStore before watcher-backed cross-branch
  list/search queries. Added a git-worktree regression that starts on main,
  initializes list/search caches, commits a task in another worktree branch, and
  verifies the original Core sees it without restart. Verified with focused
  tests, typecheck, Biome, and reran the only full-suite timeout successfully.
acceptance_criteria:
  - index: 1
    text: >-
      With check_active_branches: true, task search/listing reflects newly
      committed task changes in another worktree after Backlog has already
      started
    checked: true
  - index: 2
    text: >-
      Focused tests cover refreshing branch/worktree state without broad feature
      expansion
    checked: true
  - index: 3
    text: >-
      If no safe fix is clear, leave a precise diagnostic or GitHub comment
      explaining the observed behavior
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
