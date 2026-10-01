---
task_schema_version: 2
id: BACK-38
title: 'CLI: Improved Agent Selection for Init'
status: Done
assignee:
  - '@AI'
created_date: '2025-06-10'
updated_date: '2025-06-10'
labels: []
dependencies: []
description: >-
  Implement interactive checkbox-style selection for agents during 'backlog
  init'. Users should select one or multiple agents using space or enter,
  similar to modern CLI tools.
implementation_notes: |-
  - Added `prompts` dependency for interactive CLI prompts.
  - Replaced numeric input with `multiselect` checkbox prompt in `src/cli.ts`.
  - Supports selecting multiple agent instruction files with space/enter.
acceptance_criteria:
  - index: 1
    text: Interactive checkbox UI replaces current agent selection
    checked: true
  - index: 2
    text: Users can select one or multiple agents using space and confirm with enter
    checked: true
  - index: 3
    text: Works consistently across Node and Bun runtimes
    checked: true
  - index: 4
    text: Task committed to repository
    checked: true
definition_of_done: []
comments: []
---
