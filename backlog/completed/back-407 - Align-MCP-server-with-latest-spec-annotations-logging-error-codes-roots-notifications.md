---
task_schema_version: 2
id: BACK-407
title: >-
  Align MCP server with latest spec (annotations, logging, error codes, roots
  notifications)
status: Done
assignee:
  - '@claude'
created_date: '2026-03-21 13:15'
updated_date: '2026-03-21 13:34'
labels: []
dependencies: []
priority: high
description: >-
  Audit of the MCP server against the 2025-11-25 spec revealed several gaps.
  This task addresses all P0 and P1 findings:


  **P0 - Spec violations:**

  - Server handlers throw plain `Error` instead of SDK `McpError` with JSON-RPC
  error codes

  - Custom `McpError` class name collides with SDK's `McpError`


  **P1 - Missing features:**

  - No tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`,
  `title`)

  - No `logging` capability (using console.error instead of MCP logging
  protocol)

  - No handler for `notifications/roots/list_changed`

  - Missing `sendPromptListChanged()` in `upgradeToProject()`
acceptance_criteria:
  - index: 1
    text: >-
      Server handlers (callTool, readResource, getPrompt) throw SDK McpError
      with correct ErrorCode values for not-found cases
    checked: false
  - index: 2
    text: Custom error class renamed to avoid collision with SDK McpError
    checked: false
  - index: 3
    text: >-
      All tools declare annotations (readOnlyHint, destructiveHint,
      idempotentHint, title) appropriate to their behavior
    checked: false
  - index: 4
    text: >-
      McpToolHandler interface includes optional annotations field, listTools()
      includes annotations in response
    checked: false
  - index: 5
    text: >-
      Server declares logging capability and uses sendLoggingMessage for roots
      discovery debug output
    checked: false
  - index: 6
    text: >-
      Server handles notifications/roots/list_changed to re-run roots discovery
      when client workspace changes
    checked: false
  - index: 7
    text: >-
      upgradeToProject sends sendPromptListChanged alongside tool/resource
      notifications
    checked: false
  - index: 8
    text: All existing tests pass
    checked: false
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: false
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: false
  - index: 3
    text: bun test (or scoped test) passes
    checked: false
comments: []
---
