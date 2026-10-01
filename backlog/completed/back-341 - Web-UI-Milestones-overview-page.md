---
task_schema_version: 2
id: BACK-341
title: 'Web UI: Milestones overview page'
status: Done
assignee:
  - '@codex'
created_date: '2025-12-08 16:17'
updated_date: '2025-12-16 22:31'
labels: []
dependencies: []
priority: medium
description: >-
  Add a Milestones page to the React web UI that surfaces milestone health and
  tasks. The app already loads milestones from config (and tasks carry an
  optional milestone), and Kanban now has milestone lanes. Build a dedicated
  page reachable from nav that shows all milestones (config + any discovered on
  tasks) plus a "No milestone" bucket. Each milestone should show status
  counts/progress, list tasks scoped to that milestone with open/edit shortcuts,
  and let users jump to the board in milestone lane mode or the task list
  filtered to that milestone. Include an "Add milestone" flow that updates
  config and reflects immediately. Keep cross-branch tasks read-only and reuse
  the existing task modal for edits. Handle many milestones with sensible
  layout/scrolling and empty states.
implementation_plan: >-
  - Data shaping: collect milestones from config + tasks; compute status counts
  and group tasks per milestone plus No milestone bucket.

  - UI: add Milestones page and nav entry; render cards/sections with
  counts/progress, expandable task list, and many-lane friendly scrolling/empty
  states.

  - Actions: link to board in milestone lane mode and to task list filtered by
  milestone; allow add milestone via config update and refresh state.

  - Tests: cover rendering, add flow, navigation links, and
  no-milestone/empty/many cases.
implementation_notes: >-
  Updated Milestones page to fill the viewport (grid layout, no nested card
  scrollbars) and reworked the add-milestone form to match task UI patterns with
  inline validation using shared helpers. Added milestone name validation tests.
  Ran: bun test src/web/utils/milestones.test.ts.


  Added quick links to navigate to board (milestone lane mode) and task list
  (filtered by milestone) from each milestone bucket. Fixed TypeScript errors.


  DoD verification: ran `bun test`, `bunx tsc --noEmit`, `bun run check .`.


  UX polish session: Redesigned unassigned tasks section with table layout (ID,
  Title, Status, Priority columns), drag handles for moving tasks to milestones,
  softer neutral styling (gray instead of amber), collapsible section, and
  click-to-edit functionality. Added hint text 'Drag tasks to a milestone below
  to assign them'. Milestone cards serve as drop targets with visual feedback on
  drag-over.
acceptance_criteria:
  - index: 1
    text: >-
      Navigation includes a Milestones page; it renders all configured
      milestones plus a No milestone bucket and any extra milestones found on
      tasks.
    checked: true
  - index: 2
    text: >-
      Each milestone section shows task counts by status and a progress
      indicator; clicking expands a task list for that milestone with open/edit
      actions that respect branch guards.
    checked: true
  - index: 3
    text: >-
      Milestone sections provide quick links to open the Kanban board in
      milestone lane mode for that milestone and to view tasks list filtered to
      that milestone.
    checked: true
  - index: 4
    text: >-
      Users can add a new milestone from this page; it updates config via the
      existing API and appears immediately without reload.
    checked: true
  - index: 5
    text: >-
      No-milestone tasks are visible in their own section, and all lists remain
      functional with many milestones (scrollable, empty states, no layout
      breakage).
    checked: true
  - index: 6
    text: >-
      Tests cover milestone rendering, add-milestone flow, navigation to
      board/tasks with milestone context, and no-milestone/empty states.
    checked: true
definition_of_done: []
comments: []
---
