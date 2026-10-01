---
task_schema_version: 2
id: BACK-274
title: Fix Kanban boards missing live updates
status: Done
assignee:
  - '@claude'
created_date: '2025-09-25 18:12'
updated_date: '2025-09-26 19:44'
labels: []
dependencies: []
description: >-
  ## Summary

  - Web UI Kanban board does not refresh its status columns when the
  configuration adds new statuses, so tasks moved into those statuses disappear
  until the browser reloads.

  - TUI Kanban board keeps rendering the preloaded snapshot and ignores updates
  from the task watcher, so tasks created or changed in another terminal
  instance never appear until the command is restarted.


  ## Goal

  Make both Kanban experiences reflect live changes (new statuses and
  new/updated tasks) without requiring a full restart or page reload.
implementation_plan: |-
  1. Part A: Fix Kanban boards missing live updates
     a. Add config watcher to detect status changes
     b. Implement WebSocket broadcast for config updates
     c. Update TUI board to subscribe to task updates
     d. Update web UI to refresh columns on config changes

  2. Part B: Consolidate task forms and restore archive
     a. Modify TaskDetailsModal to support optional task prop
     b. Add title field for create mode
     c. Add archive button to sidebar bottom
     d. Add onArchive prop and handler
     e. Update App.tsx to use TaskDetailsModal for both modes
     f. Add form validation for create mode
     g. Remove TaskForm component

  3. Testing
     a. Test live updates in both TUI and web
     b. Test create/edit flows with all features
     c. Test archive functionality
     d. Run type checks and linting
implementation_notes: >-
  - Added config watcher to keep status list fresh across web & TUI boards

  - Updated board renderers to consume live task/status updates

  - Broadcasting config changes so connected clients refresh automatically


  Additional scope: Consolidate task forms and restore archive functionality

  - The web UI uses two components (TaskForm for create, TaskDetailsModal for
  edit)

  - Archive button was lost when TaskDetailsModal replaced TaskForm for editing

  - Extend TaskDetailsModal to handle both create and edit modes

  - Add archive button to right sidebar bottom


  ## Implementation Summary

  - Added config watcher to server that broadcasts "config-updated" messages via
  WebSocket

  - Updated web UI to reload statuses when receiving config-updated messages

  - TUI already had task and config watchers in place, confirmed working

  - Extended TaskDetailsModal to support both create and edit modes

  - Added title field for create mode

  - Added archive button at bottom of right sidebar

  - Consolidated UI by removing TaskForm component

  - All functionality preserved: preview mode, inline editing, keyboard
  shortcuts
acceptance_criteria:
  - index: 1
    text: >-
      Web Kanban board shows tasks immediately after they move into a newly
      added status without a manual browser refresh.
    checked: true
  - index: 2
    text: >-
      Status configuration changes made with 'backlog config set statuses'
      update the web Kanban column list without restarting the browser session.
    checked: true
  - index: 3
    text: >-
      While 'backlog board' is running, tasks created or edited in another
      terminal are rendered in the TUI board without restarting the command.
    checked: true
  - index: 4
    text: Make task prop optional in TaskDetailsModal to support create mode
    checked: true
  - index: 5
    text: >-
      Add title field editing when in create mode (currently title is only in
      header)
    checked: true
  - index: 6
    text: Add onArchive prop and handler to TaskDetailsModal interface
    checked: true
  - index: 7
    text: Add archive button at bottom of right sidebar (below Dependencies section)
    checked: true
  - index: 8
    text: 'Show archive button only when editing existing task, not when creating'
    checked: true
  - index: 9
    text: Update App.tsx to use TaskDetailsModal for both create and edit modes
    checked: true
  - index: 10
    text: Handle form validation for required fields when creating new task
    checked: true
  - index: 11
    text: >-
      Preserve all existing UX improvements (preview mode, inline editing,
      keyboard shortcuts)
    checked: true
  - index: 12
    text: Test both create and edit flows work correctly with all features
    checked: true
  - index: 13
    text: Remove TaskForm component after migration is complete
    checked: true
definition_of_done: []
comments: []
---
