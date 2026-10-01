---
task_schema_version: 2
id: BACK-307
title: Add dual-mode MCP guidance for workflow docs
status: Done
assignee:
  - '@codex'
created_date: '2025-10-22 19:18'
updated_date: '2025-10-22 20:35'
labels: []
dependencies: []
description: >-
  We need to support both modern MCP clients (with resource support) and
  legacy/simple clients (tools-only) when providing the Backlog workflow
  documentation.


  Implementation sketch:

  - Mirror the existing workflow resources with tool handlers (e.g.
  `get_workflow_overview`, `get_task_creation_guide`, etc.) so clients that
  cannot call `resources/read` can still access the content.

  - Update the MCP agent nudge copy so it tells agents to prefer
  `backlog://workflow/overview` when their client supports resources, and to
  call the new tools otherwise.

  - Keep the existing resources in place for modern clients.

  - Ensure the new tools share the same content as the resource handlers and are
  discoverable through `tools/list`.


  This keeps guidance consistent and makes the connector work for a broader set
  of agents.
implementation_plan: >-
  1. Add workflow documentation tools that mirror the existing resources.

  2. Refactor resource registration to share content with the new tools.

  3. Update the MCP agent nudge text to mention resource URIs and tool
  fallbacks.

  4. Adjust or add tests/docs to cover the dual-mode behavior.
acceptance_criteria:
  - index: 1
    text: >-
      MCP server registers tool handlers that return the same markdown as the
      existing workflow resources (overview, task creation, task execution, task
      completion).
    checked: true
  - index: 2
    text: >-
      Agent nudge text references both the resource URIs and the fallback tools,
      clarifying when to use each.
    checked: true
  - index: 3
    text: >-
      Existing resource handlers remain available and their content continues to
      match the tool output.
    checked: true
  - index: 4
    text: Tests or docs are updated if needed to reflect the dual-mode behavior.
    checked: true
definition_of_done: []
comments: []
---
