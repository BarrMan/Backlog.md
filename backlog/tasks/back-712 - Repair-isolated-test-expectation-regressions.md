---
id: BACK-712
title: Repair isolated test expectation regressions
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-09-30 13:25'
updated_date: '2026-09-30 13:56'
labels: []
dependencies: []
type: chore
ordinal: 346000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The isolated test-runtime baseline recorded seven failing files while implementation work was occurring concurrently. Diagnose the captured failure summaries and repair only clear stale test expectations or fixtures without changing production code or shared test helpers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each of the seven owned test files has a recorded diagnosis from its captured log
- [x] #2 Only clear test-local stale expectations or fixtures are changed
- [ ] #3 Each changed owned file passes in a separate hard-capped 30-second invocation
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Expose a fixture-level waiter for the server WebSocket publication event. 2. Register the waiter before each external task, config, root, or branch write and await it before asserting the refreshed endpoint state. 3. Preserve malformed-config failure and stale-scope assertions, then run each owned file in a separate hard-capped 30-second invocation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Captured-log diagnoses: board-hide-empty-columns and list-window passed when rerun independently, so their profiler failures were concurrent-run artifacts. Repaired stale custom-directory Core fixture expectations in core, enhanced-init, and cli-json-output; repaired MCP fixture reloads to use a fresh operation Core; and repaired duplicate-ID web fetch setup for the required /api/status scope bootstrap. Independent 30-second-capped results: board 1.204s pass, list-window 0.440s pass, core 26.93s pass, enhanced-init 0.983s pass, cli-json-output 13.92s pass, duplicate-ID 0.768s pass. MCP has one remaining product failure: serialized multiline Definition-of-Done defaults reload literal \n rather than a newline. Likely production correction is in src/file-system/config.ts parseDefinitionOfDone (lines 287-294): distinguish legacy escaped input from serializeConfig's JSON newline escape before choosing the parse result. No production code was changed.

User-authorized production fix: parseDefinitionOfDone now selects the normal YAML result when it contains a serialized multiline value, while retaining the legacy bare-backslash fallback and full-document alias fallback. Added direct config round-trip coverage and a task-mutation filesystem-fallback regression. Independent hard-capped results: mcp-definition-of-done-defaults 0.884s (5 pass), definition-of-done 2.86s (12 pass), task-mutation-service 0.499s (1 pass). Targeted Biome passed; bun run check . remains blocked by unrelated concurrent formatting/import errors in project-task-graph, task-detail, dependency-graph, and readiness.

Replaced immediate post-edit endpoint reads in server-search, server-statistics, and server-tasks-spa-fallback with watcher-publication synchronization. Search uses an opened scoped WebSocket; the fixture observes real hub publication calls for in-process fixtures. Hard-capped results: search passes in 16.32s and statistics passes in 2.29s. SPA remains a production blocker: after BrowserServices publishes its watcher error for malformed config, /api/config and /api/task/BACK-1 still return stale 200 responses instead of the required 500. Assertion retained; no lifecycle code changed.
<!-- SECTION:NOTES:END -->
