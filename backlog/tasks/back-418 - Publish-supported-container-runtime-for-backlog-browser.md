---
task_schema_version: 2
id: BACK-418
title: Publish supported container runtime for backlog browser
status: To Do
assignee:
  - '@alex-agent'
created_date: '2026-04-25 12:14'
labels:
  - packaging
  - docker
  - enhancement
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/335'
priority: medium
description: >-
  Track GitHub issue #335: provide an official containerized way to run the
  browser UI.
acceptance_criteria:
  - index: 1
    text: >-
      A supported Dockerfile or image can run backlog browser against a mounted
      project directory.
    checked: false
  - index: 2
    text: 'The container path documents port, volume, and no-open behavior.'
    checked: false
  - index: 3
    text: >-
      The release or publishing path for the image is documented or
      intentionally deferred.
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
