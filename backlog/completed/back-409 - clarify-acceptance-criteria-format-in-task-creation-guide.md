---
task_schema_version: 2
id: BACK-409
title: Clarify acceptance criteria format in task creation guide
status: Done
assignee:
  - '@codex'
created_date: '2026-03-26 13:48'
updated_date: '2026-05-03 11:40'
labels:
  - bug
  - docs
  - mcp
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/582'
  - 'https://github.com/MrLesk/Backlog.md/pull/583'
modified_files:
  - src/guidelines/mcp/task-creation.md
description: >-
  The MCP task creation guide describes acceptance criteria conceptually but
  does not specify the expected `task_create.acceptanceCriteria` parameter
  shape. Clarify that `acceptanceCriteria` expects an array of strings so agents
  do not pass a scalar string and trigger validation errors.
implementation_plan: >-
  1. Update `src/guidelines/mcp/task-creation.md` so the acceptance criteria
  guidance names the expected array-of-strings shape.

  2. Keep the surrounding guidance on atomic, testable criteria unchanged.

  3. Validate formatting/checks for the documentation-only change.
final_summary: >-
  Updated `src/guidelines/mcp/task-creation.md` to clarify that the
  `acceptanceCriteria` field is an array of strings while preserving the
  existing guidance that each item should be specific, testable, and
  independent.
acceptance_criteria:
  - index: 1
    text: >-
      The task creation guide specifies that `acceptanceCriteria` is an array of
      strings.
    checked: true
definition_of_done:
  - index: 1
    text: Documentation change is reflected in the MCP task creation guide.
    checked: true
  - index: 2
    text: '`bun run check .` passes.'
    checked: true
comments: []
---
