---
task_schema_version: 2
id: BACK-626
title: 'Make task archive, complete, and demote local-first like view and edit'
status: Done
assignee:
  - '@shixi-li'
created_date: '2026-08-10 06:10'
updated_date: '2026-08-10 10:45'
labels: []
dependencies: []
ordinal: 262000
description: >-
  Follow-up from the PR #898 (BACK-623) review. task archive, task complete, and
  task demote still resolve their target through the default cross-branch
  loadTaskById (src/cli.ts around the archive/complete/demote handlers), so they
  pay the full corpus load and attempt a remote fetch that view/edit/list no
  longer do, and they surface different errors for branch-only tasks (archive:
  'Cannot archive task from another branch'; view: not found). Per the owner
  ruling that CLI task commands are local-only, align these three commands with
  the local active+completed resolution used by view/edit, including the
  fail-closed local ambiguity behavior and the branch-aware not-found hint. Not
  part of the v1.50.x hotfix release.
implementation_plan: >-
  1. Route task archive, complete, and demote through the working-copy
  active/completed resolver for both CLI preflight and Core mutation.

  2. Extend local task command tests for fetch tripwires, branch-only not-found
  hints, and active/completed ID ambiguity across all three lifecycle commands.

  3. Run the focused suite, typecheck, formatting/lint checks, and the relevant
  full test suite; then finalize BACK-626 with objective evidence.
implementation_notes: >-
  Kept existing Core callers backward-compatible by adding an optional third
  TaskReadOptions argument; only the CLI lifecycle handlers request
  working-copy-only resolution.

  Validation: focused local task test 9/9; lifecycle/Core/MCP scoped suite
  142/142; TypeScript, Biome, build, and git diff checks passed. Independent
  review found P0=0/P1=0.
final_summary: >-
  Made task archive, complete, and demote local-first at both CLI preflight and
  mutation boundaries. Branch-only targets now match view/edit guidance,
  remote/corpus loading is tripwired out, and local ID ambiguity remains
  fail-closed.
acceptance_criteria:
  - index: 1
    text: >-
      task archive, task complete, and task demote resolve targets through the
      shared local resolution used by task view and task edit
    checked: true
  - index: 2
    text: >-
      None of the three commands triggers a remote fetch or cross-branch corpus
      load (fetch-tripwire test)
    checked: true
  - index: 3
    text: >-
      Branch-only targets produce the same local not-found error and hint as
      task view
    checked: true
  - index: 4
    text: >-
      Local fail-closed ambiguity (AmbiguousTaskIdError) is preserved for all
      three commands
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
