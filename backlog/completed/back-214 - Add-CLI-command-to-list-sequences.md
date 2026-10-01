---
task_schema_version: 2
id: BACK-214
title: Add CLI command to list sequences
status: Done
assignee:
  - '@codex'
created_date: '2025-07-27'
updated_date: '2025-08-26 16:45'
labels:
  - sequences
  - cli
dependencies:
  - task-213
description: >-
  Provide a command to inspect computed sequences. The command is interactive by
  default and supports --plain for machine-readable text output. It must reuse
  the core computation from task-213 and avoid duplicated logic.
implementation_plan: >-
  1. Add CLI group "sequence" with subcommand "list".

  2. Reuse computeSequences to compute layered groups from tasks.

  3. --plain: print machine-readable output: for each sequence, show "Sequence
  <n>:" and lines "  task-<id> - <title>".

  4. Interactive default: open scrollable viewer with the same grouped content
  (no special TUI; 215.x will add rich TUI).

  5. Provide descriptive help/description for the command and flags.

  6. Add tests: create tasks with dependencies and assert plain output
  formatting.

  7. Run tests, lint check; adjust as needed.
implementation_notes: >-
  Implemented sequence CLI command with interactive default and --plain format.
  Reused computeSequences, printed sequences deterministically, and added tests
  asserting plain output. Command help describes usage/flags. All tests pass
  locally.


  Exclude Done tasks from sequences:

  - CLI filters Done before computeSequences.

  - Added test to assert Done tasks are excluded from --plain output.


  Updated to print Unsequenced bucket first in --plain and TUI path consumes {
  unsequenced, sequences } from core.
acceptance_criteria:
  - index: 1
    text: >-
      Introduce a \'backlog sequence list\' command; interactive by default;
      --plain outputs text
    checked: true
  - index: 2
    text: Plain output lists each sequence index and tasks as "task-<id> - <title>"
    checked: true
  - index: 3
    text: Reuse core compute function from task-213; do not duplicate logic in CLI
    checked: true
  - index: 4
    text: CLI help text explains usage and --plain flag
    checked: true
  - index: 5
    text: Tests verify plain output format
    checked: true
  - index: 6
    text: Exclude tasks with status Done from sequences
    checked: true
  - index: 7
    text: >-
      --plain prints Unsequenced first (if present), then numbered sequences;
      Done tasks excluded
    checked: true
definition_of_done: []
comments: []
---
