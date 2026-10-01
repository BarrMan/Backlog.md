---
task_schema_version: 2
id: BACK-273.04
title: '273.04: CLI & TUI search integration'
status: Done
assignee:
  - '@codex'
created_date: '2025-09-19 18:33'
updated_date: '2025-09-21 17:46'
labels:
  - cli
  - tui
  - search
dependencies: []
parent_task_id: task-273
description: >-
  Route the CLI and TUI experiences through the new content store/search
  service. Replace direct filesystem filters, add a backlog search command
  (plain output + interactive prefilled view), and surface status/priority
  dropdowns alongside the new search box in the TUI task list.
implementation_notes: >-
  Implemented comprehensive CLI & TUI search integration:



  ## CLI Search Command

  - Added `backlog search` command with query, --type, --status, --priority
  filters

  - Supports --plain output for scripts/AI with inverted scores (higher = better
  match)

  - Launches interactive TUI when run without --plain flag

  - Made status and priority filters case-insensitive


  ## TUI Search Interface

  - Added interactive search box with live filtering (no Enter needed)

  - Added status and priority dropdown filters with live updates

  - Implemented Tab key navigation between search, status, priority filters

  - Fixed Tab key insertion issue by configuring neo-neo-blessed textbox with
  ignoreKeys

  - Fixed backspace/delete key handling in search input

  - Maintains filter state when switching between task list and kanban views

  - Shows filtered task count in pane label

  - Proper focus management: search gets focus when launched with query, task
  list otherwise


  ## neo-neo-blessed Library Enhancements

  - Made textbox component configurable with ignoreKeys option

  - Fixed single-line textbox backspace/delete handling

  - Updated TypeScript definitions


  ## Documentation

  - Added search command documentation to agent-guidelines.md for AI agents

  - Added user-friendly search documentation to README.md

  - Placed search section after Definition of Done in guidelines


  ## Quality

  - All TypeScript compilation checks pass (bunx tsc --noEmit)

  - Biome formatting and linting pass (bun run check .)

  - Tests cover search service integration
acceptance_criteria:
  - index: 1
    text: >-
      backlog task list and unified view fetch tasks via the content
      store/search service (no ad-hoc filtering).
    checked: true
  - index: 2
    text: >-
      New backlog search command accepts a query, supports --plain output, and
      opens the interactive task list with the search field populated when run
      without --plain.
    checked: true
  - index: 3
    text: >-
      TUI task list header renders search input plus status/priority dropdowns
      backed by the shared filter API.
    checked: true
  - index: 4
    text: >-
      bun run check ., bunx tsc --noEmit, and bun test cover CLI command + TUI
      integration.
    checked: true
  - index: 5
    text: >-
      Search scores are intuitive (higher score = better match, not Fuse.js
      default)
    checked: true
  - index: 6
    text: Status and priority filters are case-insensitive
    checked: true
  - index: 7
    text: Filter state persists when switching between task list and kanban views
    checked: true
  - index: 8
    text: Search input gets focus when launched with query parameters
    checked: true
  - index: 9
    text: >-
      Tab key navigates between filters without inserting tab characters in
      search input
    checked: true
  - index: 10
    text: Backspace and delete keys work correctly in search input
    checked: true
  - index: 11
    text: TUI shows consistent footer styling between task list and kanban views
    checked: true
  - index: 12
    text: >-
      Escape key behavior: cancels filters when in filter mode, quits when in
      task list
    checked: true
  - index: 13
    text: >-
      Search command shows TUI even when initial search has no task results
      (shows all tasks)
    checked: true
  - index: 14
    text: >-
      Initial filters are applied immediately when TUI opens with search
      parameters
    checked: true
definition_of_done: []
comments: []
---
