---
task_schema_version: 2
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
description: >-
  Run the server-prefixed test-file subset and the project-task-graph regression
  file independently with bounded process groups after retained-graph startup
  changes, without editing source or tests.
implementation_plan: >-
  1. Select only server-prefixed test files and project-task-graph. 2. Use the
  existing profiler with two workers and its 29-second per-process-group
  deadline. 3. Record the report path, timings, and only failing assertions;
  update the temporary human report with the supplied corrected historical
  results.
acceptance_criteria:
  - index: 1
    text: >-
      Every selected server test file and project-task-graph test runs
      independently with a 29-second process-group deadline
    checked: false
  - index: 2
    text: A temporary report records timings and any failing assertions
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
