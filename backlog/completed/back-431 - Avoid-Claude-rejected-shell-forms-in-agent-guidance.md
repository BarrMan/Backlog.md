---
task_schema_version: 2
id: BACK-431
title: Avoid Claude-rejected shell forms in agent guidance
status: Done
assignee:
  - '@codex'
created_date: '2026-04-25 12:14'
updated_date: '2026-05-02 15:53'
labels:
  - agent-guidelines
  - cli
  - bug
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/595'
modified_files:
  - CLI-INSTRUCTIONS.md
  - src/cli.ts
  - src/guidelines/agent-guidelines.md
  - src/test/agent-instructions.test.ts
priority: medium
description: >-
  Track GitHub issue #595: generated agent guidance should avoid command
  examples that Claude Code rejects as ansi_c_string or unsafe shell forms.
implementation_notes: >-
  Updated CLI and agent guidance to lead with sandbox-safe multiline forms and
  added regression coverage for the guidance/help text.
final_summary: >-
  Agent multiline guidance now leads with repeat-append and real-newline forms,
  CLI help no longer advertises sandbox-rejected shell forms, and validation
  passed.
acceptance_criteria:
  - index: 1
    text: >-
      Agent-facing instructions avoid ANSI-C string, heredoc, command
      substitution, and similarly rejected shell forms where possible.
    checked: true
  - index: 2
    text: >-
      Long multiline fields have a documented safe alternative for common
      agents.
    checked: true
  - index: 3
    text: Guideline snapshots/tests are updated to cover the safer examples.
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
