---
task_schema_version: 2
id: BACK-453
title: Stabilize Windows CI test suite
status: Done
assignee:
  - '@codex'
created_date: '2026-04-29 17:49'
labels: []
dependencies: []
description: >-
  Windows lint/unit CI is failing intermittently on main with test timeouts and
  EMFILE errors under the full Bun test suite. Stabilize the CI test command
  and/or affected tests so Windows CI is reliable without masking real failures.
acceptance_criteria:
  - index: 1
    text: Windows CI lint-and-unit-test completes reliably
    checked: true
  - index: 2
    text: The fix avoids broad unrelated test rewrites
    checked: true
  - index: 3
    text: Local targeted validation covers the changed CI/test behavior
    checked: true
definition_of_done:
  - index: 1
    text: >-
      bunx tsc --noEmit passes when TypeScript touched (not applicable;
      TypeScript was not touched)
    checked: true
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: true
  - index: 3
    text: bun test (or scoped test) passes
    checked: true
comments: []
---
