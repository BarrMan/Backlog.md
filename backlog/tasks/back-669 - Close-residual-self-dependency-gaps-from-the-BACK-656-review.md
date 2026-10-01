---
task_schema_version: 2
id: BACK-669
title: Close residual self-dependency gaps from the BACK-656 review
status: Done
assignee:
  - '@Claude'
created_date: '2026-08-31 00:26'
updated_date: '2026-08-31 21:02'
labels:
  - cli
  - bug
dependencies: []
ordinal: 301000
description: >-
  Two residual defects deferred at PR #978 merge, both small: (1) a legacy draft
  carrying a dangling dependency reference equal to the NEXT allocated task ID
  slips past validation on promotion — resolveUniqueDependency returns null, the
  invalid list is ignored on that path, and the unchanged reference is written
  under the newly allocated ID as a direct self-dependency (demotion has the
  mirror problem with draft IDs); check references against the allocated target
  before corpus resolution even when unresolved. (2) doctor --fix bases its
  final dependency-findings exit status on the pre-repair snapshot, so a
  self-dependency that the duplicate-ID repair itself resolves still reports
  remaining findings and exits 1; re-run findDependencyDefects after
  repairDuplicateTaskIds.
implementation_plan: >-
  1. In validateDependencies (src/utils/task-builders.ts), move the target
  self-check before resolveUniqueDependency and compare the raw dependency
  spelling to target.id with taskIdsEqual, replacing the post-resolution check
  it subsumes; dangling refs equal to the allocated promotion/demotion ID then
  fail closed.

  2. In doctor --fix (src/cli.ts), re-run findDependencyDefects after
  repairDuplicateTaskIds and gate the final dependency-findings message and exit
  code on the repaired corpus.

  3. Tests: promotion and demotion with a dangling reference equal to the next
  allocated ID are rejected; doctor --fix exits 0 when the duplicate-ID repair
  resolves the self-dependency finding.

  4. Proof: bunx tsc --noEmit, bun run check ., bun test.
implementation_notes: >-
  Moved the self-dependency check in validateDependencies ahead of corpus
  resolution, comparing the raw input to target.id with taskIdsEqual (the same
  predicate the corpus filter uses, so it subsumes the removed post-resolution
  check). doctor --fix now re-runs findDependencyDefects after
  repairDuplicateTaskIds and gates the final dependency message/exit on the
  repaired corpus. Tests: promotion and demotion with a dangling ref equal to
  the allocated ID are rejected and write nothing; doctor --fix exits 0 when the
  rename resolves the self-dependency. tsc, biome, and the two touched test
  files are green; full suite running.


  Full suite: only pre-existing tui-emoji-width failures remain locally; they
  fail identically on unmodified origin/main and the diff does not touch
  src/tui. PR: https://github.com/MrLesk/Backlog.md/pull/982


  Review round (Codex on PR #982): reordered validateDependencies so unique
  corpus resolution runs before the raw-target self check, restoring bare-number
  resolution to existing records (bare 1 -> DRAFT-1 during TASK-1 creation)
  while still rejecting dangling refs equal to the allocated ID; doctor --fix
  now prints the post-repair defects report before the findings-remain line. New
  tests for both; tsc/biome green, dependency+doctor suites 52/52, adjacent
  dependency suites 76/76. Head 50772df2.
final_summary: >-
  Moved the self-dependency check in validateDependencies ahead of corpus
  resolution (raw input vs target via taskIdsEqual, subsuming the old
  post-resolution check), so promotion/demotion of a record carrying a dangling
  reference equal to the freshly allocated ID now fails closed instead of
  writing a self-dependency. doctor --fix re-runs findDependencyDefects after
  repairDuplicateTaskIds so its exit reflects the repaired corpus. Verified with
  new tests (promotion and demotion rejection cases in
  src/test/dependency.test.ts; doctor --fix exit-0 case in
  src/test/cli-doctor.test.ts), bunx tsc --noEmit, bun run check ., and bun
  test. Delivered as PR #982 (unmerged).
acceptance_criteria:
  - index: 1
    text: >-
      Promoting or demoting a record with a dangling reference equal to the
      allocated ID is rejected; no self-dependency can be written
    checked: true
  - index: 2
    text: doctor --fix exit status reflects the post-repair corpus
    checked: true
  - index: 3
    text: Tests cover both scenarios
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
