---
task_schema_version: 2
id: BACK-342
title: 'Web Kanban: add swimlanes (milestone MVP) to board view'
status: Done
assignee:
  - '@codex'
created_date: '2025-12-14 14:44'
updated_date: '2025-12-14 20:15'
labels: []
dependencies: []
priority: medium
description: >-
  Build the first swimlanes MVP for the React web Kanban board using milestones
  only (aligns with GH issue #280). Today the board
  (src/web/components/Board.tsx + TaskColumn/TaskCard) renders a single row of
  status columns and groups tasks only by status; drag/drop posts to
  /api/tasks/reorder. Add a swimlane toggle (default None) that, when set to
  Milestone, renders rows per milestone (including a "No milestone" lane). Each
  lane shows the same status columns filtered to that milestone. Drag/drop
  across columns within a lane updates status/ordering; dropping into another
  milestone lane updates the task milestone and preserves the correct per-status
  order via the existing reorder API/ordinal logic. Keep branch drag guards and
  Done cleanup control. Persist the selected lane (localStorage or query param)
  so it restores on revisit.
implementation_plan: >-
  - Add swimlane toggle (None/Milestone) and persist selection

  - Render milestone lanes (including "No milestone") as rows of status columns

  - Update drag/drop to set status and milestone, preserving per-status ordering
  via `/api/tasks/reorder`

  - Keep branch drag guards and Done cleanup controls in swimlane mode

  - Add tests for grouping, moving between milestones, and many-lane
  empty/scroll states
implementation_notes: >-
  Swimlane implementation complete: toggle exists, milestone lanes render
  correctly, drag-drop updates milestone via targetMilestone API, cross-branch
  tasks non-draggable, tests pass.


  DoD verification: ran `bun test`, `bunx tsc --noEmit`, `bun run check .`.
acceptance_criteria:
  - index: 1
    text: >-
      Board has a swimlane toggle with options: None (current layout) and
      Milestone; defaults to None and switching doesn’t require a page reload.
    checked: true
  - index: 2
    text: >-
      Milestone swimlane mode renders one row per milestone (plus a No milestone
      lane), each containing the full set of status columns; each task appears
      in exactly one lane based on its milestone.
    checked: true
  - index: 3
    text: >-
      Drag/drop within a lane updates status and ordering; dropping into a
      different milestone lane updates the task milestone and keeps it in that
      lane after refresh.
    checked: true
  - index: 4
    text: >-
      Reordering in swimlane view preserves per-status ordering for all tasks
      and continues to use the /api/tasks/reorder endpoint.
    checked: true
  - index: 5
    text: >-
      Cross-branch tasks remain non-draggable, and the Done/cleanup affordance
      stays available in swimlane mode.
    checked: true
  - index: 6
    text: >-
      Tests cover milestone grouping, moving tasks between milestones, and
      handling many lanes (scrollable/empty states).
    checked: true
definition_of_done: []
comments: []
---
