---
task_schema_version: 2
id: BACK-289
title: >-
  Implement resource templates list handler to return empty list instead of
  error
status: Done
assignee:
  - '@codex'
created_date: '2025-10-15 18:25'
updated_date: '2025-11-30 14:46'
labels:
  - mcp
  - enhancement
dependencies: []
priority: low
description: >-
  MCP Inspector shows a "List Templates" button which calls
  `resources/templates/list` method. Currently this returns error -32601 (Method
  not found) because the MCP server doesn't implement this handler.


  Since Backlog.md doesn't use resource templates, we should implement the
  handler to return an empty list instead of throwing an error. This will
  improve the user experience in MCP Inspector and other MCP clients.


  Related to GitHub issue #399 - the "List Templates" error shown in
  screenshots.
implementation_notes: >-
  Implemented resources/templates/list handler returning an empty array and
  added test coverage. Ran `bun test src/test/mcp-server.test.ts` to verify.
acceptance_criteria:
  - index: 1
    text: MCP server responds to resources/templates/list request without error
    checked: true
  - index: 2
    text: Handler returns empty array when no templates are available
    checked: true
  - index: 3
    text: MCP Inspector 'List Templates' button works without showing error
    checked: true
  - index: 4
    text: Implementation follows MCP protocol specification for resource templates
    checked: true
definition_of_done: []
comments: []
---
