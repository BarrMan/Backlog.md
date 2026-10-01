---
task_schema_version: 2
id: BACK-376
title: Fix web task creation dropping selected milestone
status: Done
assignee:
  - '@codex'
created_date: '2026-02-08 23:41'
updated_date: '2026-02-08 23:42'
labels:
  - bug
  - web
  - api
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/506'
priority: high
description: >-
  Investigate and fix issue where creating a task from the web UI with a
  selected milestone results in the task being created without milestone
  assignment (appears under Unassigned). Ensure server task-creation path
  preserves milestone and add regression test coverage.
implementation_notes: >-
  Root cause: server `POST /api/tasks` did not forward `milestone` into
  `createTaskFromInput`, while update flow did. Added milestone mapping in
  `handleCreateTask` with string guard and added regression coverage in server
  API tests to verify milestone is preserved on create and retrievable via
  `/api/task/:id`.
final_summary: >-
  Web task creation now preserves selected milestone by forwarding `milestone`
  in server create-task payload mapping. Added regression test `persists
  milestone when creating tasks via POST` in
  `src/test/server-search-endpoint.test.ts` to prevent recurrence.
acceptance_criteria:
  - index: 1
    text: >-
      Creating a task via web API with a milestone persists that milestone on
      the created task.
    checked: true
  - index: 2
    text: A regression test covers the server create-task flow with milestone input.
    checked: true
  - index: 3
    text: >-
      Existing create/edit task behavior remains unchanged for requests without
      milestone.
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
