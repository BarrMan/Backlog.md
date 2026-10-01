---
task_schema_version: 2
id: BACK-56
title: Simplify TUI blessed import
status: Done
assignee:
  - '@codex'
created_date: '2025-06-14'
updated_date: '2025-06-14'
labels:
  - refactor
dependencies: []
description: Remove dynamic loading of blessed library
implementation_notes: |-
  Simplified all UI modules to import `blessed` directly since Bun bundles
  dependencies. Removed runtime fallbacks and updated tests accordingly.
acceptance_criteria:
  - index: 1
    text: Blessed imported statically across UI modules
    checked: true
  - index: 2
    text: Dynamic import helpers removed
    checked: true
  - index: 3
    text: Tests and build succeed
    checked: true
  - index: 4
    text: Task committed to repository
    checked: true
definition_of_done: []
comments: []
---
