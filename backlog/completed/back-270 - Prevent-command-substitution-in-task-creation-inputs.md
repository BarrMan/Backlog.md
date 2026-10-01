---
task_schema_version: 2
id: BACK-270
title: Prevent command substitution in task creation inputs
status: Done
assignee:
  - '@codex'
created_date: '2025-09-17 21:20'
updated_date: '2026-07-01 18:04'
labels: []
dependencies: []
description: >-
  When creating tasks via the CLI we attempted to reference `backlog init`
  inside acceptance criteria text. The shell treated the backticks as command
  substitution and executed `backlog init`, injecting its prompt output into the
  saved task. We need a safer flow (guidance, escaping utilities, or CLI
  handling) so users can include literal backticks without corrupting task
  content.
implementation_plan: >-
  1. Inspect PR #361 patch, checks, comments, and conflicts against current
  main.

  2. Verify whether current public CLI/MCP/instruction surfaces already cover
  literal backtick safety.

  3. Replace the stale sanitizer approach with narrow current guidance for safe
  shell quoting where needed.

  4. Add regression assertions for the shipped instruction surfaces.

  5. Search backlog files for prompt-output corruption, run targeted checks,
  then close/update PRs accordingly.
implementation_notes: >-
  Inspected PR #361: it is open, conflicts with current main, has stale CI from
  September 2025, and uses a lossy post-substitution sanitizer. Decided not to
  merge that branch because Backlog.md cannot reconstruct literal backticks
  after the shell has already executed command substitution. Added shell-quoting
  guidance to the shipped CLI task-creation guide, generated agent guidelines,
  and CLI reference instead, with regression tests. Verified existing backlog
  task files do not contain stray backlog-init prompt output requiring repair.
final_summary: >-
  Added literal-backtick shell quoting guidance to the CLI task-creation
  workflow guide, generated agent guidelines, and CLI reference. Added
  regression coverage for the shipped CLI and agent instruction surfaces.
  Evaluated PR #361 and rejected its post-substitution sanitizer approach as
  lossy because the shell executes backticks before Backlog.md receives
  arguments. Verified no existing backlog task files needed repair.
acceptance_criteria:
  - index: 1
    text: >-
      Document safe quoting patterns for including literal backticks in CLI task
      commands.
    checked: true
  - index: 2
    text: >-
      Evaluate updating CLI helpers so they escape backticks before submission
      or offer a flag to bypass shell parsing.
    checked: true
  - index: 3
    text: >-
      Verify existing tasks are not affected by stray `backlog init` prompt text
      and repair any impacted files.
    checked: true
definition_of_done: []
comments: []
---
