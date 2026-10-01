---
task_schema_version: 2
id: BACK-707.1
title: Add scoped agent presets and task worktree configuration
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-09-28 14:05'
updated_date: '2026-09-28 15:56'
labels: []
dependencies: []
parent_task_id: BACK-707
ordinal: 338000
description: >-
  Implement complete nearest-scope agent overrides copied from effective parent
  on initialization, built-in and custom presets, and durable card metadata for
  agent configuration.
implementation_plan: >-
  1. Correct the configuration test syntax. 2. Exercise Workspace's scoped
  configuration panel through its focused UI path, save with Ctrl+S, and reload
  persisted card configuration. 3. Apply a production change only if this
  reproduces validation failure, then run targeted checks.
implementation_notes: >-
  Implemented scoped agent configuration storage, built-in presets, complete
  fallback/copy-on-create behavior, card frontmatter persistence, and focused
  validation/roundtrip tests. Verified the focused suite and owned-file Biome
  check; full TypeScript remains blocked by concurrent session/UI files
  importing the not-yet-created sessions module.


  Configuration review follow-up: added read-only editable previews, locked
  read-check-write initialization, safe preset/environment validation, malformed
  card fail-closed behavior, temporary-file cleanup, and default built-ins with
  worktrees disabled. Expanded focused coverage for preview non-persistence,
  malformed/ambiguous cards, and ordinary task-update persistence.


  Added lock-scoped updateAgentConfiguration(core, scope, updater, taskId?) and
  routed upsert/initialization through the shared locking path. Added concurrent
  root-preset update coverage to prove independent additions are retained.


  Corrected the extra brace in config.test.ts. Added focused PTY coverage for
  card-scoped panel save/reload, but stopped after two bounded PTY attempts: the
  test races async panel configuration load because its static bootstrap entry
  renders before editable configuration is ready. No production validation
  failure reproduced; tsc and owned-file Biome check passed.
acceptance_criteria:
  - index: 1
    text: >-
      Root/project/card overrides, copy-on-create, validation, roundtrip
      persistence, and built-ins are tested
    checked: false
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: false
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: false
  - index: 3
    text: bun test (or scoped test) passes
    checked: false
comments: []
---
