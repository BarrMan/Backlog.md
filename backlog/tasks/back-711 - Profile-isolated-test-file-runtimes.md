---
task_schema_version: 2
id: BACK-711
title: Profile isolated test-file runtimes
status: Done
assignee:
  - '@opencode'
created_date: '2026-09-30 13:16'
updated_date: '2026-09-30 13:24'
labels: []
dependencies: []
type: chore
ordinal: 345000
description: >-
  A requested performance baseline must run each repository test file in an
  isolated Bun subprocess with a hard 30-second wall-time limit before any
  optimization work is delegated.
implementation_plan: >-
  1. Discover repository test files using the .test naming convention while
  excluding dependency, build, and lock directories. 2. Run each file separately
  through a temporary three-worker profiler that gives each Bun process group a
  sub-30-second deadline and writes an isolated log. 3. Inspect the JSON report
  for threshold breaches, near-threshold files, failures, and measurement
  limits; do not change production or test code.
implementation_notes: >-
  Profiled 325 discovered .test.{ts,tsx,js,jsx} files in separate bun test
  --timeout=10000 invocations with three workers and a 29-second process-group
  deadline. Results: 316 pass, 7 fail, 2 timeout; no invocation reached 30
  seconds. Report:
  /var/folders/6z/jl00z05s7b7gmlgvjtf7fh9w0000gn/T/opencode/backlog-test-runtime-profile-20260930T131824Z/report.json.
  The default scoped-test DoD item remains unchecked because the profiling run
  intentionally recorded failures/timeouts for follow-up rather than changing
  code.
final_summary: >-
  Completed an isolated 325-file test runtime baseline. No file exceeded 30
  seconds under the enforced cap; two files timed out near 29 seconds and seven
  failed. Full structured evidence and per-file logs are in the temporary
  report.
acceptance_criteria:
  - index: 1
    text: >-
      Every discovered TypeScript test file is invoked separately with a
      30-second process-group deadline
    checked: true
  - index: 2
    text: >-
      The report records wall time, result, exit code, parsed test durations
      when available, and log paths
    checked: true
  - index: 3
    text: >-
      Slow, near-threshold, failed, and timed-out files are identified without
      modifying production or test code
    checked: true
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
