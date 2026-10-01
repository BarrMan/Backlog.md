---
task_schema_version: 2
id: BACK-24.1
title: 'CLI: Kanban board milestone view'
status: Done
assignee:
  - '@codex'
created_date: '2025-06-09'
updated_date: '2025-12-17 21:47'
labels: []
dependencies: []
parent_task_id: task-24
ordinal: 1000
description: >-
  Add a backlog board view --milestones or -m to view the board based on
  milestones (non-TTY/markdown output only)
implementation_plan: |-
  - Add `-m/--milestones` flag to `backlog board view`
  - Group tasks by milestone (including "No milestone") in milestone view output
  - Update docs/help text for the new flag
implementation_notes: >-
  Added -m/--milestones flag to CLI board command. When used with non-TTY output
  (piped to file or `| cat`), generates milestone-grouped markdown board. The
  flag is passed to the TUI but milestone swimlanes are NOT implemented in the
  interactive terminal view - the flag is effectively ignored in TTY mode.


  DoD verification: ran `bun test`, `bunx tsc --noEmit`, `bun run check .`.
acceptance_criteria:
  - index: 1
    text: >-
      `backlog board view --milestones` or `-m` outputs milestone-grouped
      markdown when piped or in non-TTY mode
    checked: true
  - index: 2
    text: Documentation updated if necessary
    checked: true
definition_of_done: []
comments: []
---
