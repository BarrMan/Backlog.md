---
task_schema_version: 2
id: BACK-438
title: Add automatic core-level task drift detection
status: To Do
assignee:
  - '@alex-agent'
created_date: '2026-04-25 21:37'
labels:
  - feature
  - core
  - web
  - mcp
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/556'
  - 'https://github.com/MrLesk/Backlog.md/pull/591'
  - >-
    backlog/tasks/back-412 -
    Add-touched-files-field-to-tasks-and-filename-based-search.md
priority: medium
description: >-
  GitHub issue #556 and PR #591 propose detecting when tasks become stale
  relative to code changes. Do not implement this as a primarily manual CLI-only
  `backlog drift` command. Build it as shared core behavior so Web UI, MCP,
  server/API, and any CLI presentation consume the same task drift signals
  automatically.


  Important existing context: BACK-412 already added `modifiedFiles` /
  `modified_files` task metadata across Core, CLI, MCP, server, web API, and
  shared search. This task should reuse that field, plus existing `references`,
  instead of inventing a separate tracking model. The goal is that agents and UI
  consumers see actionable drift while using normal task list/search/statistics
  flows, without needing users to remember to run a separate drift check.
acceptance_criteria:
  - index: 1
    text: >-
      Core exposes a shared deterministic task drift/health model that can be
      consumed by CLI, Web UI/server, and MCP without duplicating detection
      logic.
    checked: false
  - index: 2
    text: >-
      Drift detection uses existing task metadata, especially `modifiedFiles`
      and file-path `references`, and ignores external URLs/non-file references
      safely.
    checked: false
  - index: 3
    text: >-
      Drift signals are computed or refreshed automatically during normal task
      loading/search/statistics flows; the primary workflow does not require a
      manual `backlog drift` command.
    checked: false
  - index: 4
    text: >-
      Web/API and MCP surfaces expose enough drift information for agents and
      users to find affected tasks without relying on CLI-only output.
    checked: false
  - index: 5
    text: >-
      The behavior has a clear false-positive policy: checks are deterministic,
      path handling is project-root-relative, and informational states are not
      reported as blocking errors unless they require action.
    checked: false
  - index: 6
    text: >-
      Existing `modifiedFiles`, `references`, task search, and statistics
      behavior remain backward compatible.
    checked: false
  - index: 7
    text: >-
      Automated coverage includes core drift behavior plus at least one Web/API
      consumer path and one MCP consumer path.
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
