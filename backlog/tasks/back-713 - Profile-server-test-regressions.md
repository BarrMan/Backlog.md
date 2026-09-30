---
id: BACK-713
title: Profile server test regressions
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-09-30 13:44'
updated_date: '2026-09-30 13:45'
labels: []
dependencies: []
type: chore
ordinal: 347000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Run the server-prefixed test-file subset and the project-task-graph regression file independently with bounded process groups after retained-graph startup changes, without editing source or tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every selected server test file and project-task-graph test runs independently with a 29-second process-group deadline
- [ ] #2 A temporary report records timings and any failing assertions
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Select only server-prefixed test files and project-task-graph. 2. Use the existing profiler with two workers and its 29-second per-process-group deadline. 3. Record the report path, timings, and only failing assertions; update the temporary human report with the supplied corrected historical results.
<!-- SECTION:PLAN:END -->
