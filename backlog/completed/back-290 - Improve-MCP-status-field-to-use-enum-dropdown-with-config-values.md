---
task_schema_version: 2
id: BACK-290
title: Improve MCP status field to use enum dropdown with config values
status: Done
assignee:
  - '@codex'
created_date: '2025-10-15 18:31'
updated_date: '2025-10-15 19:29'
labels: []
dependencies: []
priority: medium
description: "Currently, the MCP task_create and task_edit tools define status as a string field with valid values listed in the description. This means MCP clients like MCP Inspector show a plain text input instead of a dropdown.\n\nThe browser UI already reads valid statuses from config and displays them as kanban columns. We should do the same for MCP tools - use an enum with values from config.statuses so MCP clients can display a proper dropdown.\n\nCurrent implementation (src/mcp/utils/schema-generators.ts:12-20):\n```typescript\nexport function generateStatusFieldSchema(config: BacklogConfig): JsonSchema {\n\tconst statuses = config.statuses || DEFAULT_STATUSES;\n\treturn {\n\t\ttype: \"string\",\n\t\tmaxLength: 100,\n\t\tdescription: `Status value (case-insensitive). Valid values: ${statuses.join(\", \")}`,\n\t};\n}\n```\n\nThe comment explains enum isn't used because status needs case-insensitive normalization. However, the priority field successfully uses enum (lines 39-42), so we can use enum for status too and handle normalization in the validation layer.\n\nReferences:\n- Browser UI pattern: src/web/components/Board.tsx receives statuses as prop\n- Server endpoint: src/server/index.ts /api/statuses\n- Priority enum example: src/mcp/utils/schema-generators.ts:39-42"
implementation_notes: >-
  Status schema now exposes enum values and defaults sourced from Backlog config
  while keeping case-insensitive normalization in the validator. Added unit
  tests covering schema enum exposure and normalization. Ran `bun test
  src/test/mcp-tasks.test.ts`, `bun test src/test/mcp-server.test.ts`, `bunx tsc
  --noEmit`, and `bun run check .`.
acceptance_criteria:
  - index: 1
    text: >-
      Status field in task_create schema uses enum with values from
      config.statuses
    checked: true
  - index: 2
    text: >-
      Status field in task_edit schema uses enum with values from
      config.statuses
    checked: true
  - index: 3
    text: >-
      First status in config is set as default value (if MCP schema supports
      defaults)
    checked: true
  - index: 4
    text: Case-insensitive normalization still works in validation layer
    checked: true
  - index: 5
    text: MCP Inspector displays status as dropdown with valid options
    checked: true
  - index: 6
    text: Tests verify enum values match config.statuses
    checked: true
  - index: 7
    text: >-
      Tests verify case-insensitive normalization still works (e.g., 'done'
      normalizes to 'Done')
    checked: true
definition_of_done: []
comments: []
---
