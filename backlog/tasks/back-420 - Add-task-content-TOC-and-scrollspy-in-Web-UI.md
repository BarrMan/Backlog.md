---
task_schema_version: 2
id: BACK-420
title: Add task content TOC and scrollspy in Web UI
status: To Do
assignee:
  - '@alex-agent'
created_date: '2026-04-25 12:14'
labels:
  - web-ui
  - content-viewer
  - enhancement
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/405'
priority: low
description: >-
  Track part of GitHub issue #405: add a table of contents and active-heading
  behavior for long task content.
acceptance_criteria:
  - index: 1
    text: Markdown headings in task content produce stable in-page anchors.
    checked: false
  - index: 2
    text: >-
      Long task content can show a table of contents with active-heading
      indication.
    checked: false
  - index: 3
    text: The TOC remains usable without obscuring content on narrow screens.
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
