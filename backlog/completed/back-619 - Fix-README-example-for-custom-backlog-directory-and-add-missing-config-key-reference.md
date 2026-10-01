---
task_schema_version: 2
id: BACK-619
title: >-
  Fix README example for custom backlog directory and add missing config key
  reference
status: Done
assignee:
  - '@pxmpsdev'
created_date: '2026-08-09 14:55'
updated_date: '2026-08-09 14:58'
labels: []
dependencies: []
ordinal: 256000
description: >-
  README.md describes a custom project-relative backlog folder configured via
  backlog.config.yml but gives "task-10 - Add core search functionality.md" as
  the example - that is a task filename, not a folder path, and does not exist
  anywhere in the repo. The config key backlog_directory (accepted keys:
  backlog_directory / backlogDirectory, see src/utils/backlog-directory.ts) is
  also missing from the "Available Configuration Options" table in
  ADVANCED-CONFIG.md, while README points to it as the full configuration
  reference. Task originally opened as BACK-613, then BACK-617; renumbered to
  BACK-619 because upstream main claimed both IDs first.
implementation_plan: >-
  1. Edit README.md line 123: replace the stray task-filename example ('task-10
  - Add core search functionality.md') with the correct backlog_directory
  example in the project config. 2. Add the missing backlog_directory row to the
  'Available Configuration Options' table in ADVANCED-CONFIG.md. 3. Verify:
  preview markdown, run bunx tsc --noEmit, bun run check ., and the doc-focused
  test scope.
implementation_notes: >-
  Verification: bunx tsc --noEmit pass (no TS touched); bun run check . pass;
  scoped tests pass (config-commands.test.ts 28/28, cli-doc-search.test.ts +
  documentation.test.ts 15/15). Full suite shows pre-existing flaky timeouts in
  cli-refs-docs.test.ts (passes 35/35 in isolation). PR #885 links this task.
final_summary: >-
  Fixed README.md:123 stray task-filename example ('task-10 - Add core search
  functionality.md') - now shows the actual config key with a valid path
  ('backlog_directory: my-backlog'). Added the missing backlog_directory row to
  the Available Configuration Options table in ADVANCED-CONFIG.md. Docs-only
  change; verified with bunx tsc --noEmit, bun run check ., and scoped test
  suites.
acceptance_criteria:
  - index: 1
    text: README.md shows a folder-path example for the custom backlog directory
    checked: true
  - index: 2
    text: >-
      ADVANCED-CONFIG.md lists the backlog_directory config key in its options
      table
    checked: true
  - index: 3
    text: No behavioral code changes
    checked: true
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: false
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: true
  - index: 3
    text: bun test (or scoped test) passes
    checked: true
comments: []
---
