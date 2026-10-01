---
task_schema_version: 2
id: BACK-507.3
title: Text input schemas in public command help
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
ordinal: 34000
description: >-
  Improve the existing CLI help so humans and agents can inspect command inputs
  without a separate agent-only command surface. Help text should clearly state
  required fields, optional fields, accepted values, examples, output shape, and
  whether the command reads or writes project state.


  The schema format should be text-only, not JSON. Example style: `Required
  fields: title: String`, `Optional fields: description: Markdown`, `ordinal:
  Integer`, `status: Status name from project config`. Use local Commander
  patterns and avoid broad rewrites beyond what is needed for consistent help
  rendering.
implementation_plan: >-
  # Implementation Plan


  1. Add a small shared helper for rendering text input schemas into Commander
  `--help` output.

  2. Apply it to high-use public commands: init, task
  create/list/edit/view/archive, search, doc create/update/list/view, milestone
  list/archive, config get/set/list, cleanup, and instructions.

  3. Keep schema text concise and human-readable: Required fields, Optional
  fields, Reads/Writes, Output, and Examples where useful.

  4. Add focused help-output tests for representative commands across the
  affected groups.

  5. Run targeted help tests and TypeScript before moving to error handling.
implementation_notes: >-
  Added shared `addHelpSchema` renderer and applied text input schema sections
  to key public commands: init, instructions, search, task
  create/list/edit/view/archive, doc create/update/list/view, milestone
  list/archive, config/get/set/list, and cleanup. Help now includes field types,
  read/write behavior, output, and examples where useful. Focused verification
  passed: `bun test src/test/cli.test.ts --test-name-pattern "command help input
  schemas"` and `bunx tsc --noEmit`.
final_summary: >-
  Added shared help-schema rendering and applied it to high-use public CLI
  commands so humans and agents can inspect fields, reads/writes, output, and
  examples from `--help`.
acceptance_criteria:
  - index: 1
    text: >-
      Public command help includes text schema sections for required and
      optional inputs on key task, document, milestone, search, config, init,
      and cleanup commands.
    checked: true
  - index: 2
    text: Help identifies read-only versus state-changing commands in plain text.
    checked: true
  - index: 3
    text: >-
      Help uses project terminology consistently: Markdown, Integer, Boolean,
      Status, Task ID, docs-relative path, project-root-relative path.
    checked: true
  - index: 4
    text: >-
      The implementation reuses a shared helper or metadata pattern rather than
      duplicating large help blocks by hand.
    checked: true
  - index: 5
    text: Tests or snapshots cover representative help output for high-use commands.
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
