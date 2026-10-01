---
task_schema_version: 2
id: BACK-714
title: Fail closed after server configuration reconciliation errors
status: Done
assignee:
  - '@opencode'
created_date: '2026-09-30 13:58'
updated_date: '2026-09-30 13:59'
labels: []
dependencies: []
type: bug
ordinal: 348000
description: >-
  A malformed configuration observed by the server watcher records a
  reconciliation error but requests can still use the previously selected
  project binding. Protected operations must not proceed against that stale
  binding until a valid reconciliation succeeds.
implementation_plan: >-
  1. Guard new request-scope creation on the lifecycle reconciliation error
  while retaining the selected binding for in-flight scopes. 2. Preserve the
  existing successful-recovery clear and API status/version exemptions. 3. Run
  the lifecycle and SPA fallback regression files with a 30-second hard
  deadline.
implementation_notes: >-
  Added a readiness-gated request-scope check in the protected API pre-handler.
  Status/version retain their exemption and already-captured scopes are
  unchanged. Verified with gtimeout --signal=TERM --kill-after=1s 30s bun test
  --timeout=10000 src/test/server-lifecycle.test.ts (11 pass, 2.44s) and
  src/test/server-tasks-spa-fallback.test.ts (29 pass, 19.31s).
final_summary: >-
  Protected API requests now fail closed while configuration reconciliation is
  errored; successful reconciliation restores the selected binding. Verified by
  the lifecycle and SPA fallback regressions under 30-second hard timeouts.
acceptance_criteria:
  - index: 1
    text: >-
      After a watcher-driven configuration reconciliation error, protected API
      requests return 500 instead of using the stale selected binding
    checked: true
  - index: 2
    text: >-
      A successful reconciliation clears the failure and restores protected API
      requests without rebuilding a graph per request
    checked: true
  - index: 3
    text: >-
      Requests that already captured a scope remain immutable while later
      requests fail closed
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
    checked: true
comments: []
---
