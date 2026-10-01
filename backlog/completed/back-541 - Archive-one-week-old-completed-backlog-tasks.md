---
task_schema_version: 2
id: BACK-541
title: Archive one-week-old completed backlog tasks
status: Done
assignee:
  - '@alex-agent'
created_date: '2026-07-12 20:09'
updated_date: '2026-07-12 20:15'
labels: []
dependencies: []
type: chore
ordinal: 189000
description: >-
  Keep the active backlog focused by publishing the user-approved one-week
  cleanup of terminal tasks. This housekeeping change preserves each task record
  while moving eligible completed work out of the active task directory.
implementation_plan: >-
  1. Audit the cleanup index for exactly 151 byte-identical task moves and no
  unrelated state. 2. Publish the moves with this bounded housekeeping record.
  3. Rebase onto current origin/main and repeat the exact-scope verification
  before pushing.
implementation_notes: >-
  Initial audit: 151 R100 moves from backlog/tasks to backlog/completed; zero
  content changes, unstaged files, or untracked files.


  Final verification before publication: 151 status-Done records are R100 moves
  with identical filenames and blob hashes; latest effective task date is
  2026-07-04 18:15, older than the one-week cutoff; no unstaged, untracked,
  active-task, source, or configuration changes. bun test
  src/test/cleanup.test.ts passed 10/10. The full suite passed 1693 tests with 2
  skips and one unrelated existing 5-second SPA branch-scan hook timeout; it was
  not rerun.
final_summary: >-
  Published the approved one-week backlog cleanup by moving exactly 151 eligible
  Done task records into backlog/completed without changing their filenames or
  contents. Verified exact Git scope and blob identity, terminal status and age
  eligibility, a clean worktree outside this task, and the cleanup suite (10/10
  passing).
acceptance_criteria:
  - index: 1
    text: >-
      Exactly the 151 tasks selected by the one-week cleanup are moved from
      backlog/tasks to backlog/completed
    checked: true
  - index: 2
    text: Each moved task keeps the same filename and byte-identical contents
    checked: true
  - index: 3
    text: 'No active task, source code, configuration, or unrelated file is changed'
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
