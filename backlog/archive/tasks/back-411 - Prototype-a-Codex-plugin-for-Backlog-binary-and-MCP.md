---
task_schema_version: 2
id: BACK-411
title: Prototype a Codex plugin for Backlog binary and MCP
status: In Progress
assignee:
  - '@codex'
created_date: '2026-04-03 05:57'
updated_date: '2026-08-07 21:28'
labels: []
dependencies: []
documentation:
  - README.md
  - DEVELOPMENT.md
  - /Users/alex/.codex/skills/.system/plugin-creator/SKILL.md
description: >-
  Create an initial Codex plugin that makes Backlog easy to install and use
  inside Codex without manual MCP setup. The result should demonstrate a clear
  path for packaging the shipped Backlog executable model inside a plugin while
  preserving Backlog's MCP-first workflow and public CLI surface.
implementation_notes: >-
  Retired 2026-08-07 by maintainer decision: wait until Codex releases a native
  way to handle plugins before any Codex-specific packaging. The still-live
  pieces moved on: the plugin manifest target became the Agent Plugins 1.0.0
  standard (BACK-595), and the mcp start project-root-resolution question is
  owned by BACK-594. Also noted: the Agent Plugins spec forbids plugins shipping
  or installing binaries, which invalidates this task's AC #2 approach.
acceptance_criteria:
  - index: 1
    text: >-
      A valid Codex plugin prototype exists with the required manifest and
      companion files.
    checked: false
  - index: 2
    text: >-
      The prototype documents or encodes how Backlog binaries are obtained per
      platform in a way consistent with the npm release model.
    checked: false
  - index: 3
    text: >-
      The prototype provides a Codex-friendly MCP entry point for running
      backlog mcp start, including a project-root resolution strategy.
    checked: false
  - index: 4
    text: >-
      Local install and testing instructions are included so the plugin can be
      exercised from a Backlog-enabled project.
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
