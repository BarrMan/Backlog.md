---
task_schema_version: 2
id: BACK-305
title: Improve MCP guidelines to cross-link workflows and clarify documentation notes
status: Done
assignee:
  - '@codex'
created_date: '2025-10-21 19:07'
updated_date: '2025-10-21 19:07'
labels:
  - retroactive
dependencies: []
description: >-
  - Update `src/guidelines/mcp/overview.md` to point agents to the
  task-execution and task-creation workflows while reinforcing the "search
  first" process.

  - Clarify the numbering and structure in
  `src/guidelines/mcp/task-completion.md`, adding explicit guidance for
  implementation notes used as PR summaries.

  - Emphasize in `src/guidelines/mcp/task-execution.md` that tasks must act as
  the canonical storage for plans and notes.
acceptance_criteria:
  - index: 1
    text: >-
      Overview workflow references are up to date and direct agents to the
      proper creation/execution docs.
    checked: true
  - index: 2
    text: >-
      Task completion guidelines explain how implementation notes should act as
      a PR-style summary.
    checked: true
  - index: 3
    text: >-
      Task execution guidelines stress that tasks store the canonical plan and
      notes.
    checked: true
definition_of_done: []
comments: []
---
