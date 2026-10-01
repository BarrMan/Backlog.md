---
task_schema_version: 2
id: BACK-76.3
title: Migrate UI components to use neo-neo-blessed
status: Won't Do
assignee: []
created_date: '2025-06-16'
labels:
  - refactoring
  - ui
  - migration
dependencies: []
parent_task_id: task-76
description: >-
  Migrate all UI components from blessed to neo-neo-blessed, updating import
  statements and adapting to any API changes identified in the assessment phase.


  Key areas to migrate:

  - Board view (`/src/ui/board.ts`)

  - Task viewer (`/src/ui/task-viewer.ts`)

  - Generic list component (`/src/ui/components/generic-list.ts`)

  - TUI main file (`/src/ui/tui.ts`)

  - All other UI components using blessed


  This involves:

  - Updating all import statements from CommonJS to ESM syntax

  - Adapting code to handle any API differences

  - Ensuring event handlers work correctly

  - Maintaining existing functionality and behavior
acceptance_criteria:
  - index: 1
    text: Update all blessed imports to neo-neo-blessed using ESM syntax
    checked: false
  - index: 2
    text: Migrate board view component to neo-neo-blessed
    checked: false
  - index: 3
    text: Migrate task viewer component to neo-neo-blessed
    checked: false
  - index: 4
    text: Migrate generic list component to neo-neo-blessed
    checked: false
  - index: 5
    text: Update TUI main file to use neo-neo-blessed
    checked: false
  - index: 6
    text: Fix any API incompatibilities identified during migration
    checked: false
  - index: 7
    text: 'Ensure all event handlers (keyboard, mouse) work correctly'
    checked: false
  - index: 8
    text: Verify screen rendering and layout remain consistent
    checked: false
  - index: 9
    text: Update any custom blessed extensions or patches
    checked: false
  - index: 10
    text: Remove any CJS-specific import workarounds
    checked: false
definition_of_done: []
comments: []
---
## Migration Cancellation Note

This task has been cancelled. After assessment (task 76.1), it was determined that neo-neo-blessed does not support ESM modules, which contradicts its main selling point. The migration to neo-neo-blessed has been abandoned in favor of continuing with the current blessed implementation.