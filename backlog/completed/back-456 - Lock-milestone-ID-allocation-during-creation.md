---
task_schema_version: 2
id: BACK-456
title: Lock milestone ID allocation during creation
status: Done
assignee:
  - '@codex'
created_date: '2026-05-01 20:59'
updated_date: '2026-05-01 21:02'
labels:
  - bug
  - milestones
  - mcp
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/619'
modified_files:
  - src/file-system/operations.ts
  - src/test/atomic-task-create.test.ts
priority: high
description: >-
  Issue #619 reports that concurrent MCP milestone creation can allocate the
  same `m-N` id because `FileSystem.createMilestone()` scans milestone files and
  writes the new file without holding the shared create lock. Mirror the task
  creation concurrency fix so milestone scan-and-write is serialized.
final_summary: >-
  Wrapped milestone ID scan-and-write in the existing proper-lockfile create
  lock so MCP, web, and core milestone creation share the same concurrency
  protection as task creation. Added a deterministic race regression covering
  concurrent milestone creation and verified atomic create plus MCP milestone
  suites, typecheck, and Biome.
acceptance_criteria:
  - index: 1
    text: >-
      Concurrent milestone creation from two Core/FileSystem instances produces
      unique milestone IDs.
    checked: true
  - index: 2
    text: >-
      Milestone ID allocation includes active and archived milestone files while
      holding the create lock.
    checked: true
  - index: 3
    text: >-
      The existing task create lock timeout behavior remains unchanged and
      covered by tests.
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
