---
task_schema_version: 2
id: BACK-1
title: 'CLI: Setup Core Project (Bun, TypeScript, Git, Linters)'
status: Done
assignee:
  - '@MrLesk'
reporter: '@MrLesk'
created_date: '2025-06-03'
labels:
  - cli
  - setup
milestone: m-1
dependencies:
  - task-0
description: >-
  Initialize the actual Bun + TypeScript project. Configure linters (Biome),
  basic testing framework (Bun test).
acceptance_criteria:
  - index: 1
    text: Bun project initialized (`bun init`).
    checked: true
  - index: 2
    text: TypeScript configured.
    checked: true
  - index: 3
    text: Biome configured and working.
    checked: true
  - index: 4
    text: Basic `bun test` example runs.
    checked: true
  - index: 5
    text: Project `README.md` created.
    checked: true
definition_of_done: []
comments: []
---
