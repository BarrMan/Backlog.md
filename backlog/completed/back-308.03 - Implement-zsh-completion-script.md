---
task_schema_version: 2
id: BACK-308.03
title: Implement zsh completion script
status: Done
assignee: []
created_date: '2025-10-23 10:08'
updated_date: '2025-10-27 21:33'
labels:
  - zsh
  - completion
dependencies:
  - task-308.01
parent_task_id: task-308
description: >-
  Create zsh completion script for the backlog CLI that provides tab completion
  for commands, subcommands, and options.


  The script should follow zsh completion conventions (_backlog function) and
  support:

  - Completion of top-level commands

  - Completion of subcommands

  - Completion of flags and options with descriptions

  - Dynamic completions where applicable
acceptance_criteria:
  - index: 1
    text: Zsh completion script created (_backlog function)
    checked: true
  - index: 2
    text: Top-level commands complete correctly
    checked: true
  - index: 3
    text: 'Subcommands complete for ''backlog task'', ''backlog doc'', etc.'
    checked: true
  - index: 4
    text: Flags and options complete with descriptions
    checked: true
  - index: 5
    text: Script follows zsh completion conventions
    checked: true
  - index: 6
    text: Tested in zsh 5.x
    checked: true
definition_of_done: []
comments: []
---
