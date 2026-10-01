---
task_schema_version: 2
id: BACK-712
title: Repair isolated test expectation regressions
status: In Progress
assignee:
  - '@imri-barr'
created_date: '2026-09-30 13:25'
updated_date: '2026-09-30 18:57'
labels: []
dependencies: []
type: chore
ordinal: 346000
description: >-
  The isolated test-runtime baseline recorded seven failing files while
  implementation work was occurring concurrently. Diagnose the captured failure
  summaries and repair only clear stale test expectations or fixtures without
  changing production code or shared test helpers.
implementation_plan: >-
  1. Expose a fixture-level waiter for the server WebSocket publication event.
  2. Register the waiter before each external task, config, root, or branch
  write and await it before asserting the refreshed endpoint state. 3. Preserve
  malformed-config failure and stale-scope assertions, then run each owned file
  in a separate hard-capped 30-second invocation.


  4. Update composer storage assertions for v2 frontmatter-only records and make
  creation-render checks measure only the completed board outcome; retain real
  Git hook/signing/race integration coverage. 5. Run this file under the
  existing 10-second test timeout and record its duration.


  6. Make BrowserServices directory watcher callbacks data-only; cover null
  filename delivery deterministically and verify lifecycle, scope, and
  statistics suites.
implementation_notes: >-
  Captured-log diagnoses: board-hide-empty-columns and list-window passed when
  rerun independently, so their profiler failures were concurrent-run artifacts.
  Repaired stale custom-directory Core fixture expectations in core,
  enhanced-init, and cli-json-output; repaired MCP fixture reloads to use a
  fresh operation Core; and repaired duplicate-ID web fetch setup for the
  required /api/status scope bootstrap. Independent 30-second-capped results:
  board 1.204s pass, list-window 0.440s pass, core 26.93s pass, enhanced-init
  0.983s pass, cli-json-output 13.92s pass, duplicate-ID 0.768s pass. MCP has
  one remaining product failure: serialized multiline Definition-of-Done
  defaults reload literal \n rather than a newline. Likely production correction
  is in src/file-system/config.ts parseDefinitionOfDone (lines 287-294):
  distinguish legacy escaped input from serializeConfig's JSON newline escape
  before choosing the parse result. No production code was changed.


  User-authorized production fix: parseDefinitionOfDone now selects the normal
  YAML result when it contains a serialized multiline value, while retaining the
  legacy bare-backslash fallback and full-document alias fallback. Added direct
  config round-trip coverage and a task-mutation filesystem-fallback regression.
  Independent hard-capped results: mcp-definition-of-done-defaults 0.884s (5
  pass), definition-of-done 2.86s (12 pass), task-mutation-service 0.499s (1
  pass). Targeted Biome passed; bun run check . remains blocked by unrelated
  concurrent formatting/import errors in project-task-graph, task-detail,
  dependency-graph, and readiness.


  Replaced immediate post-edit endpoint reads in server-search,
  server-statistics, and server-tasks-spa-fallback with watcher-publication
  synchronization. Search uses an opened scoped WebSocket; the fixture observes
  real hub publication calls for in-process fixtures. Hard-capped results:
  search passes in 16.32s and statistics passes in 2.29s. SPA remains a
  production blocker: after BrowserServices publishes its watcher error for
  malformed config, /api/config and /api/task/BACK-1 still return stale 200
  responses instead of the required 500. Assertion retained; no lifecycle code
  changed.


  Composer regression diagnosis and fix: (1)  expected a v1 Markdown description
  body; it now asserts v2 , YAML-escaped description, and an empty opaque body.
  (2)  now supplies the real watcher-style task delivery before resolving
  persistence. (3-5) watcher delivery , , and  counted incidental modal/focus
  screen draws; they now wait for the created row and assert its focus. Real Git
  hook, signing, index, and race integration cases remain unchanged.
  Verification: bun test v1.3.10 (30e609e0) 74 pass, 0 fail, 511 assertions,
  33.26s; Checked 1 file in 48ms. No fixes applied. and targeted  passed.


  Correction to the preceding shell-expanded note: the five fixed tests are:
  persists mid-field astral insertions from both text fields without corrupting
  their caret; opens the actual composer on an empty board and renders and
  focuses once after first-task creation; and watcher delivery before
  persistence resolves, before the composer closes, and after board success. The
  first now checks v2 frontmatter-only YAML serialization (schema version,
  escaped description, no body). The remaining four use watcher-equivalent
  delivery and wait for the visible focused created task instead of counting
  modal and focus draws. Git hook, signing, index, and race integration cases
  are unchanged. Final dedicated run: bun test --timeout=10000
  src/test/tui-task-composer.test.ts: 74 pass, 0 fail, 511 assertions, 33.26s.
  Targeted Biome and diff checks passed.


  Watcher ownership repair: BrowserServices directory watchers now invalidate
  data only; watchConfigFile watches both the active config and root config
  candidate, and reports stable invalid content through onConfigInvalid so
  reconciliation fails closed without native directory classification. Added
  deterministic null root/Git callback coverage with no timers. Focused
  hard-capped results: server-lifecycle 2.63s (12 pass), server-runtime-scope
  1.364s (3 pass), server-statistics-endpoint 2.60s (5 pass), config-watcher
  10.40s (10 pass). Targeted Biome, tsc, and diff check passed.


  Finalized config recovery without native directory ownership: a dedicated
  config-content recovery watcher handles post-error repairs, while a queued
  reconcile is restarted after a settling failure. Final hard-capped runs:
  lifecycle 2.37s (12 pass), runtime scope 1.339s (3 pass), statistics 2.55s (5
  pass); config-watcher 10.58s (10 pass).
acceptance_criteria:
  - index: 1
    text: >-
      Each of the seven owned test files has a recorded diagnosis from its
      captured log
    checked: true
  - index: 2
    text: Only clear test-local stale expectations or fixtures are changed
    checked: true
  - index: 3
    text: >-
      Each changed owned file passes in a separate hard-capped 30-second
      invocation
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
