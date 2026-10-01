---
task_schema_version: 2
id: BACK-662
title: Add references and modifiedFiles to task list --json
status: Done
assignee:
  - '@claude'
created_date: '2026-08-30 19:00'
updated_date: '2026-08-30 19:11'
labels:
  - cli
dependencies: []
ordinal: 294000
description: >-
  External tools consuming `backlog task list --json` need each task's
  references and modifiedFiles without fetching tasks one by one. Add both
  arrays to the task summary JSON projection. Additive under schemaVersion 1;
  task view --json already carries them.
implementation_plan: >-
  Add references and modifiedFiles to TaskSummaryJson (shared by list and search
  task rows), remove the duplicate declarations from TaskDetailsJson, populate
  in toTaskSummaryJson, update the list test and CLI-INSTRUCTIONS field
  enumeration.
implementation_notes: >-
  Implemented in json-output.ts by moving the two fields into the shared summary
  projection; view payload content unchanged. Docs updated. Empty case covered
  by a dedicated assertion on a task without references or modified files.
final_summary: >-
  Added references and modifiedFiles to the shared task summary JSON projection
  (list and search task rows), removed the duplicate declarations from the
  details type, and updated CLI-INSTRUCTIONS.md. Verified with bunx tsc
  --noEmit, bun run check ., and src/test/cli-json-output.test.ts (15 tests:
  populated arrays pinned in the list envelope, empty arrays pinned for a bare
  task, view payload unchanged).
acceptance_criteria:
  - index: 1
    text: >-
      Each task in `task list --json` includes references and modifiedFiles
      arrays (empty arrays when unset)
    checked: true
  - index: 2
    text: task view --json output is unchanged
    checked: true
  - index: 3
    text: Tests cover populated and empty cases
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
