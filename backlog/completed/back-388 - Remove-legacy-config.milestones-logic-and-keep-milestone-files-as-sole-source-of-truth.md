---
task_schema_version: 2
id: BACK-388
title: >-
  Remove legacy config.milestones logic and keep milestone files as sole source
  of truth
status: Done
assignee:
  - '@codex'
created_date: '2026-02-17 20:42'
updated_date: '2026-02-17 20:47'
labels: []
dependencies: []
references:
  - src/file-system/operations.ts
  - src/core/config-migration.ts
  - src/core/init.ts
  - src/core/milestones.ts
  - src/cli.ts
priority: medium
description: >-
  Clean up remaining legacy milestone-list config logic so milestone state is
  derived only from milestone files. Remove stale config field handling and
  legacy helper paths that still imply config-backed milestone sources.
final_summary: >-
  Removed remaining legacy config-backed milestone logic and aligned milestone
  handling to milestone files as the sole runtime source.


  Implemented cleanup:

  - Removed legacy config milestone parse/serialize wiring from filesystem
  config handling.

  - Removed milestone defaults/migration/init wiring in core config code paths.

  - Removed deprecated config-based milestone helper functions
  (`collectMilestones`, `buildMilestoneBucketsFromConfig`) and corresponding
  re-exports.

  - Updated CLI `config` surfaces to stop exposing `milestones` as an active
  config key in `get`/`list` output and key help text.

  - Updated milestone utility + config tests to cover file/entity-based behavior
  and new config expectations.


  Validation:

  - `bunx tsc --noEmit`

  - `bun run check .`

  - `bun test src/web/utils/milestones.test.ts src/test/filesystem.test.ts
  src/test/enhanced-init.test.ts src/test/config-commands.test.ts`
acceptance_criteria:
  - index: 1
    text: >-
      Runtime milestone behavior does not read milestone values from config and
      continues to use milestone files.
    checked: true
  - index: 2
    text: >-
      Legacy config.milestones parse/serialize/migration/default wiring is
      removed or neutralized so it no longer drives behavior.
    checked: true
  - index: 3
    text: Legacy config-based milestone helper paths are removed when unused.
    checked: true
  - index: 4
    text: >-
      CLI config output/help no longer advertises milestones as an active config
      key.
    checked: true
  - index: 5
    text: Relevant tests are updated and pass for milestone + config flows.
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
