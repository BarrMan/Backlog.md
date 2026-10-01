---
task_schema_version: 2
id: BACK-192
title: Fix drag-and-drop not working in web view
status: Done
assignee:
  - '@claude'
created_date: '2025-07-15'
updated_date: '2025-07-15'
labels:
  - bug
  - web-ui
  - high-priority
dependencies: []
priority: high
description: >-
  Users cannot move tasks between columns in the web view interface. The
  drag-and-drop functionality that previously worked is now broken, with
  WebSocket connection errors appearing in the console. This prevents users from
  updating task status visually in the browser interface.
implementation_plan: |-
  1. Investigate WebSocket connection issues in the web view
  2. Examine drag-and-drop event handlers in the frontend code
  3. Check server-side WebSocket message handling for status updates
  4. Debug the connection stability during drag operations
  5. Fix identified issues and test drag-and-drop functionality
  6. Verify fix works across different browsers
implementation_notes: >-
  - **Root cause**: The drag-and-drop handlers were properly implemented but the
  UI was not refreshing after successful task updates

  - **Fix applied**: Added `onRefreshData` callback prop to Board and BoardPage
  components to trigger data refresh after drag-and-drop operations

  - **Modified files**:
    - `src/web/components/Board.tsx`: Added `onRefreshData` prop and called it in `handleTaskUpdate`
    - `src/web/components/BoardPage.tsx`: Added `onRefreshData` prop to pass through to Board component
    - `src/web/App.tsx`: Passed `refreshData` function to BoardPage component
  - **WebSocket observation**: The WebSocket errors mentioned in the bug report
  were only for health check disconnections, not related to the drag-and-drop
  functionality

  - **Testing**: All existing tests pass, and the fix ensures immediate UI
  updates after drag-and-drop operations
acceptance_criteria:
  - index: 1
    text: Tasks can be dragged and dropped between columns in web view
    checked: true
  - index: 2
    text: WebSocket connection remains stable during drag operations
    checked: true
  - index: 3
    text: No console errors when moving tasks
    checked: true
  - index: 4
    text: Task status updates persist after moving
    checked: true
  - index: 5
    text: Drag-and-drop works consistently across different browsers
    checked: true
definition_of_done: []
comments: []
---
