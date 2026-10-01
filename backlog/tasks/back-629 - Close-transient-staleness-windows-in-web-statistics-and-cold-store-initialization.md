---
task_schema_version: 2
id: BACK-629
title: >-
  Close transient staleness windows in web statistics and cold store
  initialization
status: To Do
assignee: []
created_date: '2026-08-10 07:04'
labels: []
dependencies: []
priority: low
ordinal: 265000
description: >-
  Two single-request staleness windows flagged by Codex on PR #899 (BACK-624),
  verified plausible on code read; both self-heal on the next request, so they
  were deferred from the v1.50.1 hotfix. (1) src/server/index.ts
  handleGetStatistics: priorities prefer the config loaded before
  refreshTasksForTaskRead (currentConfig) while statuses prefer the post-refresh
  corpus config, so a config change landing mid-request can pair refreshed
  tasks/statuses with stale priority buckets for one response; derive both from
  the refreshed corpus or reload config after the refresh. (2)
  src/core/backlog.ts getTask: storeAlreadyReady is captured before
  getContentStore(), so the read that performs cold initialization skips the
  reconciliation pass warm reads get; a task file changed after the initial
  corpus read but before watchers bind can be served stale once. Run a
  local-corpus reconciliation after joining cold initialization without
  repeating the cross-branch scan.
acceptance_criteria:
  - index: 1
    text: >-
      Statistics responses derive statuses and priorities from the same config
      generation as the tasks they count
    checked: false
  - index: 2
    text: >-
      The first read after cold store initialization reconciles the local corpus
      before responding
    checked: false
  - index: 3
    text: Regression tests cover both windows
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
