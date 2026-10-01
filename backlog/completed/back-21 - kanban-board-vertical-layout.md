---
completed_date: '2025-06-09'
task_schema_version: 2
id: BACK-21
title: Kanban board vertical layout
status: Done
assignee: []
reporter: '@MrLesk'
created_date: '2025-06-09'
updated_date: '2025-06-09'
labels: []
dependencies: []
description: >-
  Add a visualization to the Kanban board where all status columns are displayed
  vertically in a single column. Include both `--layout vertical` and a shortcut
  `--vertical` option for convenience.
implementation_notes: >-
  - Added `BoardLayout` type and support for `vertical` layout in
  `generateKanbanBoard`.

  - Introduced `--layout` option for `backlog board view` command.

  - Added `--vertical` shortcut flag that overrides `--layout` when specified.

  - Updated logic to prioritize `--vertical` flag over `--layout` option.

  - Updated tests and documentation to cover the new layout options.
acceptance_criteria:
  - index: 1
    text: Vertical Kanban view with all statuses in a single column
    checked: true
  - index: 2
    text: Support `--layout vertical` option for `backlog board view` command
    checked: true
  - index: 3
    text: Support `--vertical` shortcut option for `backlog board view` command
    checked: true
  - index: 4
    text: Documentation updated if necessary
    checked: true
definition_of_done: []
comments: []
---
