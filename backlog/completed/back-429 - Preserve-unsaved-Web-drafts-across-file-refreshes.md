---
task_schema_version: 2
id: BACK-429
title: Preserve unsaved Web drafts across file refreshes
status: Done
assignee:
  - '@codex'
created_date: '2026-04-25 12:14'
updated_date: '2026-07-01 18:58'
labels:
  - web-ui
  - state
  - bug
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/578'
modified_files:
  - src/web/components/TaskDetailsModal.tsx
  - src/test/web-task-details-modal-final-summary.test.tsx
priority: high
description: >-
  Track GitHub issue #578: unsaved Web UI form state should not reset when task
  files change while the browser UI is open.
implementation_plan: >-
  1. Reproduce the reset at component level by rerendering an open task/create
  modal with refreshed props.

  2. Update TaskDetailsModal reset handling so same-open refreshes preserve
  dirty local fields and update untouched fields from refreshed data.

  3. Add focused regression tests for unsaved edit/create fields and
  non-conflicting external updates.

  4. Run scoped tests, typecheck, and lint/check as appropriate.
implementation_notes: >-
  Implemented a same-open modal refresh merge: refreshed task data updates
  untouched fields while preserving locally edited create/edit fields across
  filesystem-triggered UI refreshes. Added regression coverage for dirty edit
  fields, clean external updates, and unsaved create fields during refreshed
  props.


  PR #705 follow-up: stabilized the JSDOM regression harness so controlled
  create/edit inputs update React state before simulating refreshed props.
  Validation passed: bun test
  src/test/web-task-details-modal-final-summary.test.tsx; bun test
  src/test/web-task-details-modal-final-summary.test.tsx
  src/test/web-task-details-modal-documentation.test.tsx
  src/test/web-board-filters.test.tsx
  src/test/web-task-list-labels-menu.test.tsx
  src/test/web-milestones-page-search.test.tsx; bunx tsc --noEmit; bun run check
  .; bun test (1343 pass, 2 skip, 0 fail).
final_summary: >-
  Fixed Web task modal refresh handling so background file updates no longer
  wipe unsaved create/edit fields, while untouched fields still receive
  refreshed task data. Stabilized the regression harness and verified with
  focused Web tests, TypeScript, Biome, and the full Bun test suite.
acceptance_criteria:
  - index: 1
    text: Unsaved task create/edit fields survive external task file refreshes.
    checked: true
  - index: 2
    text: >-
      Saved external changes still appear after refresh when they do not
      conflict with local unsaved form state.
    checked: true
  - index: 3
    text: >-
      A regression test or browser automation covers unsaved edits plus an
      external file watcher update.
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
