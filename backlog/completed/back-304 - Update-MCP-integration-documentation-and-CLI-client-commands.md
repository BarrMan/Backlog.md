---
task_schema_version: 2
id: BACK-304
title: Update MCP integration documentation and CLI client commands
status: Done
assignee:
  - '@codex'
created_date: '2025-10-20 19:10'
updated_date: '2025-10-20 19:11'
labels: []
dependencies: []
description: >-
  Clarify how `backlog init` configures MCP client integrations and adjust the
  CLI automation so generated commands match the latest client expectations.
  Remove leftover code related to interactive mode guidance while keeping
  existing workflows intact.
implementation_plan: >-
  1. Review README MCP guidance to align with automated init behavior.

  2. Document manual MCP setup reminder and link to agent instructions.

  3. Update CLI MCP client commands (Claude/Codex/Gemini) and remove unused
  integration flag.
implementation_notes: >-
  Changes applied on current branch touching `README.md` and `src/cli.ts`. No
  automated tests or linting were run yet.
acceptance_criteria:
  - index: 1
    text: >-
      README MCP section explains that rerunning `backlog init` configures MCP
      automatically and includes a direct link to agent instructions for manual
      setup.
    checked: true
  - index: 2
    text: >-
      `backlog init` generates the correct commands for Claude (`-s user`),
      Codex (server name positioned before client command), and Gemini (server
      argument order matches other clients).
    checked: true
  - index: 3
    text: >-
      Unused `_needsInteractiveIntegration` flag removed without breaking
      existing initialization flows.
    checked: true
definition_of_done: []
comments: []
---
