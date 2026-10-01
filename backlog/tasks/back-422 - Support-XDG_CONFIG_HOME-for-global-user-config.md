---
task_schema_version: 2
id: BACK-422
title: Support XDG_CONFIG_HOME for global user config
status: To Do
assignee:
  - '@alex-agent'
created_date: '2026-04-25 12:14'
labels:
  - config
  - xdg
  - enhancement
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/464'
priority: medium
description: >-
  Track GitHub issue #464: global user config should respect the XDG Base
  Directory Specification where applicable.
acceptance_criteria:
  - index: 1
    text: Global user config reads and writes under XDG_CONFIG_HOME when it is set.
    checked: false
  - index: 2
    text: >-
      Existing legacy config paths continue to work or migrate with documented
      precedence.
    checked: false
  - index: 3
    text: Tests cover XDG and fallback path resolution.
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
