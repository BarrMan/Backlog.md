---
task_schema_version: 2
id: BACK-439
title: Allow backdrop click to close task modal
status: Done
assignee:
  - '@eyanq'
created_date: '2026-03-23 09:40'
updated_date: '2026-04-25 23:41'
labels: []
dependencies: []
description: >-
  Allow mouse users to close Task Details modal by clicking outside modal
  content, matching Escape behavior.
implementation_plan: |-
  1. Update shared web Modal backdrop to trigger close on outside click.
  2. Keep inner panel click propagation stopped.
  3. Gate backdrop close with same disableEscapeClose condition used for Escape.
  4. Verify behavior in preview and edit/create modes.
final_summary: >-
  Added backdrop-click close behavior to the shared Web UI modal using the same
  `disableEscapeClose` guard as Escape handling. Clicking inside modal content
  still stops propagation, so preview-mode task modals can close from the
  backdrop while edit/create flows remain protected from accidental dismissal.
acceptance_criteria:
  - index: 1
    text: Backdrop click closes modal in preview mode
    checked: true
  - index: 2
    text: Backdrop click is disabled whenever Escape-close is disabled
    checked: true
  - index: 3
    text: Modal content click does not close modal
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
