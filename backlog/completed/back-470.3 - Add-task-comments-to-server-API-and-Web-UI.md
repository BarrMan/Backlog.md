---
task_schema_version: 2
id: BACK-470.3
title: Add task comments to server API and Web UI
status: Done
assignee:
  - '@codex'
created_date: '2026-05-31 17:32'
updated_date: '2026-06-07 21:39'
labels:
  - comments
  - server
  - web-ui
dependencies:
  - BACK-470.1
documentation:
  - src/server/index.ts
  - src/web/lib/api.ts
  - src/web/components/TaskDetailsModal.tsx
  - src/web/components/MermaidMarkdown.tsx
  - src/test/server-search-endpoint.test.ts
  - src/test/web-task-details-modal-final-summary.test.tsx
parent_task_id: BACK-470
priority: medium
ordinal: 29000
description: >-
  Add browser support for task comments using the same shared task model as CLI
  and MCP. The Web UI should display comments read-only in task detail preview
  and allow appending a new comment for local editable tasks only while the task
  modal is in edit mode.
implementation_plan: >-
  1. Add server update payload handling for comment appends via the existing
  task update endpoint.

  2. Extend Web API typing through the shared Task model.

  3. Add a comments section to the task modal preview that renders comments
  read-only, with the append form available only in edit mode for local editable
  tasks.

  4. Add server/Web tests for display, append, refresh, and read-only state
  where practical.
implementation_notes: >-
  Added server update payload handling, Web API typing, and TaskDetailsModal
  comment display/add controls. Manual browser verification at
  `http://localhost:6421` confirmed the Comments section, empty state, textarea,
  Add comment action, and no console/page errors.
final_summary: >-
  Server API responses include comments and the Web task details modal displays
  comments read-only in preview. Local editable tasks can append comments from
  edit mode without the add action changing the modal mode, while cross-branch
  read-only tasks keep the form hidden.
acceptance_criteria:
  - index: 1
    text: >-
      Server task responses include comments and a local editable task can
      receive a new comment through the task update API.
    checked: true
  - index: 2
    text: >-
      Web task detail displays comments in chronological order with readable
      author, timestamp, and markdown-rendered body.
    checked: true
  - index: 3
    text: >-
      Web users can add a comment while editing an editable task, and adding a
      comment does not switch the modal out of edit mode.
    checked: true
  - index: 4
    text: >-
      Read-only cross-branch tasks display comments but do not allow comment
      submission.
    checked: true
  - index: 5
    text: >-
      Web/API tests cover comment display, append behavior, refresh behavior,
      and read-only disabling.
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
