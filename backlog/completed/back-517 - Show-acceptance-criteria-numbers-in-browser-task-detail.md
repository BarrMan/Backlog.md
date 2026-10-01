---
task_schema_version: 2
id: BACK-517
title: Show acceptance criteria numbers in browser task detail
status: Done
assignee:
  - '@alex-agent'
created_date: '2026-07-02 18:35'
updated_date: '2026-07-02 18:40'
labels: []
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/688'
modified_files:
  - src/web/components/TaskDetailsModal.tsx
  - src/test/web-task-details-modal-acceptance-criteria.test.tsx
ordinal: 112000
description: >-
  Browser task detail already renders acceptance criteria, but preview mode
  shows them as an unnumbered checklist. Display the existing parsed
  acceptance-criteria index/number in the browser task detail view without
  changing storage, parser output, task schema, board cards, or list cards.


  GitHub issue: #688
implementation_plan: >-
  1. Inspect browser task detail acceptance-criteria rendering and analogous
  tests/styles.

  2. Update only the task detail view to display existing acceptance-criteria
  indexes.

  3. Add or update focused tests for detail rendering where practical.

  4. Run targeted tests/checks, then simplify before finalizing.
implementation_notes: >-
  Context brief (L1):

  - Closest analog: existing TaskDetailsModal preview sections and
  renderToString tests in src/test/web-task-details-modal-*.tsx.

  - Chosen pattern: keep rendering local to the browser task detail modal and
  reuse the existing flex row/checklist styling, adding a small text badge for
  c.index beside each criterion.

  - Scope guard: TaskCard and TaskList/card surfaces do not render
  acceptanceCriteriaItems today and should remain untouched.

  - Main risk: accidentally changing editor/storage semantics; avoid
  parser/schema/server changes and leave AcceptanceCriteriaEditor behavior
  unchanged.


  Implementation complete. Added existing acceptance-criteria indexes to
  TaskDetailsModal preview rendering only; left editor, storage, parser/schema,
  server, TaskCard, and TaskList behavior unchanged.


  Validation:

  - bun test src/test/web-task-details-modal-acceptance-criteria.test.tsx:
  passed (2 tests).

  - bun test src/test/web-task-details-modal-acceptance-criteria.test.tsx
  src/test/web-task-details-modal-documentation.test.tsx
  src/test/web-task-details-modal-final-summary.test.tsx: passed (17 tests).

  - bunx tsc --noEmit: passed.

  - git ls-files -z | xargs -0 bunx biome check --files-ignore-unknown=true:
  passed (306 tracked files).

  - bun test: passed (1375 pass, 2 skip, 0 fail).

  - bun run check .: blocked by unrelated untracked onionskin.config.json
  formatting; not caused by this task.
final_summary: >-
  Displayed existing #index labels for acceptance criteria in the browser task
  detail preview, with focused SSR coverage for numbered detail rendering and a
  board-card guard. No storage, parser, schema, editor, board/list card, or
  server behavior changed. Verified with targeted modal tests, TypeScript,
  tracked-file Biome, and the full Bun test suite; full project check is blocked
  by unrelated untracked onionskin.config.json formatting.
acceptance_criteria:
  - index: 1
    text: >-
      Browser task detail preview shows acceptance criteria with their existing
      indexes/numbers
    checked: true
  - index: 2
    text: >-
      Board and list task cards remain unchanged and do not show
      acceptance-criteria numbers
    checked: true
  - index: 3
    text: >-
      Markdown storage format, parser output, and task schema are unchanged
      unless proven unavoidable
    checked: true
  - index: 4
    text: >-
      Focused tests or practical rendered checks cover numbered acceptance
      criteria in task detail
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
