---
task_schema_version: 2
id: BACK-507.4
title: Self-correcting CLI errors for agents and humans
status: Done
assignee:
  - '@codex'
created_date: '2026-06-13 14:13'
updated_date: '2026-06-13 14:28'
labels: []
milestone: m-7
dependencies: []
parent_task_id: BACK-507
priority: medium
ordinal: 35000
description: >-
  Improve common CLI error paths so humans and agents can recover without
  hallucinating commands. Errors should point to the closest valid command or
  option, accepted values where relevant, and the exact help command to run
  next.


  Focus on high-impact failures: unknown command, unknown option, missing
  required argument, invalid status or priority, invalid numeric fields, invalid
  docs path, MCP/init mode conflicts, and destructive-command guardrails. Use
  Commander’s existing suggestion/help hooks where possible and Backlog
  validation messages where command-specific context is needed.
implementation_plan: >-
  # Implementation Plan


  1. Enable Commander suggestion/help-after-error behavior globally so unknown
  commands/options point users to likely alternatives and help.

  2. Add or adjust concise validation messages for common command-specific
  failures where the CLI already validates values.

  3. Add focused tests for unknown command, unknown option, missing required
  argument, invalid priority/status/value examples, and docs path validation
  where practical.

  4. Keep error output text-first and avoid stack traces in normal mode.

  5. Run targeted error tests and TypeScript.
implementation_notes: >-
  Enabled Commander help-after-error globally while preserving close-match
  suggestions. Added regression coverage for unknown command, unknown option,
  missing required task ID, invalid priority, and unsafe document path errors.
  Focused verification passed: `bun test src/test/cli.test.ts
  --test-name-pattern "self-correcting CLI errors"` and `bunx tsc --noEmit`.
final_summary: >-
  Enabled Commander suggestion/help-after-error behavior and added regression
  tests for common invalid invocations so users get accepted values or help
  pointers instead of opaque failures.
acceptance_criteria:
  - index: 1
    text: >-
      Unknown command and unknown option errors suggest likely valid
      alternatives and show the relevant help command.
    checked: true
  - index: 2
    text: >-
      Invalid enum/value errors include accepted values or the config-derived
      source of accepted values.
    checked: true
  - index: 3
    text: >-
      Missing required inputs identify the missing field and point to command
      help.
    checked: true
  - index: 4
    text: >-
      Validation errors stay concise and do not dump stack traces unless debug
      mode is enabled.
    checked: true
  - index: 5
    text: >-
      Tests cover representative invalid invocations and assert actionable error
      text.
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
