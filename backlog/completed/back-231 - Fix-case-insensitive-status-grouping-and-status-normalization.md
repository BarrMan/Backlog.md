---
task_schema_version: 2
id: BACK-231
title: Fix case-insensitive status grouping and status normalization
status: Done
assignee:
  - '@codex'
created_date: '2025-08-12 19:39'
updated_date: '2025-08-12 19:40'
labels: []
dependencies: []
description: >-
  Fix board export and TUI grouping to treat statuses case-insensitively (merge
  "To Do"/"To do"), ensure tasks like task-228 appear under the correct column,
  and validate/normalize status on create/edit. Includes tests.
implementation_notes: >-
  Implemented case-insensitive grouping for board export and TUI; added status
  normalization + validation in CLI create/edit; added tests; verified full
  suite passes.
acceptance_criteria:
  - index: 1
    text: Board export groups statuses case-insensitively (no duplicate columns)
    checked: true
  - index: 2
    text: >-
      TUI board groups statuses case-insensitively and shows tasks under
      canonical status
    checked: true
  - index: 3
    text: >-
      Status is validated and normalized on task create/edit; invalid statuses
      error
    checked: true
  - index: 4
    text: All tests pass and README board export renders correct columns
    checked: true
definition_of_done: []
comments: []
---
