---
task_schema_version: 2
id: BACK-567
title: Stop idle browser refresh loop from duplicate task preview
status: Done
assignee:
  - '@Codex'
created_date: '2026-08-02 22:21'
updated_date: '2026-08-02 22:37'
labels: []
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/834'
priority: high
type: bug
ordinal: 210000
description: >-
  Backlog.md v1.49.0 and v1.49.1 can enter a browser/server feedback loop while
  idle: duplicate-task preview refreshes the local identity corpus, publishes
  tasks-updated despite unchanged files, and triggers another full UI reload.
  Stop the spurious publication without changing duplicate detection or repair
  behavior.
implementation_plan: >-
  1. Add a focused regression that initializes the Core-owned ContentStore,
  repeats duplicate-task preview without filesystem changes, and asserts no task
  publication after the initial snapshot while a real corpus change still
  publishes.

  2. Narrow the ContentStore local-corpus publication gate so semantic task and
  identity equality suppresses unchanged previews without altering duplicate
  detection, repair, watcher, or browser behavior.

  3. Run focused duplicate-repair/ContentStore/server tests, TypeScript, Biome,
  build, full relevant tests, and diff review; then finalize BACK-567 and
  publish a ready PR linked to issue #834.
implementation_notes: >-
  Fail-first evidence: the initialized Core preview emitted one tasks event for
  an unchanged corpus, reproducing the WebSocket feedback trigger. The fix
  refreshes the active/completed identity snapshot for duplicate preview without
  publishing the read back to task listeners; adding a real duplicate between
  previews is still detected. Focused duplicate repair, ContentStore, and server
  duplicate-repair suites pass 79/79 with 348 assertions. TypeScript, Biome
  across 350 files, production build, and diff-check pass. The initial full bun
  test run encountered one unrelated default-timeout failure in task-type
  filtering documentation after 6.46s; the impacted suites in that run passed
  and the full run continued while the ready hotfix PR was prepared.
final_summary: >-
  Stopped duplicate-task preview from publishing its own local-corpus refresh
  back through tasks-updated while preserving refreshed duplicate detection.
  Verified the exact unchanged-preview event regression, real duplicate
  observation, 79 focused tests, TypeScript, Biome, build, and diff hygiene.
acceptance_criteria:
  - index: 1
    text: An unchanged duplicate-task preview does not publish a tasks-updated event
    checked: true
  - index: 2
    text: >-
      The browser remains idle after its initial duplicate-task preview when
      repository task files do not change
    checked: true
  - index: 3
    text: Duplicate-task preview still observes real task corpus changes
    checked: true
  - index: 4
    text: Regression tests cover the event-publication boundary
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
