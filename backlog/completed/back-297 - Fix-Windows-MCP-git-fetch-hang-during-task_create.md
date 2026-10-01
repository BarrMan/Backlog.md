---
task_schema_version: 2
id: BACK-297
title: Fix Windows MCP git fetch hang during task_create
status: Done
assignee:
  - '@codex'
created_date: '2025-10-15 21:00'
updated_date: '2025-10-15 21:02'
labels: []
dependencies: []
priority: high
description: >-
  Windows MCP clients cannot create tasks: git fetch hangs when generateNextId
  runs inside task_create via MCP stdio. Investigate the Windows-specific
  deadlock between git fetch and the MCP stdio transport and implement a fix so
  task creation completes quickly.
implementation_plan: >-
  1. Capture the Windows-specific hang by exercising task_create through MCP
  stdio.

  2. Replace git invocation helper with Bun.spawn so stdin is ignored while
  stdout and stderr remain captured.

  3. Re-run MCP repro plus automated tests to confirm task_create succeeds and
  clean up temporary tooling.
implementation_notes: >-
  - Reproduced the hang with a standalone MCP client harness and DEBUG logging
  to observe git remote never returning when stdin was inherited.

  - Updated execGit to spawn git with stdin ignored while preserving env
  handling and failure propagation.

  - Validated the fix via MCP repro (~80 ms), bun test
  src/test/mcp-server.test.ts, and bunx tsc --noEmit; noted repo-wide formatting
  drift causing biome check failures unrelated to this change.
acceptance_criteria:
  - index: 1
    text: >-
      Investigate and identify the root cause of the Windows git fetch hang
      under MCP stdio.
    checked: true
  - index: 2
    text: >-
      Implement a fix that prevents git fetch from blocking MCP task_create on
      Windows.
    checked: true
  - index: 3
    text: >-
      Add regression coverage or diagnostics to ensure the Windows fix stays
      validated.
    checked: true
definition_of_done: []
comments: []
---
