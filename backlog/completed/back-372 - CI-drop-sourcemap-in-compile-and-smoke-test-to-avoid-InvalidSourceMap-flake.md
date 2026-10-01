---
task_schema_version: 2
id: BACK-372
title: 'CI: drop sourcemap in compile-and-smoke-test to avoid InvalidSourceMap flake'
status: Done
assignee:
  - '@codex'
created_date: '2026-01-21 21:26'
updated_date: '2026-01-21 21:27'
labels: []
dependencies: []
references:
  - >-
    https://github.com/MrLesk/Backlog.md/actions/runs/21226066767/job/61073229991?pr=494
  - 'https://github.com/MrLesk/Backlog.md/pull/496'
description: >-
  CI compile-and-smoke-test intermittently fails on Ubuntu with
  `InvalidSourceMap` from `bun build ... --sourcemap`. Remove `--sourcemap` from
  the smoke-test build step (keep release builds unchanged).
implementation_plan: >-
  1) Edit .github/workflows/ci.yml compile-and-smoke-test build step to remove
  --sourcemap.

  2) Ensure release workflow remains unchanged.

  3) Confirm no other CI steps are modified.

  4) Summarize change and note tests (not run for workflow change).
implementation_notes: >-
  Removed `--sourcemap` from CI compile-and-smoke-test build step to avoid Bun
  InvalidSourceMap flake. Release workflow unchanged. Tests not run
  (workflow-only change).


  PR: https://github.com/MrLesk/Backlog.md/pull/496
acceptance_criteria:
  - index: 1
    text: compile-and-smoke-test build step no longer passes `--sourcemap` in CI.
    checked: true
  - index: 2
    text: Release workflow still builds with sourcemaps as before.
    checked: true
  - index: 3
    text: No other CI steps are removed or altered.
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
