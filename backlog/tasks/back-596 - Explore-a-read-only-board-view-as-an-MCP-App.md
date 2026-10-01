---
task_schema_version: 2
id: BACK-596
title: Explore a read-only board view as an MCP App
status: To Do
assignee: []
created_date: '2026-08-07 21:26'
labels:
  - mcp
dependencies:
  - BACK-594
priority: low
type: enhancement
ordinal: 236000
description: >-
  PARKED - maintainer decision 2026-08-07: wait for the client-app ecosystem to
  mature before ANY implementation. This task exists to preserve the research.
  Do not pick it up for implementation; status stays To Do until Alex accepts a
  go/no-go recommendation.


  Idea: expose a read-only Backlog board (Kanban) to MCP hosts as an MCP App.


  Context: the MCP Apps extension went stable on 2026-01-26. Apps are `ui://`
  HTML resources rendered in sandboxed host iframes, with tool results delivered
  over postMessage JSON-RPC. 11 hosts support it (Claude web/Desktop, VS Code
  Copilot, ChatGPT, Cursor, and others), but NO terminal coding agent does, and
  the capability negotiation is being rewritten for the stateless core revision.


  Prerequisite: read tools must return `structuredContent` first (tracked by the
  stateless MCP modernization task this one depends on).


  Constraints recorded up front:

  - The `ui://` resource must NOT point at the local web server (local trust
  boundary).

  - No app-provided tools.

  - No App-only capabilities: nothing may be reachable only through the App.

  - Any prototype belongs in a separate package outside the shipped binary.

  - It would be a fourth Kanban rendering (CLI, TUI, web SPA, App). That
  duplication is the core cost to weigh.


  Ecosystem test that must be met before the go/no-go is written: the
  stateless-Apps capability negotiation is settled AND at least one relevant
  client audience for Backlog.md users is demonstrated.
acceptance_criteria:
  - index: 1
    text: >-
      A written go/no-go recommendation for Alex is produced only once the
      ecosystem test is met: stateless-Apps capability negotiation settled AND
      at least one relevant client audience demonstrated
    checked: false
  - index: 2
    text: >-
      The recommendation explicitly weighs the cost of a fourth Kanban rendering
      and addresses every recorded constraint (no ui:// pointing at the local
      web server, no app-provided tools, no App-only capabilities, prototype
      outside the shipped binary)
    checked: false
  - index: 3
    text: >-
      No implementation, prototype, or shipped code lands before Alex accepts
      the go/no-go recommendation
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
