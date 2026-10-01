---
task_schema_version: 2
id: BACK-24.02
title: 'CLI TUI: Add milestone swimlanes to interactive board view'
status: Done
assignee: []
created_date: '2025-12-17 21:42'
updated_date: '2026-08-10 05:28'
labels:
  - cli
  - tui
  - enhancement
dependencies: []
parent_task_id: BACK-24
priority: low
ordinal: 22000
description: >-
  The `-m/--milestones` flag for `backlog board` only works in non-TTY mode
  (markdown output). The interactive TUI board ignores the flag entirely.


  Implement milestone swimlanes in the TUI board view to match the web UI's
  milestone view behavior - grouping tasks by milestone with collapsible
  sections.
implementation_notes: >-
  Maintainer decision: close this task as Done without implementation or
  additional acceptance criteria.
final_summary: >-
  Marked Done by maintainer direction. No code changes were requested or made
  for milestone swimlanes.
acceptance_criteria: []
definition_of_done: []
comments: []
---
