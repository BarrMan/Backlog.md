---
task_schema_version: 2
id: BACK-99
title: Fix loading screen border rendering and improve UX
status: Done
assignee: []
created_date: '2025-06-21'
updated_date: '2025-06-21'
labels: []
dependencies: []
description: >-
  Fixed multiple UX issues with the loading screen component in the Backlog.md
  CLI tool:


  1. **Windows compatibility**: Loading screen wasn't appearing on Windows due
  to terminal blocking during heavy async operations

  2. **Missing right border**: Content was overlapping and overwriting the right
  border of loading boxes

  3. **Poor spacing**: Text was attached directly to borders, reducing
  readability

  4. **Height issues**: Loading boxes were taller than necessary for the content
  they displayed

  5. **Text wrapping**: Long messages were wrapping to new lines in narrow boxes

  6. **Missing spinner**: Added animated spinner to title bar to show activity


  These issues were affecting the user experience across different platforms and
  making the loading screens less polished and functional.
implementation_plan: >-
  1. **Fix Windows terminal blocking**: Change `setImmediate` to `setTimeout`
  with small delay to allow terminal rendering

  2. **Diagnose border rendering issue**: Investigate why right border
  disappears with content

  3. **Fix content positioning**: Ensure content doesn't overlap borders by
  constraining width and positioning

  4. **Add title spinner**: Move spinner animation from box content to title bar

  5. **Optimize spacing and sizing**: Adjust heights, widths, and padding for
  better UX

  6. **Test cross-platform compatibility**: Verify fixes work on both Windows
  and Unix systems
implementation_notes: >-
  **Root cause**: Content was overlapping right border due to improper width
  calculations.


  **Key changes**:

  - Changed `setImmediate` to `setTimeout(resolve, 10)` for Windows
  compatibility (lines 205, 275)

  - Fixed content positioning: `left: 2, width: "100%-6"` to prevent border
  overlap (lines 192-194, 261-263)

  - Increased box widths to 60-70 chars to prevent text wrapping

  - Reduced heights to 5-6 rows for compact display

  - Moved spinner to title bar using `loadingBox.setLabel()`


  **Files**: `/src/ui/loading.ts`
acceptance_criteria:
  - index: 1
    text: Right border is fully visible and not overwritten by content
    checked: true
  - index: 2
    text: Loading screen has appropriate compact height that matches content
    checked: true
  - index: 3
    text: Spinner animation appears in title bar showing activity
    checked: true
  - index: 4
    text: Content has generous spacing from borders for better readability
    checked: true
  - index: 5
    text: Long messages do not wrap to new lines in the loading box
    checked: true
  - index: 6
    text: Loading screen appears on backlog board command with progress updates
    checked: true
  - index: 7
    text: Windows terminal compatibility with proper rendering timing
    checked: true
  - index: 8
    text: All existing tests continue to pass
    checked: true
definition_of_done: []
comments: []
---
