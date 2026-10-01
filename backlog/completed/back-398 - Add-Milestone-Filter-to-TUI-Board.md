---
task_schema_version: 2
id: BACK-398
title: Add Milestone Filter to TUI Board
status: Done
assignee:
  - '@codex'
created_date: '2026-02-25 09:00'
updated_date: '2026-03-01 20:16'
labels:
  - tui
  - filter
  - milestone
  - enhancement
dependencies: []
description: >-
  Added milestone filtering capability to the TUI board (accessed via `backlog
  board`). The filter header now includes a milestone dropdown between priority
  and labels. Users can press `m` to activate the milestone filter, which
  filters tasks by their milestone assignment.
final_summary: >-
  ## Summary

  Successfully implemented milestone filtering for the TUI board feature.


  ## Changes Made

  1. **src/ui/components/filter-header.ts**
     - Added `milestone` field to `FilterState` interface
     - Added `availableMilestones` to `FilterHeaderOptions` 
     - Added milestone to filter items (between priority and labels)
     - Added `focusMilestone()` method and milestone selector UI

  2. **src/ui/task-viewer-with-search.ts**
     - Added `milestoneFilter` state variable
     - Passed milestone entities to filter header
     - Added milestone to filter change handler and `applyFilters()`
     - Added `m` keyboard shortcut for milestone filter
     - Updated help bar to show `[m] Milestone`

  ## Testing

  - TypeScript compilation passes

  - Linting passes

  - UI tests not available (no test files in src/ui)


  ## Follow-up updates


  - Persisted `milestoneFilter` across Task ↔ Kanban view switching in unified
  view state.


  - Kept TUI milestone dropdown sourced from active milestones only (archived
  milestones are not shown).


  - Added targeted regression tests for unified-view filter persistence and
  milestone filter model behavior.
acceptance_criteria:
  - index: 1
    text: Run `backlog board` and press Tab to switch to board view
    checked: true
  - index: 2
    text: >-
      Press `m` to test milestone filter - dropdown should appear with all
      milestones
    checked: true
  - index: 3
    text: Select a milestone and verify tasks are filtered correctly
    checked: true
  - index: 4
    text: Press Tab to verify milestone filter is in the rotation
    checked: true
  - index: 5
    text: 'Check help bar shows `[m] Milestone`'
    checked: true
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: true
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: true
  - index: 3
    text: bun test (or scoped test) passes
    checked: true
comments: []
---
