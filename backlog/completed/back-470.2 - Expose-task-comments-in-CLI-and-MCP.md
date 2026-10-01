---
task_schema_version: 2
id: BACK-470.2
title: Expose task comments in CLI and MCP
status: Done
assignee:
  - '@codex'
created_date: '2026-05-31 17:32'
updated_date: '2026-05-31 17:59'
labels:
  - comments
  - cli
  - mcp
dependencies:
  - BACK-470.1
documentation:
  - src/cli.ts
  - src/types/task-edit-args.ts
  - src/utils/task-edit-builder.ts
  - src/formatters/task-plain-text.ts
  - src/mcp/tools/tasks/handlers.ts
  - src/mcp/tools/tasks/index.ts
  - src/mcp/tools/tasks/schemas.ts
  - src/mcp/utils/schema-generators.ts
  - src/test/cli-plain-output.test.ts
  - src/test/mcp-tasks.test.ts
parent_task_id: BACK-470
priority: medium
ordinal: 28000
description: >-
  Expose task comments through the public command-line and MCP task surfaces
  after the shared model exists. The public contract should let users or agents
  append comments and view them without relying on source-level APIs.
implementation_plan: >-
  1. Add CLI flags to append comments through `task edit`, with optional author,
  and render comments in plain task output.

  2. Add MCP task_edit schema/handler support for comment append inputs.

  3. Keep existing Implementation Notes and Final Summary flags unchanged.

  4. Add CLI and MCP tests for append, view output, and combined edits.
implementation_notes: >-
  Exposed comment append support through `task edit --comment` /
  `--comment-author` and MCP `task_edit` schema fields. Added validation
  coverage for reserved marker rejection and combined comment append with other
  task edits.
final_summary: >-
  CLI and MCP can now append comments and render them in task view/plain output
  with author, timestamp, index, and markdown body. Existing notes/final-summary
  behavior remains on the same update pipeline.
acceptance_criteria:
  - index: 1
    text: >-
      CLI users can append one or more comments to a local editable task with
      optional author information.
    checked: true
  - index: 2
    text: >-
      CLI task view and plain output render comments in order with author,
      timestamp, and markdown body text.
    checked: true
  - index: 3
    text: >-
      MCP task tools expose comment append input with validation and task_view
      output includes comments consistently with plain task output.
    checked: true
  - index: 4
    text: >-
      Existing Implementation Notes and Final Summary CLI/MCP behavior remains
      unchanged.
    checked: true
  - index: 5
    text: >-
      Tests cover CLI comment append/view output, MCP comment append/view
      output, validation errors, and comment preservation when combined with
      other task edits.
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
