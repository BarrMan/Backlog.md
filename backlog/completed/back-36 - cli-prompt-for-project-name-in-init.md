---
task_schema_version: 2
id: BACK-36
title: 'CLI: Prompt for project name in init'
status: Done
assignee:
  - '@codex'
created_date: '2025-06-10'
updated_date: '2025-06-10'
labels: []
dependencies: []
description: >-
  Allow `backlog init` to run without specifying a project name. When omitted,
  the CLI should prompt for the name before proceeding.
implementation_notes: >-
  - Updated `src/cli.ts` to accept optional project name and prompt when
  omitted.

  - Added integration test covering prompt behavior in `src/test/cli.test.ts`.
acceptance_criteria:
  - index: 1
    text: '`backlog init` works without project name parameter'
    checked: true
  - index: 2
    text: 'When project name is missing, CLI prompts for it before initialization'
    checked: true
  - index: 3
    text: Task committed to repository
    checked: true
definition_of_done: []
comments: []
---
