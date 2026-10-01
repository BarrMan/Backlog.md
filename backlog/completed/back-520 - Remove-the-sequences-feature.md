---
task_schema_version: 2
id: BACK-520
title: Remove the sequences feature
status: Done
assignee:
  - '@alex-agent'
created_date: '2026-07-04 17:38'
updated_date: '2026-07-04 18:02'
labels: []
dependencies: []
ordinal: 115000
description: >-
  Owner decision (Alex, July 4, 2026): sequences is an abandoned direction;
  remove the feature rather than finish it.


  Remove the derived "sequences" execution-order feature end to end: the backlog
  sequence CLI command, sequence computation in core, the TUI sequences view,
  the /sequences server endpoints, and related docs and tests.


  Important scope boundary: the task dependencies field and all dependency
  semantics stay. Only the derived sequences view/computation is removed.
implementation_plan: >-
  1. Remove backlog sequence CLI command and computeSequences import from
  src/cli.ts

  2. Delete src/core/sequences.ts and src/ui/sequences.ts

  3. Remove listActiveSequences/moveTaskInSequences and sequence imports from
  src/core/backlog.ts; remove Sequence type from src/types/index.ts

  4. Remove /sequences, /sequences/move, /api/sequences, /api/sequences/move
  routes and handlers from src/server/index.ts

  5. Delete sequences test files and the unused markdown-test-helpers.ts (dead
  code, mostly sequence parsers)

  6. Update README.md and CLI-INSTRUCTIONS.md wording; keep dependency semantics
  intact

  7. Archive BACK-217, BACK-217.02/.03/.04, BACK-218 via CLI

  8. Gates: bunx tsc --noEmit, bun run check ., bun test; then rebase on
  origin/main and open PR with Breaking change section
implementation_notes: >-
  Removed: sequence CLI command (src/cli.ts), src/core/sequences.ts,
  src/ui/sequences.ts, core methods listActiveSequences/moveTaskInSequences,
  Sequence type, /sequences + /api/sequences endpoints and handlers, 5 sequences
  test files, unused src/test/markdown-test-helpers.ts (dead code, mostly
  sequence markdown parsers). Updated README bullet and CLI-INSTRUCTIONS
  dependency wording. Dependencies semantics untouched. Archived BACK-217,
  BACK-217.02-04, BACK-218.


  Validation: bunx tsc --noEmit clean; bunx biome check src scripts package.json
  biome.json clean (bun run check . ignores worktree path); bun test 1363 pass /
  1 fail = known pre-existing cli-priority-filtering timeout flake, passes in
  isolation (11/11).


  Review fix: CLI-INSTRUCTIONS previously claimed circular-dependency
  prevention; the CLI only validates that referenced dependency tasks exist
  (validateDependencies in src/utils/task-builders.ts, no cycle detection).
  Corrected both lines in the Dependency Management section. To be precise:
  dependency existence validation remains unchanged.
final_summary: >-
  Removed the sequences feature end to end: backlog sequence CLI command,
  src/core/sequences.ts, src/ui/sequences.ts,
  listActiveSequences/moveTaskInSequences in core, Sequence type, /sequences and
  /api/sequences server endpoints and handlers, 5 sequences test suites, and the
  unused markdown-test-helpers.ts. Updated README and CLI-INSTRUCTIONS wording.
  Dependencies field and semantics unchanged (verified --dep flags and views).
  Archived BACK-217, BACK-217.02-04, BACK-218. Verified with tsc, biome, and
  full bun test (only known flake failed, green in isolation).
acceptance_criteria:
  - index: 1
    text: The backlog sequence CLI command and its help text are removed
    checked: true
  - index: 2
    text: >-
      Sequence computation (src/core/sequences.ts) and the TUI sequences view
      (src/ui/sequences.ts) are removed along with the Sequence type and core
      sequence methods
    checked: true
  - index: 3
    text: >-
      The /sequences, /sequences/move, /api/sequences and /api/sequences/move
      server endpoints and their handlers are removed
    checked: true
  - index: 4
    text: >-
      Task dependencies field and dependency semantics remain unchanged
      (create/edit --dep, validation, board/task views)
    checked: true
  - index: 5
    text: README and CLI-INSTRUCTIONS no longer reference the sequences feature
    checked: true
  - index: 6
    text: >-
      All sequences feature tests are removed and type checks, lint, and the
      test suite pass
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
