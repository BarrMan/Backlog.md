---
task_schema_version: 2
id: BACK-352
title: Include subtask list in plain task output (CLI + MCP)
status: Done
assignee:
  - '@codex'
created_date: '2025-12-25 21:46'
updated_date: '2026-01-17 20:21'
labels: []
dependencies: []
description: >-
  Expose the actual list of child tasks when viewing a task in plain text so
  agents can see subtasks without running extra queries. This should work for
  CLI `task view`/`task <id>` with `--plain` and for the MCP `task_view` tool
  output; right now plain output only shows a count when subtasks are explicitly
  present.
implementation_plan: >-
  1. Compute subtasks during Core.loadTasks by grouping tasks with matching
  parent_task_id (numeric body match) and attach to each parent task as
  `subtasks` (IDs) plus `subtaskSummaries` (ID + title) in-memory only. Sort
  subtasks by ID for stable ordering.

  2. Remove on-demand subtask lookups and the formatter option used to pass
  subtasks; plain output reads from the task’s computed subtask summaries.

  3. Update CLI task view paths to load the task from the content store (so
  computed subtasks are present) and keep MCP `task_view` using the stored task.

  4. Update/extend tests to verify subtask lists still appear in CLI/MCP outputs
  and remain hidden when empty, plus add coverage for cross-prefix
  parent_task_id matching.

  5. Keep TUI/web documentation display changes; no new methods added.
implementation_notes: >-
  Summary:

  - Added subtask list rendering to plain task output and wired CLI/MCP
  task_view to supply parent-derived, ID-sorted subtask summaries.

  - Added documentation display to TUI task viewer/kanban popup and the web
  TaskDetailsModal popup.

  - Added automated coverage for subtask lists and documentation display in CLI,
  MCP, TUI, and web UI.


  Tests:

  - bun test src/test/cli-plain-output.test.ts

  - bun test src/test/mcp-tasks.test.ts

  - bun test src/test/tui-documentation.test.ts

  - bun test src/test/web-task-details-modal-documentation.test.tsx


  Follow-up:

  - Switched to precomputing subtasks in Core.loadTasks (derived from
  parent_task_id numeric match) and removed on-demand subtask queries; CLI/MCP
  now read the computed lists directly.

  - CLI task view now pulls from the content store so computed subtasks are
  present in plain output.


  Tests:

  - bun test src/test/cli-plain-output.test.ts

  - bun test src/test/mcp-tasks.test.ts

  - bun test src/test/task-path.test.ts


  Wrapped up: moved subtask summaries to on-demand enrichment (shared helper),
  removed cross-branch load for task view, and updated TUI selection flow to
  enrich subtasks on navigation.


  MCP task_view now uses on-demand subtasks; CLI task view uses local tasks;
  reverted cross-prefix equality change.


  Tests: bun test (full suite).


  Quality: bunx tsc --noEmit; bun run check . (clean).
acceptance_criteria:
  - index: 1
    text: >-
      Plain task output for a parent task includes a subtask list derived from
      tasks whose `parent_task_id` matches the viewed task ID, with each entry
      showing subtask ID and title in a stable order.
    checked: true
  - index: 2
    text: >-
      CLI `backlog task view <id> --plain` and `backlog task <id> --plain`
      include the subtask list when present.
    checked: true
  - index: 3
    text: MCP `task_view` tool output includes the same subtask list when present.
    checked: true
  - index: 4
    text: >-
      Automated tests cover a parent task with subtasks and a task with no
      subtasks for both CLI plain output and MCP `task_view` behavior.
    checked: true
  - index: 5
    text: >-
      TUI task viewer and kanban task popup display documentation entries when
      present.
    checked: true
  - index: 6
    text: >-
      Web UI task popup displays documentation entries when present (and remains
      hidden when none).
    checked: true
  - index: 7
    text: >-
      Automated tests cover documentation display for TUI task viewer/kanban
      popup and web UI task popup.
    checked: true
definition_of_done: []
comments: []
---
