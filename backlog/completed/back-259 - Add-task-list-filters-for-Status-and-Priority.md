---
task_schema_version: 2
id: BACK-259
title: Add task list filters for Status and Priority
status: Done
assignee:
  - '@claude'
created_date: '2025-09-06 23:39'
updated_date: '2026-07-04 14:11'
labels:
  - tui
  - filters
  - ui
dependencies: []
priority: medium
description: >-
  Add two filter selectors in the Task List view:


  - Status filter: choose from configured statuses (To Do, In Progress, Done or
  custom)

  - Priority filter: choose from high, medium, low


  The filters should be accessible from the task list pane and update the list
  immediately. Keep controls minimal to match the simplified footer.
implementation_notes: >-
  Already implemented on main as of commit d0f3cff; closing with evidence
  instead of re-implementing. Evidence: src/ui/components/filter-header.ts
  provides the TUI filter header with status and priority controls
  (FilterControlId includes status/priority; buttons show 'All' when cleared).
  src/ui/task-viewer-with-search.ts wires it into the task list: statuses come
  from config (statuses = config?.statuses || defaults, ~line 217), priority
  choices are high/medium/low (~line 368), selections call applyFilters()
  immediately, and the 'All' choice (empty value) clears a filter; filter state
  is in-memory TUI session state so it resets on exit and coexists with existing
  navigation. Tests: src/test/filter-header-navigation.test.ts (filter header
  navigation), src/test/unified-view-filters.test.ts (status/priority filtering
  logic via createUnifiedViewFilters/applyTaskFilters),
  src/test/cli-priority-filtering.test.ts. Type-check and lint pass on main.
final_summary: >-
  No code change needed: TUI task list already ships status and priority filters
  (config-driven statuses, high/medium/low priorities, instant apply, clearable
  via 'All', session-scoped state) with test coverage. Closed as already
  implemented on main (d0f3cff).
acceptance_criteria:
  - index: 1
    text: >-
      Status filter is available in the task list and lists statuses from
      backlog/config.yml
    checked: true
  - index: 2
    text: 'Priority filter is available in the task list and lists: high, medium, low'
    checked: true
  - index: 3
    text: >-
      Applying a filter updates the task list immediately and can be cleared to
      show all tasks
    checked: true
  - index: 4
    text: Filters persist during the current TUI session and reset on exit
    checked: true
  - index: 5
    text: Works alongside existing navigation; minimal footer remains uncluttered
    checked: true
  - index: 6
    text: >-
      Tests cover filtering logic for status and priority; type-check and lint
      pass
    checked: true
definition_of_done: []
comments: []
---
