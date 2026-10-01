---
task_schema_version: 2
id: BACK-458
title: Fix promoted draft default status
status: Done
assignee:
  - '@codex'
created_date: '2026-05-02 15:28'
updated_date: '2026-05-02 19:17'
labels:
  - bug
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/624'
  - 'https://github.com/MrLesk/Backlog.md/pull/625'
modified_files:
  - src/file-system/operations.ts
  - src/test/filesystem.test.ts
priority: medium
description: >-
  Promoting a draft currently leaves the promoted task with status `Draft`,
  which can make the task invisible on boards whose configured statuses do not
  include `Draft`. Fix draft promotion so promoted tasks enter the configured
  default workflow status instead of remaining draft-only.
implementation_plan: >-
  1. Update `FileSystem.promoteDraft` so promoted tasks replace draft-only
  `Draft` status with `config.defaultStatus` or the built-in fallback status.

  2. Add focused regression tests in `src/test/filesystem.test.ts` for
  configured default status and no-config fallback.

  3. Run the scoped filesystem test, then typecheck/check if the change touches
  formatting or TypeScript behavior broadly.

  4. Mark acceptance criteria and summarize issue/PR readiness, including PR
  625, PR 623, and PR 626 state.
implementation_notes: >-
  Implemented draft promotion status normalization in `FileSystem.promoteDraft`
  using configured `defaultStatus` with `FALLBACK_STATUS` fallback. Added
  filesystem regression coverage for both the no-config fallback (`To Do`) and
  an explicit configured default (`Ready`).


  Addressed Codex P1 review feedback by preserving non-draft statuses during
  demote/promote round trips while still defaulting draft-only statuses.
final_summary: >-
  Promoted draft-only tasks now enter the default workflow status, while demoted
  tasks with an existing non-draft status keep that status when promoted again.
  Added regression coverage for both paths.
acceptance_criteria:
  - index: 1
    text: >-
      Promoting a draft writes the promoted task with the configured
      `default_status` when one is set.
    checked: true
  - index: 2
    text: >-
      Promoting a draft falls back to the built-in task status when no
      `default_status` is configured, instead of preserving `Draft`.
    checked: true
  - index: 3
    text: >-
      Regression coverage verifies promoted drafts are visible as regular tasks
      and do not keep the draft-only status.
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
