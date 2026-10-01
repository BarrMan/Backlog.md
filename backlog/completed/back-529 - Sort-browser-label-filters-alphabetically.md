---
task_schema_version: 2
id: BACK-529
title: Sort browser label filters alphabetically
status: Done
assignee:
  - '@codex'
created_date: '2026-07-09 06:09'
updated_date: '2026-07-09 20:57'
labels: []
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/733'
modified_files:
  - src/utils/label-filter.ts
  - src/test/label-filter.test.ts
  - src/test/web-task-list-labels-menu.test.tsx
ordinal: 168000
description: >-
  GitHub issue #733 reports that the Web UI All Tasks Labels dropdown shows
  labels in creation/configuration order rather than alphabetical order. The
  browser label filter menu should present labels lexicographically so users can
  scan and select labels predictably.
implementation_plan: >-
  1. Preserve the locale-independent label collector and its accented/NFC-NFD
  regression coverage.

  2. Merge origin/main with a normal merge commit, retaining BACK-528 shared
  task-ID sorting behavior and combining both TaskList Web test blocks.

  3. Run focused label, TaskList, and task-sorting suites plus TypeScript,
  Biome, and build without running the full live-worktree suite.

  4. Finalize BACK-529, inspect the merge diff/status, commit, and push the
  existing PR branch.
implementation_notes: >-
  Reproduced issue #733 with a focused TaskList Web UI test: before the fix, the
  Labels dropdown rendered zeta before Alpha because available labels preserved
  insertion order. Updated collectAvailableLabels to sort de-duplicated labels
  case-insensitively while preserving first-seen casing. Validation passed: bun
  test src/test/web-task-list-labels-menu.test.tsx
  src/test/label-filter.test.ts; bunx tsc --noEmit; bun run check .; bun test
  (1447 pass, 2 skip, 0 fail).


  Reopened to address the confirmed review gap: label ordering must be
  independent of host locale and input order for canonically equivalent Unicode
  forms. Full bun test is intentionally excluded in this live worktree because
  of the known destructive worktree-test interaction.


  Replaced the host-default Intl.Collator and localeCompare ordering with
  locale-independent UTF-16 code-unit comparison over lowercase NFD sort keys,
  followed by the original label as a raw code-unit tie-breaker.
  Case-insensitive de-duplication and first-seen spelling remain unchanged.


  Added focused coverage for accented ordering across locale expectations,
  reversed NFC/NFD inputs, and first-seen casing. Validation passed: bun test
  src/test/label-filter.test.ts src/test/web-task-list-labels-menu.test.tsx (12
  pass); label utility tests also passed under en_US.UTF-8 and sv_SE.UTF-8; bunx
  tsc --noEmit; bun run check .; bun run build. The full suite was not run from
  this live worktree because of the reported destructive worktree-test
  interaction; GitHub CI will run the full matrix after push.


  Reopened for integration after BACK-528 (#741) merged to main. The only
  content conflict is the shared TaskList Web test insertion point; resolution
  preserves both the label-order regression and all new hierarchical ID-sort
  regressions.


  Integrated origin/main at 5810c9e after BACK-528 (#741) merged. Resolved the
  sole content conflict in src/test/web-task-list-labels-menu.test.tsx by
  retaining the label-order regression plus all three hierarchical/nonnumeric
  ID-sort regressions. Main TaskList and task-sorting implementation files
  remain unchanged from origin/main.


  Validation passed on the merged tree: bun test
  src/test/web-task-list-labels-menu.test.tsx src/test/label-filter.test.ts
  src/test/task-sorting.test.ts src/test/task-search-label-filter.test.ts (46
  pass); bunx tsc --noEmit; bun run check .; bun run build. The full suite was
  not run from the live worktree because of the known destructive worktree-test
  interaction.
final_summary: >-
  Merged current main with a normal merge while preserving BACK-528 hierarchical
  ID sorting and BACK-529 locale-independent label sorting. Combined both Web
  TaskList regression blocks without altering main’s ID implementation; 46
  focused tests, TypeScript, Biome, and build pass. The full matrix remains
  delegated to GitHub CI for live-worktree safety.
acceptance_criteria:
  - index: 1
    text: >-
      The All Tasks Labels dropdown renders available labels in
      alphabetical/lexicographic order regardless of task creation order.
    checked: true
  - index: 2
    text: >-
      Label sorting is case-insensitive and deterministic for configured labels
      and labels discovered from tasks.
    checked: true
  - index: 3
    text: >-
      A Web UI regression test covers unordered input labels rendering
      alphabetically in the Labels dropdown.
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
