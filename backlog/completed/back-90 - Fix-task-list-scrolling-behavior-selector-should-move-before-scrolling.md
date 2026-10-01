---
task_schema_version: 2
id: BACK-90
title: Fix task list scrolling behavior - selector should move before scrolling
status: Done
assignee:
  - '@claude'
created_date: '2025-06-19'
updated_date: '2025-06-19'
labels:
  - bug
  - ui
dependencies: []
description: >-
  The task list view currently has incorrect scrolling behavior. When navigating
  down from the first task, the view scrolls immediately while keeping the
  cursor on the first item, which feels unnatural. The expected behavior (as
  seen in the board view) is that the cursor should move down through all
  visible items first, and only start scrolling when the cursor reaches the
  bottom of the visible area. This provides a more intuitive navigation
  experience.
implementation_plan: >-
  1. Analyze the board view's scrolling implementation to understand correct
  behavior

  2. Compare with current generic list component scrolling behavior

  3. Modify generic list component to implement proper cursor-before-scroll
  behavior

  4. Ensure scrolling starts only when cursor reaches the visible area boundary

  5. Test with various list sizes to ensure smooth scrolling experience

  6. Verify the fix doesn't break other uses of generic list component
implementation_notes: >-
  ### Analysis

  The issue was caused by the generic list component using different navigation
  methods than the board view:

  - **Board view**: Uses `keys: false` and `listBox.select(index)` method

  - **Generic list**: Was using `keys: true` and `listBox.up()`/`listBox.down()`
  methods


  ### Solution

  Modified the generic list component in `/src/ui/components/generic-list.ts`:

  1. **Changed navigation methods**: Replaced `listBox.up()` and
  `listBox.down()` with `listBox.select(current ± 1)`

  2. **Updated blessed configuration**: Set `keys: false`, `vi: false`, and
  `alwaysScroll: false` to match board view

  3. **Added arrow key support**: Included `["up", "k"]` and `["down", "j"]` in
  key bindings


  ### Results

  - The cursor now moves through visible items before scrolling begins

  - Scrolling behavior matches the board view's intuitive navigation

  - All existing tests continue to pass

  - The fix applies to all uses of the generic list component
acceptance_criteria:
  - index: 1
    text: Cursor should move down through visible items before scrolling starts
    checked: true
  - index: 2
    text: >-
      Scrolling should only begin when cursor reaches the bottom of the visible
      area
    checked: true
  - index: 3
    text: >-
      Scrolling should maintain cursor at bottom while moving through remaining
      items
    checked: true
  - index: 4
    text: Match the scrolling behavior of the board view
    checked: true
  - index: 5
    text: Test scrolling with lists longer than the visible area
    checked: true
definition_of_done: []
comments: []
---
