---
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
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A malformed configuration observed by the server watcher records a reconciliation error but requests can still use the previously selected project binding. Protected operations must not proceed against that stale binding until a valid reconciliation succeeds.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 After a watcher-driven configuration reconciliation error, protected API requests return 500 instead of using the stale selected binding
- [x] #2 A successful reconciliation clears the failure and restores protected API requests without rebuilding a graph per request
- [x] #3 Requests that already captured a scope remain immutable while later requests fail closed
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Guard new request-scope creation on the lifecycle reconciliation error while retaining the selected binding for in-flight scopes. 2. Preserve the existing successful-recovery clear and API status/version exemptions. 3. Run the lifecycle and SPA fallback regression files with a 30-second hard deadline.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added a readiness-gated request-scope check in the protected API pre-handler. Status/version retain their exemption and already-captured scopes are unchanged. Verified with gtimeout --signal=TERM --kill-after=1s 30s bun test --timeout=10000 src/test/server-lifecycle.test.ts (11 pass, 2.44s) and src/test/server-tasks-spa-fallback.test.ts (29 pass, 19.31s).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Protected API requests now fail closed while configuration reconciliation is errored; successful reconciliation restores the selected binding. Verified by the lifecycle and SPA fallback regressions under 30-second hard timeouts.
<!-- SECTION:FINAL_SUMMARY:END -->
