---
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
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement complete nearest-scope agent overrides copied from effective parent on initialization, built-in and custom presets, and durable card metadata for agent configuration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Root/project/card overrides, copy-on-create, validation, roundtrip persistence, and built-ins are tested
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Correct the configuration test syntax. 2. Exercise Workspace's scoped configuration panel through its focused UI path, save with Ctrl+S, and reload persisted card configuration. 3. Apply a production change only if this reproduces validation failure, then run targeted checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented scoped agent configuration storage, built-in presets, complete fallback/copy-on-create behavior, card frontmatter persistence, and focused validation/roundtrip tests. Verified the focused suite and owned-file Biome check; full TypeScript remains blocked by concurrent session/UI files importing the not-yet-created sessions module.

Configuration review follow-up: added read-only editable previews, locked read-check-write initialization, safe preset/environment validation, malformed card fail-closed behavior, temporary-file cleanup, and default built-ins with worktrees disabled. Expanded focused coverage for preview non-persistence, malformed/ambiguous cards, and ordinary task-update persistence.

Added lock-scoped updateAgentConfiguration(core, scope, updater, taskId?) and routed upsert/initialization through the shared locking path. Added concurrent root-preset update coverage to prove independent additions are retained.

Corrected the extra brace in config.test.ts. Added focused PTY coverage for card-scoped panel save/reload, but stopped after two bounded PTY attempts: the test races async panel configuration load because its static bootstrap entry renders before editable configuration is ready. No production validation failure reproduced; tsc and owned-file Biome check passed.
<!-- SECTION:NOTES:END -->
