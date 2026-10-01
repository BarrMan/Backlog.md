---
task_schema_version: 2
id: BACK-507.1
title: Shared workflow instruction registry and CLI access
status: Done
assignee:
  - '@codex'
created_date: '2026-06-13 14:13'
updated_date: '2026-06-13 20:37'
labels: []
milestone: m-7
dependencies: []
parent_task_id: BACK-507
priority: high
ordinal: 32000
description: >-
  Create the CLI-facing instruction surface. The workflow guide registry should
  supply both MCP resources/tools and CLI commands. The CLI should expose an
  entry point that lists available guides and prints individual guide markdown
  for humans and agents.


  Use normal public CLI commands. Do not add an agent-only namespace such as
  `backlog agent`. The public surface is `backlog instructions`, `backlog
  instructions --list`, and `backlog instructions
  <overview|task-creation|task-execution|task-finalization|init-required>`.
implementation_plan: >-
  # Implementation Plan


  1. Reuse the existing workflow guide registry as the source for CLI
  instruction output, adding the init-required guide to the registry if needed.

  2. Add a public `backlog instructions` command with `--list` and an optional
  guide key argument.

  3. Keep output markdown/text-first for both humans and agents.

  4. Add focused CLI tests for list output, overview output, selected guide
  output, and invalid guide handling.

  5. Verify the MCP workflow resource/tool tests still pass because they should
  read from the same registry.
implementation_notes: >-
  Implemented shared CLI instruction access with `backlog instructions`,
  `backlog instructions --list`, and guide-key selection. Added `init-required`
  to the CLI-visible instruction guide registry while keeping MCP workflow
  resources on their existing workflow subset. Targeted verification passed:
  `bun test src/test/cli.test.ts --test-name-pattern "backlog instructions
  command"`, `bun test src/test/mcp-server.test.ts --test-name-pattern
  "workflow"`, and `bunx tsc --noEmit`.
final_summary: >-
  Added shared CLI instruction access through `backlog instructions`, backed by
  the workflow guide registry, with list/guide selection tests and MCP workflow
  regression coverage.
acceptance_criteria:
  - index: 1
    text: Workflow guide content is available through a public CLI command.
    checked: true
  - index: 2
    text: >-
      The CLI instruction command and MCP workflow resources/tools share one
      registry/source of truth.
    checked: true
  - index: 3
    text: >-
      The overview guide acts as an index that directs readers to task creation,
      execution, and finalization guides.
    checked: true
  - index: 4
    text: >-
      An init-required guide is available through the CLI for directories
      without Backlog initialized.
    checked: true
  - index: 5
    text: >-
      Tests cover guide listing and each guide key returning the expected
      content.
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
