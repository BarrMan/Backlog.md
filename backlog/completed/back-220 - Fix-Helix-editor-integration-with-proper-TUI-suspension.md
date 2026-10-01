---
task_schema_version: 2
id: BACK-220
title: Fix Helix editor integration with proper TUI suspension
status: Done
assignee:
  - '@claude'
created_date: '2025-08-01 20:16'
updated_date: '2025-08-01 20:50'
labels: []
dependencies: []
description: >-
  Fix critical issue with Helix editor integration in Backlog.md TUI where
  editor sessions caused screen corruption and input conflicts. The blessed TUI
  screen wasn't properly suspended when launching external editors, resulting in
  overlapping displays, unresponsive interface, and performance issues.
implementation_plan: |-
  1. Analyze blessed TUI suspension issues and root causes
  2. Design proper event listener preservation strategy
  3. Implement centralized editor integration method
  4. Add comprehensive screen clearing and restoration
  5. Update all UI contexts to use centralized method
  6. Test with multiple editors and UI states
  7. Verify no regression in existing functionality
implementation_notes: >-
  **Root Cause Analysis:**

  Blessed screen wasn't properly suspended when launching external editors,
  causing:

  1. Input event listeners remained active during editor sessions

  2. Screen buffer corruption when transitioning between TUI and editor

  3. Improper blessed screen state management


  **Approach Taken:**

  1. **Proper Input Isolation**: Save and restore blessed's event listeners
  instead of destructively removing them

  2. **Clean Screen Transitions**: Added comprehensive screen clearing and
  layout recalculation after editor sessions  

  3. **Centralized Editor Integration**: Created core.openEditor() method for
  consistent handling across all UI contexts

  4. **Enhanced Error Handling**: Proper restoration guaranteed even on editor
  failures


  **Technical Decisions:**

  - Enhanced suspend/restore pattern for blessed TUI applications

  - Event listener preservation using Map storage

  - Screen buffer clearing with clearRegion() and resize event emission

  - Works in all contexts: Kanban board, task viewer, popup states


  **Modified Files:**

  - src/core/backlog.ts - Added centralized openEditor() method

  - src/ui/board.ts - Updated to use centralized editor method  

  - src/ui/task-viewer.ts - Updated to use centralized editor method


  **Testing Results:**

  - All 448 existing tests pass

  - Editor integration now works seamlessly with Helix, vim, and other terminal
  editors

  - No input conflicts or UI corruption


  Fixes: https://github.com/MrLesk/Backlog.md/issues/244
acceptance_criteria:
  - index: 1
    text: Helix editor launches cleanly without TUI screen overlap
    checked: true
  - index: 2
    text: No background input processing during editor sessions
    checked: true
  - index: 3
    text: UI displays correctly after returning from editor
    checked: true
  - index: 4
    text: Interface remains responsive after editor sessions
    checked: true
  - index: 5
    text: Editor performance is not degraded
    checked: true
  - index: 6
    text: Solution works in Kanban board context
    checked: true
  - index: 7
    text: Solution works in task viewer context
    checked: true
  - index: 8
    text: All existing tests continue to pass
    checked: true
  - index: 9
    text: 'Works with multiple terminal editors (Helix, vim, etc.)'
    checked: true
definition_of_done: []
comments: []
---
