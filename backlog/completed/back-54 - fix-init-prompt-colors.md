---
task_schema_version: 2
id: BACK-54
title: 'CLI: fix init prompt colors'
status: Done
assignee:
  - '@codex'
created_date: '2025-06-13'
updated_date: '2025-06-13'
labels:
  - bug
dependencies: []
description: >-
  The interactive project name prompt shown during `backlog init` uses the
  blessed

  TUI. On some terminals all text appears black on a black background, making
  the

  prompt unreadable. The UI also feels unnecessarily heavy for a simple
  question.
implementation_notes: |-
  Added explicit foreground/background styles in `promptText()` and
  `multiSelect()` so blessed widgets render with white text on black background.
  This keeps the interface simple and readable while retaining the TUI features.
acceptance_criteria:
  - index: 1
    text: '`backlog init` shows a readable prompt for the project name'
    checked: true
  - index: 2
    text: Text is visible on dark terminals
    checked: true
  - index: 3
    text: Tests continue to pass
    checked: true
definition_of_done: []
comments: []
---
