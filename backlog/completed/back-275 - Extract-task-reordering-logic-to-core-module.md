---
task_schema_version: 2
id: BACK-275
title: Extract task reordering logic to core module
status: Done
assignee:
  - '@codex'
created_date: '2025-09-26 19:07'
updated_date: '2025-09-27 19:06'
labels: []
dependencies: []
priority: medium
description: >-
  Currently, the task reordering logic for calculating ordinal values is
  duplicated between the web UI (TaskColumn.tsx) and server (index.ts). This
  logic should be centralized in the core module to ensure consistency across
  all interfaces. The core module should provide methods for calculating new
  ordinal values when moving tasks within columns or between columns, handling
  ordinal collisions, and bulk updating tasks efficiently. This will enable both
  the web UI and upcoming TUI drag mode to use the same reliable reordering
  logic.
implementation_plan: >-
  1. Audit existing web/server reordering flows to capture start/end,
  empty-column, and cross-column behaviors we must preserve.

  2. Create core/reorder.ts with calculateNewOrdinal and resolveOrdinalConflicts
  plus a Core.reorderTask method that centralizes logic (includes unit tests for
  edge cases).

  3. Refactor the server reorder endpoint to call the new core method, adjust
  the API payload (target status + neighbor context), and update the web UI to
  delegate ordering to the API instead of local ordinal math.

  4. Expand automated coverage (core utility tests + API/web integration
  scenarios) for collision handling, cross-column moves, and empty columns.

  5. Run lint/type/test commands, self-review, and capture implementation notes
  before completing DoD steps.
implementation_notes: >-
  - Core: added core/reorder.ts with shared
  calculateNewOrdinal/resolveOrdinalConflicts helpers and wired Core.reorderTask
  to use them.

  - Server: reorder endpoint now delegates to core.reorderTask and expects
  orderedTaskIds + targetStatus instead of raw ordinals.

  - Web: TaskColumn/Board rely on apiClient.reorderTask payloads rather than
  computing ordinals locally.

  - Tests: introduced reorder-utils coverage and ran `bun run check .`, `bunx
  tsc --noEmit`, `bun test`.


  - Web: brightened light-mode board columns with a white background, subtle
  border, and shadow for clearer separation.
acceptance_criteria:
  - index: 1
    text: Create core/reorder.ts module with reordering utility functions
    checked: true
  - index: 2
    text: >-
      Implement calculateNewOrdinal function that handles positioning
      before/after tasks
    checked: true
  - index: 3
    text: >-
      Implement resolveOrdinalConflicts function to reassign ordinals when
      needed
    checked: true
  - index: 4
    text: Add method to Core class for reordering tasks that uses the new utilities
    checked: true
  - index: 5
    text: Update web UI to use the new core reordering methods via API
    checked: true
  - index: 6
    text: Update server reorder endpoint to use core reordering logic
    checked: true
  - index: 7
    text: Add comprehensive tests for reordering edge cases
    checked: true
definition_of_done: []
comments: []
---
