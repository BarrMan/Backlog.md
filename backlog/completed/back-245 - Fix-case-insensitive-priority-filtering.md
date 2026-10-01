---
task_schema_version: 2
id: BACK-245
title: Fix case-insensitive priority filtering
status: Done
assignee:
  - '@codex'
created_date: '2025-08-30 08:51'
updated_date: '2025-08-30 08:55'
labels: []
dependencies: []
description: |-
  ## Acceptance Criteria
  <!-- AC:BEGIN -->
  - [x] #1 Ensure priority filter accepts mixed-case values
  <!-- AC:END -->
implementation_notes: >-
  Ensured CLI priority filter handles mixed-case values and adjusted tests
  accordingly
acceptance_criteria:
  - index: 1
    text: Ensure priority filter accepts mixed-case values
    checked: true
definition_of_done: []
comments: []
---
