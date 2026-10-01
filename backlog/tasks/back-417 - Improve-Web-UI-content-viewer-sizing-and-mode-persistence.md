---
task_schema_version: 2
id: BACK-417
title: Improve Web UI content viewer sizing and mode persistence
status: To Do
assignee:
  - '@alex-agent'
created_date: '2026-04-25 12:14'
labels:
  - web-ui
  - editor
  - enhancement
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/291'
priority: low
description: >-
  Track GitHub issue #291: improve the content viewer/editor ergonomics in the
  Web UI.
acceptance_criteria:
  - index: 1
    text: >-
      Long content has a wider responsive viewing/editing surface without layout
      overlap.
    checked: false
  - index: 2
    text: The chosen view/edit mode is persisted appropriately for the user/session.
    checked: false
  - index: 3
    text: >-
      Browser verification or automated coverage confirms the modal remains
      usable on desktop and mobile widths.
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
